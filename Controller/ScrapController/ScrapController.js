// userController.js
import axios from "axios";
import * as ScrapModel from "../../Model/ScrapModel.js";
import extractJsonFromHtml from "../../_helpers/extractJsonFromHtml.js";
import findSnapshots from "../../_helpers/findSnapshots.js";
import { ApifyClient } from "apify-client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import supabase from "../../utlis/supabaseClient.js";
import { exec } from "child_process";
import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import OpenAI from "openai";


ffmpeg.setFfmpegPath(ffmpegPath);

const userController = {
  getUser: (req, res) => {
    const username = req.params.username;
    const user = ScrapModel.findUserByUsername(username);
    if (user) {
      res.json(user);
    } else {
      res.status(404).send("User not found");
    }
  },
  createUser: (req, res) => {
    const { username, email } = req.body;
    const newUser = ScrapModel.createUser(username, email);
    // Simulate saving to a database
    res.status(201).json(newUser);
  },
};
// Initialize the ApifyClient with API token
const client = new ApifyClient({
  token: "apify_api_q9EHdnh1W8ihCovKdEyCZcciZNh5Kr2a68kw",
});
// Prepare Actor input

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const checkSupabaseResult = (result) => {
  const err = result?.error;
  if (err) {
    throw err;
  }
};

export const mapPlatformToEnum = (platform) => {
  switch (platform) {
    case "facebook":
      return "facebook";
    case "instagram":
      return "instagram";
    case "messenger":
      return "messenger";
    case "audience_network":
      return "audience-network";
    default:
      return "facebook";
  }
};

export const findTopMatch = (texts, search) => {
  const words = search.split(" ");
  let topMatch = null;
  let topMatchCount = 0;

  for (const text of texts) {
    let count = 0;
    for (const word of words) {
      if (text.toLowerCase().includes(word.toLowerCase())) {
        count++;
      }
    }
    if (count > topMatchCount) {
      topMatch = text;
      topMatchCount = count;
    }
  }

  return topMatch;
};
export const parseFacebookAdLibraryRequest = (data, options) => {
  const pageData =
    data.page?.jsmods?.pre_display_requires?.[0]?.[3]?.[1]?.__bbox?.result.data;
  const page = pageData?.page;
  const adCardData = data;
  const adCopy = adCardData?.snapshot?.body?.text;
  const snapshot = adCardData.snapshot;
  const newBrand = {
    name: page?.name || adCardData?.snapshot?.page_name,
    logo_url:
      page?.profile_pic_uri || adCardData?.snapshot?.page_profile_picture_url,
    category:
      pageData?.ad_library_page_info?.page_info?.page_category ||
      adCardData?.snapshot?.page_categories[0],
    description: null,
    platform: "facebook",
    platform_id: page?.id || adCardData?.snapshot?.page_id?.toString(),
    platform_url: page?.url || adCardData?.snapshot?.page_profile_uri,
  };
  const adCategories = Object.values(snapshot?.page_categories)
    .map((category) => findTopMatch(options.categories, category))
    .filter((category) => !!category);
  const newAd = {
    platform_id: adCardData.ad_archive_id.toString(),
    ad_copy: adCopy,
    country_code: snapshot.country_iso_code ? [snapshot.country_iso_code] : [],
    categories: adCategories,
    live_status: adCardData.is_active ? "active" : "inactive",
    cta_type: snapshot.cta_type,
    cta_text: snapshot.cta_text,
    cta_link: snapshot.link_url,
    tags: [],
    publisher_platforms: adCardData.publisher_platform,
    start_date: new Date(adCardData.start_date * 1000).toISOString(),
    end_date: new Date(adCardData.end_date * 1000).toISOString(),
    raw_data: data,
  };
  const newAssets = [];
  if (snapshot.cards.length > 0) {
    snapshot.cards.forEach((card) => {
      if (card.original_image_url) {
        newAssets.push({
          thumbnail_url: card.resized_image_url,
          media_sd_url: null,
          media_hd_url: card.original_image_url,
          media_type: "image",
        });
      } else if (card.video_hd_url) {
        newAssets.push({
          thumbnail_url: card.video_preview_image_url,
          media_sd_url: card.video_sd_url,
          media_hd_url: card.video_hd_url,
          media_type: "video",
        });
      }
    });
  } else {
    snapshot.images.forEach((image) => {
      newAssets.push({
        thumbnail_url: image.resized_image_url,
        media_sd_url: null,
        media_hd_url: image.original_image_url,
        media_type: "image",
      });
    });

    snapshot.videos.forEach((video) => {
      newAssets.push({
        thumbnail_url: video.video_preview_image_url,
        media_sd_url: video.video_sd_url,
        media_hd_url: video.video_hd_url,
        media_type: "video",
      });
    });
  }
  return {
    brand: newBrand,
    ad: newAd,
    assets: newAssets,
  };
};

const uploadAsset = async (assetUrl, mediaType) => {
  if (!assetUrl) {
    return res.status(400).json({ error: "Missing video URL" });
  }
  console.log(assetUrl);
  try {
    const isVideo = assetUrl.includes(".mp4");
    const mediaType = isVideo ? "video" : "image";
    const extension = isVideo ? "mp4" : "jpg";
    const contentType = isVideo ? "video/mp4" : "image/jpeg";
    const fileName = `${Date.now()}.${extension}`;
    const filePath = path.join(__dirname, fileName);

    const response = await axios.get(assetUrl, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.facebook.com/",
      },
    });
    const BUCKET_NAME = "assets";

    fs.writeFileSync(filePath, response.data);
    const { data: uploadedFile, error: uploadError } = await supabase.storage
      .from("assets")
      .upload(fileName, response.data, {
        upsert: true,
      });

    if (uploadError) {
      console.error(" Supabase Upload Error:", uploadError.message);
      return { error: uploadError };
    }
    console.log(` File uploaded to Supabase: ${uploadedFile}`);
    fs.unlinkSync(filePath);
    return {
      contentType,
      uploadedFile,
      media_type: mediaType,
    };
  } catch (error) {
    console.error(`Error uploading asset: ${error}`);
    return { error: error, assetUrl };
  }
};


