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



function formatPersona(personaString) {
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

async function createPersonaFromTranscript(transcript) {

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

            return { parsedData, assetsUploded, logoResults, transccipt, hooks, persosnaDes };
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