const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const extractAudio = async (videoPath, audioPath) => {

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .toFormat("mp3")
      .audioBitrate("32k")
      .audioChannels(1)
      .output(audioPath)
      .on("end", () => {
        // Add a slight delay to ensure the file system has finished writing the file
        setTimeout(() => {
          if (!fs.existsSync(audioPath)) {
            return reject(new Error(`Audio file not found after ffmpeg finished: ${audioPath}`));
          }

          try {
            const fileSize = fs.statSync(audioPath)?.size / (1024 * 1024);

            resolve(audioPath);
          } catch (err) {
            console.error("Error reading audio file stats:", err);
            reject(err);
          }
        }, 100); // Delay of 100ms
      })
      .on("error", (err) => {
        console.error("Error extracting/compressing audio:", err);
        reject(err);
      })
      .run();
  });
};


const transcribeAudio = async (audioPath) => {

  // const audioData = fs.readFileSync(audioPath);
  // const response = await axios.post("https://api-inference.huggingface.co/models/openai/whisper-large-v3-turbo", audioData, {
  //   headers: {
  //     Authorization: `Bearer ${HF_API_KEY}`,
  //     "Content-Type": "audio/mpeg",
  //   },
  // });
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: "whisper-1", // The recommended model for general-purpose speech to text
  });


  return transcription.text;


};

const generateHooks = async (text) => {
  const prompt = `
  Analyze the following ad transcript and extract the most compelling hooks. Hooks should be short, attention-grabbing, and effective at capturing interest. Provide the hooks as a JSON array.
  
  Transcript: 
  """${text}"""
  
  Hooks (JSON array):`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        { role: "system", content: "You are an expert in marketing and ad analysis." },
        { role: "user", content: prompt },
      ],
      max_tokens: 150,
      temperature: 0,
    });

    let hooksText = response.choices[0].message.content.trim();

    // Remove potential markdown code block wrappers
    hooksText = hooksText.replace(/^```json\n/, "").replace(/\n```$/, "");

    // Parse JSON
    const hooks = JSON.parse(hooksText);
    return hooks;
  } catch (error) {
    console.error("Error generating hooks:", error);
    return [];
  }
};


const processVideo = async (videoUrl) => {
  try {
    const videoPath = path.join(__dirname, "temp.mp4");
    const audioPath = path.join(__dirname, "temp.mp3");

    const response = await axios.get(videoUrl, { responseType: "arraybuffer" });
    fs.writeFileSync(videoPath, response.data);

    await extractAudio(videoPath, audioPath);

    if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size === 0) {
      console.error("Extracted audio file is empty or missing:", audioPath);
      return { transcript: null, hooks: [] };
    }

    const transcript = await transcribeAudio(audioPath);
    const hooks = await generateHooks(transcript);

    // Check if files exist before attempting to delete
    if (fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }

    return { transcript, hooks };
  } catch (error) {
    console.error("Error processing video:", error);
    return { transcript: null, hooks: [] };
  }
};



const formatPersona = (personaString) => {
  const lines = personaString.split('\n');
  let personName = '';
  let descriptionLines = [];
  let nameFound = false;

  for (const line of lines) {
    if (line.startsWith('**Persona Name:**')) {
      personName = line.substring('**Persona Name:**'.length).trim();
      nameFound = true;
    } else if (nameFound) {
      descriptionLines.push(line);
    }
  }

  // Join lines and then remove ** and \n
  let description = descriptionLines.join(' ').trim(); // Join with space instead of newline
  description = description.replace(/\*\*/g, '').trim(); // Remove **
  description = description.replace(/\n/g, ' ').trim(); // Remove remaining \n (though should be none after the first replace)
  description = description.replace(/\s+/g, ' '); // Remove extra spaces created by removing ** and \n

  return {
    personName: personName,
    Description: description,
  };
}

const createPersonaFromTranscript = async (transcript) => {

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "system",
          content: `Analyze this ad script  and return a structured list of personas based on inferred demographic and psychographic characteristics. 
                    Include:
                            Persona name
                            Age range
                            Key traits
                            Primary needs/pain points
                            Matching ads (optional)
                            Estimated longest-running duration (based on historical benchmarks)
                  `,
        },
        {
          role: "user",
          content: `Here is the transcript: "${transcript} give only one person NOTE: Don't give multiple person"`,
        },
      ], temperature: 0
    });

    if (completion.choices && completion.choices.length > 0) {
      const persona = completion.choices[0].message.content;
      const res = formatPersona(persona)

      return res;
    } else {
      console.warn("No persona generated.");
      return null;
    }
  } catch (error) {
    console.error("Error creating persona:", error);
    throw error;
  }
}


const generateHeadline = async (body) => {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "system",
          content: `Analyze this ad script and return a headline for ad it should be good and concise`,
        },
        {
          role: "user",
          content: `Here is the ad script: "${body}"`,
        },
      ], temperature: 0, top_p: 0.2
    });

    if (completion.choices && completion.choices.length > 0) {
      const headline = completion.choices[0].message.content;

      return headline;
    } else {
      console.warn("No headline generated.");
      return null;
    }
  } catch (error) {
    console.error("Error creating headline:", error);
    throw error;
  }
}

const ASSETS_BUCKET = "assets";

const adTrackerController = {
  trackAd: async (req, res) => {
    const adId = req.body.adURL;
    const folderId = req.body.folderId;
    const userId = req.body.user_id;
    const input = {
      urls: [
        {
          url: adId,
        },
      ],
      "scrapePageAds.activeStatus": "all",
      period: "",
    };
    // const response = await axios(adId);
    // const jsonData = extractJsonFromHtml(response?.data);

    // jsonData.forEach((json) => {
    //   const snapshots = findSnapshots(json);
    //   allSnapshots = allSnapshots.concat(snapshots);
    // });
    // const length = allSnapshots.length;

    (async () => {
      // Run the Actor and wait for it to finish
      let scrappingData = [];
      const run = await client.actor("XtaWFhbtfxyzqrFmd").call(input);
      // Fetch and print Actor results from the run's dataset (if any)
      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      items.forEach((item) => {
        scrappingData = scrappingData.concat(item);
      });

      // let scrappingData = [{
      //   "ad_archive_id": "557749506622153",
      //   "ad_id": null,
      //   "archive_types": [],
      //   "categories": [
      //     "UNKNOWN"
      //   ],
      //   "collation_count": 3,
      //   "collation_id": "1258593788668517",
      //   "contains_digital_created_media": false,
      //   "contains_sensitive_content": false,
      //   "currency": "",
      //   "end_date": 1744786800,
      //   "entity_type": "PERSON_PROFILE",
      //   "fev_info": null,
      //   "gated_type": "ELIGIBLE",
      //   "has_user_reported": false,
      //   "hidden_safety_data": false,
      //   "hide_data_status": "NONE",
      //   "impressions_with_index": {
      //     "impressions_text": null,
      //     "impressions_index": -1
      //   },
      //   "is_aaa_eligible": true,
      //   "is_active": true,
      //   "is_profile_page": false,
      //   "menu_items": [],
      //   "page_id": "106303752098912",
      //   "page_is_deleted": false,
      //   "page_name": "Curvy-faja",
      //   "political_countries": [],
      //   "publisher_platform": [
      //     "FACEBOOK",
      //     "INSTAGRAM",
      //     "AUDIENCE_NETWORK",
      //     "MESSENGER"
      //   ],
      //   "reach_estimate": null,
      //   "regional_regulation_data": {
      //     "finserv": {
      //       "is_deemed_finserv": false,
      //       "is_limited_delivery": false
      //     },
      //     "tw_anti_scam": {
      //       "is_limited_delivery": true
      //     }
      //   },
      //   "report_count": null,
      //   "snapshot": {
      //     "body": {
      //       "text": "Then don't miss our clearance sale!😍\nPay with code: 𝙛𝙖𝙟𝙖💖Get 10% off\nBuy new sale items while they last!"
      //     },
      //     "branded_content": null,
      //     "brazil_tax_id": null,
      //     "byline": null,
      //     "caption": "curvy-faja.com",
      //     "cards": [],
      //     "cta_text": "Shop now",
      //     "cta_type": "SHOP_NOW",
      //     "country_iso_code": null,
      //     "current_page_name": "Curvy-faja",
      //     "disclaimer_label": null,
      //     "display_format": "VIDEO",
      //     "event": null,
      //     "images": [],
      //     "is_reshared": false,
      //     "link_description": null,
      //     "link_url": "https://curvy-faja.com/products/women-fajas-bodyshaper-2033-22092041-1",
      //     "page_categories": [
      //       "Clothing (Brand)"
      //     ],
      //     "page_entity_type": "PERSON_PROFILE",
      //     "page_id": "106303752098912",
      //     "page_is_deleted": false,
      //     "page_is_profile_page": false,
      //     "page_like_count": 315801,
      //     "page_name": "Curvy-faja",
      //     "page_profile_picture_url": "https://scontent-lhr8-2.xx.fbcdn.net/v/t39.35426-6/464337046_565487416011615_3003700285283842553_n.jpg?stp=dst-jpg_s60x60_tt6&_nc_cat=101&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=pxQut3YUHx0Q7kNvwH1wdsT&_nc_oc=AdnSyDMHDMxmn_m5exKHs4g8r21KhP0qStOfJ9wskygdogqIO61FA9npPtbYF8dLaXf-qRYJui89hM710qYo7HgP&_nc_zt=14&_nc_ht=scontent-lhr8-2.xx&_nc_gid=QlVm0tNk9w4LWz5QuNiwtQ&oh=00_AfGsZGqE8kLcRb2dj6oSKXABP_Va2Sfc3AUDnZTD5zZKtQ&oe=68058AB3",
      //     "page_profile_uri": "https://www.facebook.com/100083049946365/",
      //     "root_reshared_post": null,
      //     "title": null,
      //     "videos": [
      //       {
      //         "video_hd_url": "https://video-lhr6-1.xx.fbcdn.net/v/t42.1790-2/464533115_557749553288815_2962199114930450117_n.?_nc_cat=110&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=CPW-U8NqeiQQ7kNvwEnTx4K&_nc_oc=Adl9ZxYZqj4B0-2Ov_8BKES3QSxg5djrG_9fng4NTRSwKUgv0gJmIxg0M7b538lUdWUSb89mXJgk-Ro42iQcanKb&_nc_zt=28&_nc_ht=video-lhr6-1.xx&_nc_gid=QlVm0tNk9w4LWz5QuNiwtQ&oh=00_AfHD59HLXVHjPfDYRBAV8zYAqmMRFvALUXgeaAA9eAlTZA&oe=680561C5",
      //         "video_preview_image_url": "https://scontent-lhr6-1.xx.fbcdn.net/v/t39.35426-6/464277299_1263503054841236_6759625373866225682_n.jpg?_nc_cat=109&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=yN6OReecbxgQ7kNvwHrSAON&_nc_oc=AdmjO4g_lY6kaigg6EPGdXLtEpU0JZiS-ht18oSzfd_kVlHm7UxJwmNKFh1FTICVFsEPWCyrpB0ry0ZJCfF_L0n3&_nc_zt=14&_nc_ht=scontent-lhr6-1.xx&_nc_gid=QlVm0tNk9w4LWz5QuNiwtQ&oh=00_AfGZKs3lzxFfNFfg9mH01ZNspgu91uWzsWZyRJTLvRnX4A&oe=68055BB1",
      //         "video_sd_url": "https://video-lhr8-1.xx.fbcdn.net/v/t42.1790-2/435638794_1451061688835761_4719419807983719822_n.mp4?_nc_cat=107&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=ZmnUJrTtWzAQ7kNvwHr_qN_&_nc_oc=AdlgC7IRT6m0H5gvgZO7kf0uTdyXVO-K-PCHjkjwB8bysGaGnWNqW_HvVFZNy1P1FQI8UXAq4snPwky8OGn862vh&_nc_zt=28&_nc_ht=video-lhr8-1.xx&_nc_gid=QlVm0tNk9w4LWz5QuNiwtQ&oh=00_AfG0lnaYFDfPFSmCWq92kIBjRfQypgmbrIJp2lhHxaysNQ&oe=6805623F",
      //         "watermarked_video_hd_url": "",
      //         "watermarked_video_sd_url": ""
      //       }
      //     ],
      //     "additional_info": null,
      //     "ec_certificates": [],
      //     "extra_images": [],
      //     "extra_links": [],
      //     "extra_texts": [],
      //     "extra_videos": []
      //   },
      //   "spend": null,
      //   "start_date": 1729753200,
      //   "state_media_run_label": null,
      //   "targeted_or_reached_countries": [],
      //   "total_active_time": null,
      //   "url": "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=IN&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=106303752098912",
      //   "total": 28
      // },
      // {
      //   "ad_archive_id": "849192297418770",
      //   "ad_id": null,
      //   "archive_types": [],
      //   "categories": [
      //     "UNKNOWN"
      //   ],
      //   "collation_count": null,
      //   "collation_id": "1258593788668517",
      //   "contains_digital_created_media": false,
      //   "contains_sensitive_content": false,
      //   "currency": "",
      //   "end_date": 1744786800,
      //   "entity_type": "PERSON_PROFILE",
      //   "fev_info": null,
      //   "gated_type": "ELIGIBLE",
      //   "has_user_reported": false,
      //   "hidden_safety_data": false,
      //   "hide_data_status": "NONE",
      //   "impressions_with_index": {
      //     "impressions_text": null,
      //     "impressions_index": -1
      //   },
      //   "is_aaa_eligible": true,
      //   "is_active": true,
      //   "is_profile_page": false,
      //   "menu_items": [],
      //   "page_id": "106303752098912",
      //   "page_is_deleted": false,
      //   "page_name": "Curvy-faja",
      //   "political_countries": [],
      //   "publisher_platform": [
      //     "FACEBOOK",
      //     "INSTAGRAM",
      //     "AUDIENCE_NETWORK",
      //     "MESSENGER"
      //   ],
      //   "reach_estimate": null,
      //   "regional_regulation_data": {
      //     "finserv": {
      //       "is_deemed_finserv": false,
      //       "is_limited_delivery": false
      //     },
      //     "tw_anti_scam": {
      //       "is_limited_delivery": true
      //     }
      //   },
      //   "report_count": null,
      //   "snapshot": {
      //     "body": {
      //       "text": "Then don't miss our clearance sale!😍\nPay with code: 𝙛𝙖𝙟𝙖💖Get 10% off\nBuy new sale items while they last!"
      //     },
      //     "branded_content": null,
      //     "brazil_tax_id": null,
      //     "byline": null,
      //     "caption": "curvy-faja.com",
      //     "cards": [],
      //     "cta_text": "Shop now",
      //     "cta_type": "SHOP_NOW",
      //     "country_iso_code": null,
      //     "current_page_name": "Curvy-faja",
      //     "disclaimer_label": null,
      //     "display_format": "VIDEO",
      //     "event": null,
      //     "images": [],
      //     "is_reshared": false,
      //     "link_description": null,
      //     "link_url": "https://curvy-faja.com/products/women-fajas-bodyshaper-2033-22092041-1",
      //     "page_categories": [
      //       "Clothing (Brand)"
      //     ],
      //     "page_entity_type": "PERSON_PROFILE",
      //     "page_id": "106303752098912",
      //     "page_is_deleted": false,
      //     "page_is_profile_page": false,
      //     "page_like_count": 315801,
      //     "page_name": "Curvy-faja",
      //     "page_profile_picture_url": "https://scontent-lhr8-2.xx.fbcdn.net/v/t39.35426-6/464310807_1196379128328893_5414944746979019643_n.jpg?stp=dst-jpg_s60x60_tt6&_nc_cat=101&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=LkdWdmla37AQ7kNvwH0H137&_nc_oc=AdmVe9920lWGn0Wypp55yPKPxY2mo3dr1PJF398-db-09VBlfCQucrMWwPyS6l9XP7wWbY6hidzraBgb1eUjejGQ&_nc_zt=14&_nc_ht=scontent-lhr8-2.xx&_nc_gid=QlVm0tNk9w4LWz5QuNiwtQ&oh=00_AfHFrfQjLtr38997li798ggo-uIEGbVX5hjQE9WzhC_VYA&oe=68057FB2",
      //     "page_profile_uri": "https://www.facebook.com/100083049946365/",
      //     "root_reshared_post": null,
      //     "title": null,
      //     "videos": [
      //       {
      //         "video_hd_url": "https://video-lhr8-2.xx.fbcdn.net/v/t42.1790-2/464471306_849192327418767_381376151106401189_n.?_nc_cat=101&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=ZWchk0bJ8FMQ7kNvwHT6OQg&_nc_oc=AdlY-kgDcyF8mJLGg5ZEEw7U-ne0grHQhSXZnpuL0d3lSZSNJn0-mPsR7Ov1Vr_X_oarVFfuFgqTznlaEhReHq5P&_nc_zt=28&_nc_ht=video-lhr8-2.xx&_nc_gid=QlVm0tNk9w4LWz5QuNiwtQ&oh=00_AfHUHqE4ZW4AkArZL2A4scgw5T8BP6syr0AYThKu-dyQ9w&oe=68057D91",
      //         "video_preview_image_url": "https://scontent-lhr8-2.xx.fbcdn.net/v/t39.35426-6/464075616_397031150148374_3572744796307778994_n.jpg?_nc_cat=101&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=3NhQlnhMYXwQ7kNvwFNNEwz&_nc_oc=Adnl3O4Go51v2vzwP2hlgrghsXxPIpSan9q7cCfNnB6-1vctn95FmH4fqLAfh6LLh7KcF9PqQmICVFfXKg_SQLrM&_nc_zt=14&_nc_ht=scontent-lhr8-2.xx&_nc_gid=QlVm0tNk9w4LWz5QuNiwtQ&oh=00_AfGhcOSm9GxXRHSzqnre5AcujfcLNkdAwiVenP3K2VCpCQ&oe=68056639",
      //         "video_sd_url": "https://video-lhr8-1.xx.fbcdn.net/v/t42.1790-2/435638794_1451061688835761_4719419807983719822_n.mp4?_nc_cat=107&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=ZmnUJrTtWzAQ7kNvwHr_qN_&_nc_oc=AdlgC7IRT6m0H5gvgZO7kf0uTdyXVO-K-PCHjkjwB8bysGaGnWNqW_HvVFZNy1P1FQI8UXAq4snPwky8OGn862vh&_nc_zt=28&_nc_ht=video-lhr8-1.xx&_nc_gid=QlVm0tNk9w4LWz5QuNiwtQ&oh=00_AfG0lnaYFDfPFSmCWq92kIBjRfQypgmbrIJp2lhHxaysNQ&oe=6805623F",
      //         "watermarked_video_hd_url": "",
      //         "watermarked_video_sd_url": ""
      //       }
      //     ],
      //     "additional_info": null,
      //     "ec_certificates": [],
      //     "extra_images": [],
      //     "extra_links": [],
      //     "extra_texts": [],
      //     "extra_videos": []
      //   },
      //   "spend": null,
      //   "start_date": 1729753200,
      //   "state_media_run_label": null,
      //   "targeted_or_reached_countries": [],
      //   "total_active_time": null,
      //   "url": "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=IN&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=106303752098912",
      //   "total": 28
      // },
      // {
      //   "ad_archive_id": "745104347803973",
      //   "ad_id": null,
      //   "archive_types": [],
      //   "categories": [
      //     "UNKNOWN"
      //   ],
      //   "collation_count": 1,
      //   "collation_id": "1634017314127198",
      //   "contains_digital_created_media": false,
      //   "contains_sensitive_content": false,
      //   "currency": "",
      //   "end_date": 1744786800,
      //   "entity_type": "PERSON_PROFILE",
      //   "fev_info": null,
      //   "gated_type": "ELIGIBLE",
      //   "has_user_reported": false,
      //   "hidden_safety_data": false,
      //   "hide_data_status": "NONE",
      //   "impressions_with_index": {
      //     "impressions_text": null,
      //     "impressions_index": -1
      //   },
      //   "is_aaa_eligible": true,
      //   "is_active": true,
      //   "is_profile_page": false,
      //   "menu_items": [],
      //   "page_id": "106303752098912",
      //   "page_is_deleted": false,
      //   "page_name": "Curvy-faja",
      //   "political_countries": [],
      //   "publisher_platform": [
      //     "FACEBOOK",
      //     "INSTAGRAM",
      //     "AUDIENCE_NETWORK",
      //     "MESSENGER"
      //   ],
      //   "reach_estimate": null,
      //   "regional_regulation_data": {
      //     "finserv": {
      //       "is_deemed_finserv": false,
      //       "is_limited_delivery": false
      //     },
      //     "tw_anti_scam": {
      //       "is_limited_delivery": true
      //     }
      //   },
      //   "report_count": null,
      //   "snapshot": {
      //     "body": {
      //       "text": "Then don't miss our clearance sale!😍\nPay with code: 𝙛𝙖𝙟𝙖💖Get 10% off\nBuy new sale items while they last!"
      //     },
      //     "branded_content": null,
      //     "brazil_tax_id": null,
      //     "byline": null,
      //     "caption": "curvy-faja.com",
      //     "cards": [],
      //     "cta_text": "Shop now",
      //     "cta_type": "SHOP_NOW",
      //     "country_iso_code": null,
      //     "current_page_name": "Curvy-faja",
      //     "disclaimer_label": null,
      //     "display_format": "VIDEO",
      //     "event": null,
      //     "images": [],
      //     "is_reshared": false,
      //     "link_description": null,
      //     "link_url": "https://curvy-faja.com/products/women-fajas-bodyshaper-2033-22092041-1",
      //     "page_categories": [
      //       "Clothing (Brand)"
      //     ],
      //     "page_entity_type": "PERSON_PROFILE",
      //     "page_id": "106303752098912",
      //     "page_is_deleted": false,
      //     "page_is_profile_page": false,
      //     "page_like_count": 315801,
      //     "page_name": "Curvy-faja",
      //     "page_profile_picture_url": "https://scontent-lhr8-2.xx.fbcdn.net/v/t39.35426-6/464570432_472915445773227_7189297536065595610_n.jpg?stp=dst-jpg_s60x60_tt6&_nc_cat=106&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=earbu2sB2zwQ7kNvwHxCA4T&_nc_oc=AdnurcvtWur0wuhKQmnIsJ2xw4ojojm7GEaNo-xjv_EQQ-bJELoky-6iHr0S4EikwoJRZyk26fQ6b4spbEwKcudy&_nc_zt=14&_nc_ht=scontent-lhr8-2.xx&_nc_gid=QlVm0tNk9w4LWz5QuNiwtQ&oh=00_AfF5UhnSAscRhgZfHdo99NsU-o-S66WeQs4IYrKMsvTrRw&oe=680584D5",
      //     "page_profile_uri": "https://www.facebook.com/100083049946365/",
      //     "root_reshared_post": null,
      //     "title": null,
      //     "videos": [
      //       {
      //         "video_hd_url": "https://video-lhr6-1.xx.fbcdn.net/v/t42.1790-2/464571572_745104391137302_8074279735263179172_n.?_nc_cat=109&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=BzeBTQ97RHMQ7kNvwF4idla&_nc_oc=Adkx44h9cBrayBh-vWMSaZLBC-OSCdBdxyEOAUahZ7D9oyz6VQ7OLJrWG2u9Z3JiBHGv8FuObV8WHqlM7qX7OO4D&_nc_zt=28&_nc_ht=video-lhr6-1.xx&_nc_gid=QlVm0tNk9w4LWz5QuNiwtQ&oh=00_AfG1hiOC7xpe48aHvKgqpx3rqItMHL-IiIHqmzHYIL5EKQ&oe=68056BF2",
      //         "video_preview_image_url": "https://scontent-lhr8-1.xx.fbcdn.net/v/t39.35426-6/464197570_1977116276066364_5090169453656990328_n.jpg?_nc_cat=108&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=VRfx4tRUoHQQ7kNvwEVuvtE&_nc_oc=AdkZtiUbCl_wztFJntkwRMvanct-jKkqd41uR2WyE0uuFOh2ehdOpvs-v_jtAiarpwH_Y818bDroNyxlMIX-zJNe&_nc_zt=14&_nc_ht=scontent-lhr8-1.xx&_nc_gid=QlVm0tNk9w4LWz5QuNiwtQ&oh=00_AfFejTeTdzCF725FSaEPL8J7TXiIMWs0wdDpL9bWDV8LpQ&oe=68056E57",
      //         "video_sd_url": "https://video-lhr8-1.xx.fbcdn.net/v/t42.1790-2/435638794_1451061688835761_4719419807983719822_n.mp4?_nc_cat=107&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=ZmnUJrTtWzAQ7kNvwHr_qN_&_nc_oc=AdlgC7IRT6m0H5gvgZO7kf0uTdyXVO-K-PCHjkjwB8bysGaGnWNqW_HvVFZNy1P1FQI8UXAq4snPwky8OGn862vh&_nc_zt=28&_nc_ht=video-lhr8-1.xx&_nc_gid=QlVm0tNk9w4LWz5QuNiwtQ&oh=00_AfG0lnaYFDfPFSmCWq92kIBjRfQypgmbrIJp2lhHxaysNQ&oe=6805623F",
      //         "watermarked_video_hd_url": "",
      //         "watermarked_video_sd_url": ""
      //       }
      //     ],
      //     "additional_info": null,
      //     "ec_certificates": [],
      //     "extra_images": [],
      //     "extra_links": [],
      //     "extra_texts": [],
      //     "extra_videos": []
      //   },
      //   "spend": null,
      //   "start_date": 1729753200,
      //   "state_media_run_label": null,
      //   "targeted_or_reached_countries": [],
      //   "total_active_time": null,
      //   "url": "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=IN&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=106303752098912",
      //   "total": 28
      // },
      // {
      //   "ad_archive_id": "551562313911505",
      //   "ad_id": null,
      //   "archive_types": [],
      //   "categories": [
      //     "UNKNOWN"
      //   ],
      //   "collation_count": 1,
      //   "collation_id": "560189343116277",
      //   "contains_digital_created_media": false,
      //   "contains_sensitive_content": false,
      //   "currency": "",
      //   "end_date": 1744700400,
      //   "entity_type": "PERSON_PROFILE",
      //   "fev_info": null,
      //   "gated_type": "ELIGIBLE",
      //   "has_user_reported": false,
      //   "hidden_safety_data": false,
      //   "hide_data_status": "NONE",
      //   "impressions_with_index": {
      //     "impressions_text": null,
      //     "impressions_index": -1
      //   },
      //   "is_aaa_eligible": true,
      //   "is_active": true,
      //   "is_profile_page": false,
      //   "menu_items": [],
      //   "page_id": "106303752098912",
      //   "page_is_deleted": false,
      //   "page_name": "Curvy-faja",
      //   "political_countries": [],
      //   "publisher_platform": [
      //     "FACEBOOK",
      //     "INSTAGRAM",
      //     "AUDIENCE_NETWORK",
      //     "MESSENGER"
      //   ],
      //   "reach_estimate": null,
      //   "regional_regulation_data": {
      //     "finserv": {
      //       "is_deemed_finserv": false,
      //       "is_limited_delivery": false
      //     },
      //     "tw_anti_scam": {
      //       "is_limited_delivery": true
      //     }
      //   },
      //   "report_count": null,
      //   "snapshot": {
      //     "body": {
      //       "text": "¡Entonces no te pierdas nuestra venta de liquidación!😍\nPaga con el código: 𝙛𝙖𝙟𝙖💖Obtén un 10 % de descuento\n¡Compre artículos nuevos en oferta mientras duren!"
      //     },
      //     "branded_content": null,
      //     "brazil_tax_id": null,
      //     "byline": null,
      //     "caption": "curvy-faja.com",
      //     "cards": [],
      //     "cta_text": "Shop now",
      //     "cta_type": "SHOP_NOW",
      //     "country_iso_code": null,
      //     "current_page_name": "Curvy-faja",
      //     "disclaimer_label": null,
      //     "display_format": "VIDEO",
      //     "event": null,
      //     "images": [],
      //     "is_reshared": false,
      //     "link_description": null,
      //     "link_url": "https://curvy-faja.com/products/slimming-bodyshaper-pre-sale-cvy231104163-1",
      //     "page_categories": [
      //       "Clothing (Brand)"
      //     ],
      //     "page_entity_type": "PERSON_PROFILE",
      //     "page_id": "106303752098912",
      //     "page_is_deleted": false,
      //     "page_is_profile_page": false,
      //     "page_like_count": 315801,
      //     "page_name": "Curvy-faja",
      //     "page_profile_picture_url": "https://scontent-lhr8-2.xx.fbcdn.net/v/t39.35426-6/447720853_1383208525681878_3724893442703397229_n.jpg?stp=dst-jpg_s60x60_tt6&_nc_cat=101&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=h3TBO446HPYQ7kNvwF8YEFq&_nc_oc=Adl8Eo5ooy9YfUmcvB6nSVGyc2cV9eFQrVRDUQZ7v4aWh1fFmJRZAUmuLc-rW2wAGZOEVOgPHipF1-QK4Aaryn9e&_nc_zt=14&_nc_ht=scontent-lhr8-2.xx&_nc_gid=QlVm0tNk9w4LWz5QuNiwtQ&oh=00_AfHizPdm5Vxy5z7_tH-zvSooP6f3xeIAAgeTrDUsoAOCrA&oe=68057C4F",
      //     "page_profile_uri": "https://www.facebook.com/100083049946365/",
      //     "root_reshared_post": null,
      //     "title": null,
      //     "videos": [
      //       {
      //         "video_hd_url": "https://video-lhr6-1.xx.fbcdn.net/v/t42.1790-2/447984006_1151353592852970_2447200595979671408_n.?_nc_cat=110&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=Ewt0TnKK0cUQ7kNvwECsH3D&_nc_oc=AdlDy0NSoC2boUaF6ly-BAv4E_8lE6_jMc-UYBH6Dh8XuCpEolGlpOMUDtx_t-3Cdg1yaxuXzzFuMdBzLSgCqkco&_nc_zt=28&_nc_ht=video-lhr6-1.xx&_nc_gid=QlVm0tNk9w4LWz5QuNiwtQ&oh=00_AfG7W-HroUexnv2G3rBd9uL--YrjqHmchskZUatPx7Lalw&oe=680559D1",
      //         "video_preview_image_url": "https://scontent-lhr6-1.xx.fbcdn.net/v/t39.35426-6/447674867_1078009036529767_6143144731959173118_n.jpg?_nc_cat=102&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=ucs6PcU52JsQ7kNvwF_yKNU&_nc_oc=AdnXus3Jgf7wOTGEhCdZzTgqLn1QGby225c6Rzz8wzAADY_kWkx8VP3w_0yBG_bpv4wDuWGlOJLaGKr_hWN9OKKg&_nc_zt=14&_nc_ht=scontent-lhr6-1.xx&_nc_gid=QlVm0tNk9w4LWz5QuNiwtQ&oh=00_AfG8_I4SDWjdhftuxEeeX0FFh4IuBPKFC33DzcD-ZGytLQ&oe=68058086",
      //         "video_sd_url": "https://video-lhr8-1.xx.fbcdn.net/v/t42.1790-2/447966128_1140738147142826_7368599118672006421_n.mp4?_nc_cat=107&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=yadT7R5ALiYQ7kNvwEOQQTX&_nc_oc=AdnIkC9wzTGKTZ_HiFAQIogNkN-B0SwD9lXJtIhoo-f3R6D73axBu2Yt0GsB1CKmR9WrnyP9-ezZVMdADMbsVoC9&_nc_zt=28&_nc_ht=video-lhr8-1.xx&_nc_gid=QlVm0tNk9w4LWz5QuNiwtQ&oh=00_AfGenKLNLXXe7Vn8TeANgIxKIRxMYlZHa4JgCuGPCyv6EA&oe=68057E15",
      //         "watermarked_video_hd_url": "",
      //         "watermarked_video_sd_url": ""
      //       }
      //     ],
      //     "additional_info": null,
      //     "ec_certificates": [],
      //     "extra_images": [],
      //     "extra_links": [],
      //     "extra_texts": [],
      //     "extra_videos": []
      //   },
      //   "spend": null,
      //   "start_date": 1728802800,
      //   "state_media_run_label": null,
      //   "targeted_or_reached_countries": [],
      //   "total_active_time": null,
      //   "url": "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=IN&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=106303752098912",
      //   "total": 28
      // },
      // {
      //   "ad_archive_id": "803683148505119",
      //   "ad_id": null,
      //   "archive_types": [],
      //   "categories": [
      //     "UNKNOWN"
      //   ],
      //   "collation_count": 2,
      //   "collation_id": "187534873739517",
      //   "contains_digital_created_media": false,
      //   "contains_sensitive_content": false,
      //   "currency": "",
      //   "end_date": 1744700400,
      //   "entity_type": "PERSON_PROFILE",
      //   "fev_info": null,
      //   "gated_type": "ELIGIBLE",
      //   "has_user_reported": false,
      //   "hidden_safety_data": false,
      //   "hide_data_status": "NONE",
      //   "impressions_with_index": {
      //     "impressions_text": null,
      //     "impressions_index": -1
      //   },
      //   "is_aaa_eligible": true,
      //   "is_active": true,
      //   "is_profile_page": false,
      //   "menu_items": [],
      //   "page_id": "106303752098912",
      //   "page_is_deleted": false,
      //   "page_name": "Curvy-faja",
      //   "political_countries": [],
      //   "publisher_platform": [
      //     "FACEBOOK",
      //     "INSTAGRAM",
      //     "AUDIENCE_NETWORK",
      //     "MESSENGER"
      //   ],
      //   "reach_estimate": null,
      //   "regional_regulation_data": {
      //     "finserv": {
      //       "is_deemed_finserv": false,
      //       "is_limited_delivery": false
      //     },
      //     "tw_anti_scam": {
      //       "is_limited_delivery": true
      //     }
      //   },
      //   "report_count": null,
      //   "snapshot": {
      //     "body": {
      //       "text": "¡Venta de liquidación! Obtenga un 10% de descuento en su compra.\nCódigo de descuento: faja\n¡Puede contactarnos para comprar!"
      //     },
      //     "branded_content": null,
      //     "brazil_tax_id": null,
      //     "byline": null,
      //     "caption": "curvy-faja.com",
      //     "cards": [],
      //     "cta_text": "Shop now",
      //     "cta_type": "SHOP_NOW",
      //     "country_iso_code": null,
      //     "current_page_name": "Curvy-faja",
      //     "disclaimer_label": null,
      //     "display_format": "VIDEO",
      //     "event": null,
      //     "images": [],
      //     "is_reshared": false,
      //     "link_description": null,
      //     "link_url": "https://curvy-faja.com/es/products/hourglass-waistband-23041182-1",
      //     "page_categories": [
      //       "Clothing (Brand)"
      //     ],
      //     "page_entity_type": "PERSON_PROFILE",
      //     "page_id": "106303752098912",
      //     "page_is_deleted": false,
      //     "page_is_profile_page": false,
      //     "page_like_count": 315801,
      //     "page_name": "Curvy-faja",
      //     "page_profile_picture_url": "https://scontent-lhr8-1.xx.fbcdn.net/v/t39.35426-6/448898826_982867223622150_5124883634338874804_n.jpg?stp=dst-jpg_s60x60_tt6&_nc_cat=111&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=HlCbu2VC-TcQ7kNvwGIYehY&_nc_oc=AdlGNlmbTO91iZltMKcbd5ZVuI7F4kexbARmkpdd4wF6i211fyQdqtcvS5TbMFoJgpCcEvzDLZoWIO3pUXev_F0d&_nc_zt=14&_nc_ht=scontent-lhr8-1.xx&_nc_gid=QlVm0tNk9w4LWz5QuNiwtQ&oh=00_AfExDpWb0Le-ZCl8BChhQgbSt9XtkpylrpIK0fmYsQOT9Q&oe=68058637",
      //     "page_profile_uri": "https://www.facebook.com/100083049946365/",
      //     "root_reshared_post": null,
      //     "title": "Para ti",
      //     "videos": [
      //       {
      //         "video_hd_url": "https://video-lhr8-1.xx.fbcdn.net/v/t42.1790-2/448932529_833604258665600_3769747587298711247_n.?_nc_cat=107&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=5fQCy0XwdOYQ7kNvwGuqQuG&_nc_oc=AdkHG0k6l5jn7N1ptBn3Pa5zBE3wvYTfSDIIhrqKzV-G4p0KHO7C4H_-wB6JRfErkLE74lzW0e61vCwkjlEnav3p&_nc_zt=28&_nc_ht=video-lhr8-1.xx&_nc_gid=QlVm0tNk9w4LWz5QuNiwtQ&oh=00_AfFMn-Hpt0HDxfJWAY3ZndIsujnonluI9KN3AD3H7qHAAA&oe=68056C3A",
      //         "video_preview_image_url": "https://scontent-lhr6-2.xx.fbcdn.net/v/t39.35426-6/448829073_7332641430175778_4771004050704261091_n.jpg?_nc_cat=100&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=3QniZqPO9qUQ7kNvwGxymzh&_nc_oc=Adkr12OmsRCeyZOtWdjRvQOYJQSPLX9Y8Qt0xZKT3EgijmJV-w49C23E0hINc5zgMnC9J1M4VK3HtGEUKSNNRFXI&_nc_zt=14&_nc_ht=scontent-lhr6-2.xx&_nc_gid=QlVm0tNk9w4LWz5QuNiwtQ&oh=00_AfG1-ymF8VpGqbQoPsmFI9EvgxIlrcNL6J7e_7MhYeZDMA&oe=6805609F",
      //         "video_sd_url": "https://video-lhr8-1.xx.fbcdn.net/v/t42.1790-2/343714882_194425896740641_6128939970774789503_n.mp4?_nc_cat=108&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=CiLxM3dInnAQ7kNvwHLkk3j&_nc_oc=AdmGUOBResabcoHpdAijooIII9ZGLwXCvHOBXY8mfXOYden6wPVTu1pmqLJLajLkWq9QthSZe5iATVt5rUp7BWgE&_nc_zt=28&_nc_ht=video-lhr8-1.xx&_nc_gid=QlVm0tNk9w4LWz5QuNiwtQ&oh=00_AfH6s8NNyfCthihtX3j5QDGeN3bSgdW2bsYnDvq38oXixA&oe=68058519",
      //         "watermarked_video_hd_url": "",
      //         "watermarked_video_sd_url": ""
      //       }
      //     ],
      //     "additional_info": null,
      //     "ec_certificates": [],
      //     "extra_images": [],
      //     "extra_links": [],
      //     "extra_texts": [],
      //     "extra_videos": []
      //   },
      //   "spend": null,
      //   "start_date": 1726383600,
      //   "state_media_run_label": null,
      //   "targeted_or_reached_countries": [],
      //   "total_active_time": null,
      //   "url": "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=IN&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=106303752098912",
      //   "total": 28
      // },];


      // res.status(200).send(allSnapshots);


      if (scrappingData && scrappingData.length > 0) {
        const categories = await supabase
          .from("categories")
          .select("*")
          .then((res) => res.data?.map((c) => c.code) || []);
        const results = await Promise.all(
          scrappingData.map(async (adItem) => {
            const parsedData = parseFacebookAdLibraryRequest(adItem, {
              categories,
            });

            let assetsUploded = [];
            let logoResults = [];
            let transccipt = []
            let hooks = []
            let persosnaDes = []
            const headline = await generateHeadline(parsedData.ad.ad_copy)
            if (parsedData?.brand?.logo_url) {
              try {
                const logoPath = `brands/${parsedData.brand.platform_id}`;
                const logoResult = await uploadAsset(
                  // supabase,
                  // ASSETS_BUCKET,
                  // logoPath,
                  parsedData.brand.logo_url,
                  "image"
                );
                if (logoResult) {
                  logoResults.push(logoResult);
                } else {
                  console.error("Failed to upload logo asset");
                }
              } catch (error) {
                console.error("Error uploading logo asset:", error);
              }
            }

            if (parsedData?.assets?.length > 0) {
              const bucket = ASSETS_BUCKET;
              const path = `ads/${parsedData.ad?.raw_data?.ad_archive_id}`;
              // Upload all assets in parallel
              assetsUploded = [];
              for (const asset of parsedData.assets) {
                // Upload Media SD
                if (asset.media_sd_url) {
                  const sdResult = await uploadAsset(
                    asset.media_sd_url,
                    asset.media_type
                  );
                  assetsUploded.push(sdResult);
                }

                // Upload Media HD
                // if (asset.media_hd_url) {
                //     const hdResult = await uploadAsset(supabaseClient, bucket, path, asset.media_hd_url, asset.media_type);
                //     assetsUploded.push(hdResult);
                // }

                // Upload Thumbnail
                if (asset.thumbnail_url) {
                  const thumbResult = await uploadAsset(
                    asset.thumbnail_url,
                    asset.media_type
                  );
                  assetsUploded.push(thumbResult);
                }
              }
            }


            for (const asset of parsedData.assets || []) {
              if (asset.media_type === "video") {
                try {
                  const videoUrl = asset.media_sd_url;

                  // Extract transcript and hooks from video

                  const { transcript, hooks: detectedHooks } = await processVideo(videoUrl);
                  if (transccipt !== null) {

                    const persons = await createPersonaFromTranscript(transcript)
                    persosnaDes = persons
                  }
                  transccipt = transcript;
                  hooks = detectedHooks;

                } catch (error) {
                  console.error("Error processing video:", error);
                }
              }
            }

            return { parsedData, assetsUploded, logoResults, transccipt, hooks, persosnaDes, headline };
          })
        );


        if (results && results.length > 0) {

          const assetsUploded = results.flatMap((item) => item.assetsUploded);
          const logoResult = results[0]?.logoResults || null; // Get only the first logo result
          const brandName = results[0]?.parsedData?.brand?.name || ""; // Get only the first brand name
          // const transscrpit = results[0]?.transccipt === "" || results[0]?.transccipt === null || results[0]?.transccipt === undefined ? "N/A" : results[0]?.transccipt

          // const hooks = results[0]?.hooks === "" || results[0]?.hooks === null || results[0]?.hooks === undefined ? "N/A" : results[0]?.hooks



          const { data: response, error } = await supabase
            .from("ad_tracker")
            .insert({
              facebook_page_id: adId,
              folder_id: folderId,
              user_id: userId,
              facebook_view_data: results,
              assets: assetsUploded,
              name: brandName,
              brand_image: logoResult,
            });

          if (error) {
            console.error("Supabase Insert Error:", error.message);
            return res
              .status(500)
              .json({ error: "Failed to insert ad data to Supabase" });
          }

          if (response) {
            return res.status(200).json({ success: true });
          }
        }
        res.status(200).json({ success: true });

      }
    })();
  },
  getAd: async (req, res) => {
    const mediaUrl = req.body.url;
    //  return res.status(200).send(videoUrl);

    if (!mediaUrl) {
      return res.status(400).json({ error: "Missing video URL" });
    }

    try {
      const isVideo = mediaUrl.includes(".mp4");
      const mediaType = isVideo ? "video" : "image";
      const extension = isVideo ? "mp4" : "jpg";
      const contentType = isVideo ? "video/mp4" : "image/jpeg";
      const fileName = `${Date.now()}.${extension}`;
      const filePath = path.join(__dirname, fileName);

      const response = await axios.get(mediaUrl, {
        responseType: "arraybuffer",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: "https://www.facebook.com/",
        },
      });
      const BUCKET_NAME = "assets";

      fs.writeFileSync(filePath, response.data);
      const { data: uploadedFile, error: uploadError } = await supabase.storage
        .from("assets")
        .upload(fileName, response.data, {
          upsert: true,
        });

      if (uploadError) {
        console.error(" Supabase Upload Error:", uploadError.message);
        return res
          .status(500)
          .json({ error: "Failed to upload media to Supabase" });
      }
      // const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${fileName}`;
      fs.unlinkSync(filePath);


      return res.status(200).json({
        contentType,
        uploadedFile: uploadedFile, // Returning the public URL
        media_type: mediaType,
      });
    } catch (error) {
      console.error(" Error downloading media:", error.message);
      return null;
    }
  },
};

export { userController, adTrackerController };
