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
  const adCategories = Object.values(snapshot.page_categories)
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
      return res
        .status(500)
        .json({ error: "Failed to upload media to Supabase" });
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

// const scrappingData = [
//   {
//     ad_archive_id: "585506897635941",
//     ad_id: null,
//     archive_types: [],
//     categories: ["UNKNOWN"],
//     collation_count: 2,
//     collation_id: "932560809036758",
//     contains_digital_created_media: false,
//     contains_sensitive_content: false,
//     currency: "",
//     end_date: 1739174400,
//     entity_type: "PERSON_PROFILE",
//     fev_info: null,
//     finserv_ad_data: {
//       is_deemed_finserv: false,
//       is_limited_delivery: false,
//     },
//     gated_type: "ELIGIBLE",
//     has_user_reported: false,
//     hidden_safety_data: false,
//     hide_data_status: "NONE",
//     impressions_with_index: {
//       impressions_text: null,
//       impressions_index: -1,
//     },
//     is_aaa_eligible: true,
//     is_active: true,
//     is_profile_page: false,
//     menu_items: [],
//     page_id: "103537499312980",
//     page_is_deleted: false,
//     page_name: "Liven: Self-Discovery Companion",
//     political_countries: [],
//     publisher_platform: [
//       "FACEBOOK",
//       "INSTAGRAM",
//       "AUDIENCE_NETWORK",
//       "MESSENGER",
//     ],
//     reach_estimate: null,
//     regional_regulation_data: {
//       finserv: {
//         is_deemed_finserv: false,
//         is_limited_delivery: false,
//       },
//       tw_anti_scam: {
//         is_limited_delivery: false,
//       },
//     },
//     report_count: null,
//     snapshot: {
//       body: {
//         text: "You see, trauma is a common experience that many people face in their lives, and it can have long-lasting effects on our mental and physical health. Just take a free quiz, unlock your inner triggers and start your healing journey today!",
//       },
//       branded_content: null,
//       brazil_tax_id: null,
//       byline: null,
//       caption: "inner-theliven.com",
//       cards: [],
//       cta_text: "Learn more",
//       cta_type: "LEARN_MORE",
//       country_iso_code: null,
//       current_page_name: "Liven: Self-Discovery Companion",
//       disclaimer_label: null,
//       display_format: "VIDEO",
//       event: null,
//       images: [],
//       is_reshared: false,
//       link_description: "A step-by-step self-love routine!",
//       link_url:
//         "https://inner-theliven.com/en?utm_source=facebook&utm_campaign=%7B%7Bcampaign.id%7D%7D&utm_adset=%7B%7Badset.id%7D%7D&utm_ad=%7B%7Bad.id%7D%7D&ad_name=%7B%7Bad.name%7D%7D&campaign_name=%7B%7Bcampaign.name%7D%7D&adset_name=%7B%7Badset.name%7D%7D&placement=%7B%7Bplacement%7D%7D",
//       page_categories: ["App page"],
//       page_entity_type: "PERSON_PROFILE",
//       page_id: "103537499312980",
//       page_is_deleted: false,
//       page_is_profile_page: false,
//       page_like_count: 197507,
//       page_name: "Liven: Self-Discovery Companion",
//       page_profile_picture_url:
//         "https://scontent-ord5-2.xx.fbcdn.net/v/t39.35426-6/476382388_1849684815848299_2378198836082625425_n.jpg?stp=dst-jpg_s60x60_tt6&_nc_cat=100&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=iRSAZRh_XzoQ7kNvgEt22MH&_nc_oc=AdhwzliC_JOqBb6zWQvyUHBOzd-7OEUlivfd2tWtiLsm2yz5Rbys0K2RJsMUL9tDtyk&_nc_zt=14&_nc_ht=scontent-ord5-2.xx&_nc_gid=AasDIi872sSip3yKQKRc2m9&oh=00_AYAAdMLxLupml3qXDVIwu36KAg3ifCPKfwst_EryG-oMoQ&oe=67B0CF71",
//       page_profile_uri: "https://www.facebook.com/quiz.theliven/",
//       root_reshared_post: null,
//       title: "Unresolved Trauma Plan 👉",
//       videos: [
//         {
//           video_hd_url:
//             "https://video-ord5-2.xx.fbcdn.net/v/t42.1790-2/476845181_1967560867085869_3592227572102366292_n.?_nc_cat=110&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=86y_9JdRl6EQ7kNvgHFrQBj&_nc_oc=AdhK14q_3xcNXfBXXyT3JW9n9O0hHUmqOyFz2myRS_ftkfiXgyQVLWIk0UV9se2jCJM&_nc_zt=28&_nc_ht=video-ord5-2.xx&_nc_gid=AasDIi872sSip3yKQKRc2m9&oh=00_AYDKOZRtxXAH1iEBaETBv75PBXohZmoTHBFlFBJTh0DkFg&oe=67B098F3",
//           video_preview_image_url:
//             "https://scontent-ord5-2.xx.fbcdn.net/v/t39.35426-6/476805109_2338561793184116_932350559035556694_n.jpg?_nc_cat=105&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=n_RkNHYu9TEQ7kNvgHrz8E6&_nc_oc=AdhMNCINa13ciHRJOECA9m3l-CIZbJpb3cAcBbq_uVNPed2efVgKSMGVNjegkY2Ns1I&_nc_zt=14&_nc_ht=scontent-ord5-2.xx&_nc_gid=AasDIi872sSip3yKQKRc2m9&oh=00_AYBvbMJHhk72EAoAhdHm92_bd6AujB7VZKO7DrX0nU45aw&oe=67B0BF71",
//           video_sd_url:
//             "https://video-ord5-2.xx.fbcdn.net/v/t42.1790-2/476370879_1164123321727609_2815691201090168277_n.mp4?_nc_cat=102&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=eKNTQrThfcEQ7kNvgFoKdXC&_nc_oc=AdgTA7Ld4rtoE87peUVSkTpFkZsp76M32AED7HvyT7H7HbCOmLlelAxhgX7_l1-K2e0&_nc_zt=28&_nc_ht=video-ord5-2.xx&_nc_gid=AasDIi872sSip3yKQKRc2m9&oh=00_AYDCHgdbz-utjaHMz4AfPLtNYIvlliFIy0AQ1DSOtJd4yg&oe=67B0AEC2",
//           watermarked_video_hd_url:
//             "https://video-ord5-2.xx.fbcdn.net/o1/v/t2/f2/m69/AQNdxOoQ8VI9Mk6qCVms2f0W-ljSIPL22KqwPacAdZMVAt7KS2u2h32a5Y5HH7MlIROoKPp7DAY6XI3vAetu3m7N.mp4?efg=eyJ4cHZfYXNzZXRfaWQiOjY0MjY5NzgzMTkwMDM3MCwidmVuY29kZV90YWciOiJ4cHZfcHJvZ3Jlc3NpdmUuRkFDRUJPT0suLkMzLjcyMC5kYXNoX2gyNjQtYmFzaWMtZ2VuMl83MjBwIn0&_nc_ht=video-ord5-2.xx.fbcdn.net&_nc_cat=103&_nc_oc=Adh6CtWrGYL3uzNz8lJjzoTzcNAT9jTMkN4ni8qLsIRsZAG8z3-3DRs-BLGyUi2dT24&strext=1&vs=b29b670ac9788c99&_nc_vs=HBksFQIYOnBhc3N0aHJvdWdoX2V2ZXJzdG9yZS9HQW5XWlJ4ZTBJeG8zM2dEQUwtc05zem9NblFVYm1kakFBQUYVAALIAQAVAhg6cGFzc3Rocm91Z2hfZXZlcnN0b3JlL0dFaHhZeHhGZ0ZRYV83Z0VBRWJsYVVaUGVVcGRickZxQUFBRhUCAsgBACgAGAAbAogHdXNlX29pbAExEnByb2dyZXNzaXZlX3JlY2lwZQExFQAAJqSTv__3oaQCFQIoAkMzLBdAQz1wo9cKPRgZZGFzaF9oMjY0LWJhc2ljLWdlbjJfNzIwcBEAdQIA&ccb=9-4&oh=00_AYDiakuS8V-Wm3CDiCYmm7EdjPpXvMhRjV3gXeD6VvGFUg&oe=67ACD48A&_nc_sid=1d576d",
//           watermarked_video_sd_url:
//             "https://video-ord5-2.xx.fbcdn.net/o1/v/t2/f2/m69/AQO5hlXQKgHKHKUXdNmQZ2WidZAkBipGc0EbO0tMAipfXobA4G0N-3KmhRQuCaXG1raJb8xBH9VVMLLaNAU8MNrp.mp4?strext=1&_nc_cat=105&_nc_sid=8bf8fe&_nc_ht=video-ord5-2.xx.fbcdn.net&_nc_ohc=nU1iZmHEoGkQ7kNvgFx5eVX&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5GQUNFQk9PSy4uQzMuMzYwLnN2ZV9zZCIsInhwdl9hc3NldF9pZCI6NjQyNjk3ODMxOTAwMzcwLCJ1cmxnZW5fc291cmNlIjoid3d3In0%3D&ccb=9-4&_nc_zt=28&oh=00_AYCXVJwaWYndvV0wYTGwuoccnJSL7ucXbNCuQnMUyT_r-Q&oe=67B0A7BC",
//         },
//       ],
//       additional_info: null,
//       ec_certificates: [],
//       extra_images: [],
//       extra_links: [],
//       extra_texts: [],
//       extra_videos: [],
//     },
//     spend: null,
//     start_date: 1739174400,
//     state_media_run_label: null,
//     targeted_or_reached_countries: [],
//     total_active_time: 27736,
//     url: "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=103537499312980",
//     total: 50001,
//   },
//   {
//     ad_archive_id: "1367690454172502",
//     ad_id: null,
//     archive_types: [],
//     categories: ["UNKNOWN"],
//     collation_count: 2,
//     collation_id: "2297671613962793",
//     contains_digital_created_media: false,
//     contains_sensitive_content: false,
//     currency: "",
//     end_date: 1739174400,
//     entity_type: "PERSON_PROFILE",
//     fev_info: null,
//     finserv_ad_data: {
//       is_deemed_finserv: false,
//       is_limited_delivery: false,
//     },
//     gated_type: "ELIGIBLE",
//     has_user_reported: false,
//     hidden_safety_data: false,
//     hide_data_status: "NONE",
//     impressions_with_index: {
//       impressions_text: null,
//       impressions_index: -1,
//     },
//     is_aaa_eligible: true,
//     is_active: true,
//     is_profile_page: false,
//     menu_items: [],
//     page_id: "103537499312980",
//     page_is_deleted: false,
//     page_name: "Liven: Self-Discovery Companion",
//     political_countries: [],
//     publisher_platform: [
//       "FACEBOOK",
//       "INSTAGRAM",
//       "AUDIENCE_NETWORK",
//       "MESSENGER",
//     ],
//     reach_estimate: null,
//     regional_regulation_data: {
//       finserv: {
//         is_deemed_finserv: false,
//         is_limited_delivery: false,
//       },
//       tw_anti_scam: {
//         is_limited_delivery: false,
//       },
//     },
//     report_count: null,
//     snapshot: {
//       body: {
//         text: "You see, trauma is a common experience that many people face in their lives, and it can have long-lasting effects on our mental and physical health. Just take a free quiz, unlock your inner triggers and start your healing journey today!",
//       },
//       branded_content: null,
//       brazil_tax_id: null,
//       byline: null,
//       caption: "inner-theliven.com",
//       cards: [],
//       cta_text: "Learn more",
//       cta_type: "LEARN_MORE",
//       country_iso_code: null,
//       current_page_name: "Liven: Self-Discovery Companion",
//       disclaimer_label: null,
//       display_format: "VIDEO",
//       event: null,
//       images: [],
//       is_reshared: false,
//       link_description: "A step-by-step self-love routine!",
//       link_url:
//         "https://inner-theliven.com/en?utm_source=facebook&utm_campaign=%7B%7Bcampaign.id%7D%7D&utm_adset=%7B%7Badset.id%7D%7D&utm_ad=%7B%7Bad.id%7D%7D&ad_name=%7B%7Bad.name%7D%7D&campaign_name=%7B%7Bcampaign.name%7D%7D&adset_name=%7B%7Badset.name%7D%7D&placement=%7B%7Bplacement%7D%7D",
//       page_categories: ["App page"],
//       page_entity_type: "PERSON_PROFILE",
//       page_id: "103537499312980",
//       page_is_deleted: false,
//       page_is_profile_page: false,
//       page_like_count: 197507,
//       page_name: "Liven: Self-Discovery Companion",
//       page_profile_picture_url:
//         "https://scontent-ord5-2.xx.fbcdn.net/v/t39.35426-6/476567491_1352796502520568_5621766195628920315_n.jpg?stp=dst-jpg_s60x60_tt6&_nc_cat=105&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=Telc39nDOygQ7kNvgEVw6Um&_nc_oc=AdjGz75d6S2LtEkyLEFba-NdNXMT28-w1zWAkT4lpOKRbn3-hJ3YGKl9tFrMkDFXsOU&_nc_zt=14&_nc_ht=scontent-ord5-2.xx&_nc_gid=AasDIi872sSip3yKQKRc2m9&oh=00_AYANrbtJ_1ggcRpeeRLeXfcP2-2zavo-Vi4tem88y8g9nA&oe=67B0B88E",
//       page_profile_uri: "https://www.facebook.com/quiz.theliven/",
//       root_reshared_post: null,
//       title: "Unresolved Trauma Plan 👉",
//       videos: [
//         {
//           video_hd_url:
//             "https://video-ord5-2.xx.fbcdn.net/v/t42.1790-2/476131990_1328450951531846_776212142728643791_n.?_nc_cat=106&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=ehyAgVkI0uEQ7kNvgExNYx-&_nc_oc=AdhrUBVm_O89i4NhjrFijeyOYOifD37RdXxdm1jCw8tn_s2WwqXtkaAZ3vr2bSseg60&_nc_zt=28&_nc_ht=video-ord5-2.xx&_nc_gid=AasDIi872sSip3yKQKRc2m9&oh=00_AYAed0ab9AuYkM2I-E9KUaBtG45foQcLjl2_hvfpvfyB2w&oe=67B0B3FB",
//           video_preview_image_url:
//             "https://scontent-ord5-2.xx.fbcdn.net/v/t39.35426-6/476375376_2129687260792288_714065138631507650_n.jpg?_nc_cat=109&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=8pQNKQ4iF1gQ7kNvgFHJbZN&_nc_oc=Adi5ZuutGhfCubDqv1tm-kecG2_3qjVJCQ4EWyXFzKsqTPsoa-IKXS14IdNRc3Spf3o&_nc_zt=14&_nc_ht=scontent-ord5-2.xx&_nc_gid=AasDIi872sSip3yKQKRc2m9&oh=00_AYDcHGh5wxNm7_AL5rtT_6RDnQR0K8pGgIhFabtNqVCaDA&oe=67B0CB8F",
//           video_sd_url:
//             "https://video-ord5-2.xx.fbcdn.net/v/t42.1790-2/476325515_1025322836071927_4100732544883620457_n.mp4?_nc_cat=103&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=MH63owkRJO8Q7kNvgHat63q&_nc_oc=Adinl81DDkrGz6In2KWHq0fmpHnRcwY-Xej_e6BcK1vGupmLiGCrNFXet-WnC_MDaDg&_nc_zt=28&_nc_ht=video-ord5-2.xx&_nc_gid=AasDIi872sSip3yKQKRc2m9&oh=00_AYDhbgz2aEX85OBz_4hCXKEKT_rAdFMm2_fqJfzVU-0_MA&oe=67B0A8A9",
//           watermarked_video_hd_url:
//             "https://video-ord5-2.xx.fbcdn.net/o1/v/t2/f2/m69/AQOYnXf4SxwsjzEqieJaZcT2DZilxHj5j5QaOHmmS4vDlnDp2GJdUAEm3XdRB0H6-H5rZf1GWWANc9QN_vKVeod9.mp4?efg=eyJ4cHZfYXNzZXRfaWQiOjEyNTM4MDI3OTIzODIwMzQsInZlbmNvZGVfdGFnIjoieHB2X3Byb2dyZXNzaXZlLkZBQ0VCT09LLi5DMy43MjAuZGFzaF9oMjY0LWJhc2ljLWdlbjJfNzIwcCJ9&_nc_ht=video-ord5-2.xx.fbcdn.net&_nc_cat=106&_nc_oc=Adg-sOTXL76XJKuQnPmQLzc8RQzlhMsNZZQjgg4TwDAFA6thC-ufVJxxDxa2SoBMK9s&strext=1&vs=6d4d88c8a357d9f7&_nc_vs=HBksFQIYOnBhc3N0aHJvdWdoX2V2ZXJzdG9yZS9HQmVrWnh6RlUyU29tcUlFQUd1VkR0MmYyOU13Ym1kakFBQUYVAALIAQAVAhg6cGFzc3Rocm91Z2hfZXZlcnN0b3JlL0dGN0haQndJN2dYNkU5d0dBS01EdlY4b2dHSjhickZxQUFBRhUCAsgBACgAGAAbAogHdXNlX29pbAExEnByb2dyZXNzaXZlX3JlY2lwZQExFQAAJqS59-D2lLoEFQIoAkMzLBdAQz1wo9cKPRgZZGFzaF9oMjY0LWJhc2ljLWdlbjJfNzIwcBEAdQIA&ccb=9-4&oh=00_AYBoqZgDnl8Ln2_y3CDU7MslZ0mKUkMFrziM9w8s9nDCfA&oe=67ACB1ED&_nc_sid=1d576d",
//           watermarked_video_sd_url:
//             "https://video-ord5-2.xx.fbcdn.net/o1/v/t2/f2/m69/AQMCbNIVZ012Udt4Xk8d957S0_EQK046go8Ar4dvieziGhc7vKh-mWEsRPhw_77yc2U9455Ei_Ey_iie4dYRSxP7.mp4?strext=1&_nc_cat=105&_nc_sid=8bf8fe&_nc_ht=video-ord5-2.xx.fbcdn.net&_nc_ohc=iKXiCyQOwW8Q7kNvgFgx8Ab&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5GQUNFQk9PSy4uQzMuMzYwLnN2ZV9zZCIsInhwdl9hc3NldF9pZCI6MTI1MzgwMjc5MjM4MjAzNCwidXJsZ2VuX3NvdXJjZSI6Ind3dyJ9&ccb=9-4&_nc_zt=28&oh=00_AYCyVJE1WNjgqUp_f8DvqBUKg4S07h_rvbdls_fVcnVOJQ&oe=67B0AA1C",
//         },
//       ],
//       additional_info: null,
//       ec_certificates: [],
//       extra_images: [],
//       extra_links: [],
//       extra_texts: [],
//       extra_videos: [],
//     },
//     spend: null,
//     start_date: 1739174400,
//     state_media_run_label: null,
//     targeted_or_reached_countries: [],
//     total_active_time: 27605,
//     url: "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=103537499312980",
//     total: 50001,
//   },
//   {
//     ad_archive_id: "1020763296545388",
//     ad_id: null,
//     archive_types: [],
//     categories: ["UNKNOWN"],
//     collation_count: 2,
//     collation_id: "616308667776022",
//     contains_digital_created_media: false,
//     contains_sensitive_content: false,
//     currency: "",
//     end_date: 1739174400,
//     entity_type: "PERSON_PROFILE",
//     fev_info: null,
//     finserv_ad_data: {
//       is_deemed_finserv: false,
//       is_limited_delivery: false,
//     },
//     gated_type: "ELIGIBLE",
//     has_user_reported: false,
//     hidden_safety_data: false,
//     hide_data_status: "NONE",
//     impressions_with_index: {
//       impressions_text: null,
//       impressions_index: -1,
//     },
//     is_aaa_eligible: false,
//     is_active: true,
//     is_profile_page: false,
//     menu_items: [],
//     page_id: "103537499312980",
//     page_is_deleted: false,
//     page_name: "Liven: Self-Discovery Companion",
//     political_countries: [],
//     publisher_platform: [
//       "FACEBOOK",
//       "INSTAGRAM",
//       "AUDIENCE_NETWORK",
//       "MESSENGER",
//     ],
//     reach_estimate: null,
//     regional_regulation_data: {
//       finserv: {
//         is_deemed_finserv: false,
//         is_limited_delivery: false,
//       },
//       tw_anti_scam: {
//         is_limited_delivery: false,
//       },
//     },
//     report_count: null,
//     snapshot: {
//       body: {
//         text: "Managing Anxiety is a process, not a one-time fix.",
//       },
//       branded_content: null,
//       brazil_tax_id: null,
//       byline: null,
//       caption: "wb-theliven.com",
//       cards: [],
//       cta_text: "Learn more",
//       cta_type: "LEARN_MORE",
//       country_iso_code: null,
//       current_page_name: "Liven: Self-Discovery Companion",
//       disclaimer_label: null,
//       display_format: "VIDEO",
//       event: null,
//       images: [],
//       is_reshared: false,
//       link_description: "Learn to manage your Anxiety.",
//       link_url:
//         "https://wb-theliven.com/en?utm_source=facebook&utm_campaign=%7B%7Bcampaign.id%7D%7D&utm_adset=%7B%7Badset.id%7D%7D&utm_ad=%7B%7Bad.id%7D%7D&ad_name=%7B%7Bad.name%7D%7D&campaign_name=%7B%7Bcampaign.name%7D%7D&adset_name=%7B%7Badset.name%7D%7D&placement=%7B%7Bplacement%7D%7D",
//       page_categories: ["App page"],
//       page_entity_type: "PERSON_PROFILE",
//       page_id: "103537499312980",
//       page_is_deleted: false,
//       page_is_profile_page: false,
//       page_like_count: 197507,
//       page_name: "Liven: Self-Discovery Companion",
//       page_profile_picture_url:
//         "https://scontent-ord5-2.xx.fbcdn.net/v/t39.35426-6/476834648_978391220426125_5107697956285684426_n.jpg?stp=dst-jpg_s60x60_tt6&_nc_cat=105&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=YFNEYGelkOcQ7kNvgE930-H&_nc_oc=AdiHgUv6Jv-SjieVdnyDdOWHoaAR2x1NAJEpdhWt-o8YM0kQV8X4Iu1Fbel3Lx-T-sM&_nc_zt=14&_nc_ht=scontent-ord5-2.xx&_nc_gid=AasDIi872sSip3yKQKRc2m9&oh=00_AYCbJKq50hpbUPQPmt4sYhpYJXMsoowT-S8H2I7k9tJoFw&oe=67B0B3D4",
//       page_profile_uri: "https://www.facebook.com/quiz.theliven/",
//       root_reshared_post: null,
//       title: "Tools to Manage Anxiety",
//       videos: [
//         {
//           video_hd_url:
//             "https://video-ord5-2.xx.fbcdn.net/v/t42.1790-2/477313696_1020763329878718_2215698621901562888_n.?_nc_cat=101&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=lekoSKrFgEYQ7kNvgHrOcAl&_nc_oc=AdiqxC_zBO164Muns3PI2k3LpSIb4BIPjNOp7RMII7Wg9iX6t-Gd6PiuqkxuxFEo-m8&_nc_zt=28&_nc_ht=video-ord5-2.xx&_nc_gid=AasDIi872sSip3yKQKRc2m9&oh=00_AYBC9pJGWb1drvGykSUeG8lOtxjBhCxyRhvgwtCJkadPNw&oe=67B0AE51",
//           video_preview_image_url:
//             "https://scontent-ord5-2.xx.fbcdn.net/v/t39.35426-6/477009739_1118122570051961_759779402699459802_n.jpg?_nc_cat=102&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=s0K09GSAo_oQ7kNvgG-bKOj&_nc_oc=Adhz5bvncch9lGAJV89Tw5vGg0opaQZLFOBUVQEUhXHFdhSwVJSYe3-0siF_h0zxglc&_nc_zt=14&_nc_ht=scontent-ord5-2.xx&_nc_gid=AasDIi872sSip3yKQKRc2m9&oh=00_AYDHSrpKRIVnyrlNsTCfyD-JkZoGl-kLJBYEYDd5IKws2A&oe=67B0B070",
//           video_sd_url:
//             "https://video-ord5-2.xx.fbcdn.net/v/t42.1790-2/475950075_979111200786188_1695678731904198289_n.mp4?_nc_cat=103&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=33gaohdfk08Q7kNvgH6yyl2&_nc_oc=AdjUVkzB6H2Z4w5vEriz9-mNGPRfYCb91amQTtM9gX87ubyKTECaStOE5Mon2DW3v9Y&_nc_zt=28&_nc_ht=video-ord5-2.xx&_nc_gid=AasDIi872sSip3yKQKRc2m9&oh=00_AYB645TN5jXHewcozvKsW5CDYrUZSIlBGcR-Izs0r177JQ&oe=67B0B522",
//           watermarked_video_hd_url:
//             "https://video-ord5-2.xx.fbcdn.net/o1/v/t2/f2/m69/AQNbgvhEl0lpST5WCBU-cxuW0HyTw4-aPYRO3bPKCWdCBnH2sKQkcNYg_QwAq3lGLs7FokckV25xgrGBcLKlaeA2.mp4?efg=eyJ4cHZfYXNzZXRfaWQiOjE5NTU1NDU1MTQ5NzE3NjQsInZlbmNvZGVfdGFnIjoieHB2X3Byb2dyZXNzaXZlLkZBQ0VCT09LLi5DMy43MjAuZGFzaF9oMjY0LWJhc2ljLWdlbjJfNzIwcCJ9&_nc_ht=video-ord5-2.xx.fbcdn.net&_nc_cat=107&_nc_oc=AdhkMZ05QTMEeXgtLirKgqECGKqTPNqzIEuPCrEBmHvstvX45Q7gzQ21Pp9wwQ6RA1k&strext=1&vs=494cad74a62545a9&_nc_vs=HBksFQIYOnBhc3N0aHJvdWdoX2V2ZXJzdG9yZS9HUF9OZVJ3NjVxOUZpREVDQU8yMWtWZlJKbXREYm1kakFBQUYVAALIAQAVAhg6cGFzc3Rocm91Z2hfZXZlcnN0b3JlL0dIRGZaUnlwcks3QkNDd0VBTFptRlJiYXJia0FickZxQUFBRhUCAsgBACgAGAAbAogHdXNlX29pbAExEnByb2dyZXNzaXZlX3JlY2lwZQExFQAAJujJmLzdo_kGFQIoAkMzLBdAQgUeuFHrhRgZZGFzaF9oMjY0LWJhc2ljLWdlbjJfNzIwcBEAdQIA&ccb=9-4&oh=00_AYAhXT0MObR3R_zzZsjxSuQKp_w9tKJ0B8tRXR_Audz0VQ&oe=67ACC862&_nc_sid=1d576d",
//           watermarked_video_sd_url:
//             "https://video-ord5-2.xx.fbcdn.net/o1/v/t2/f2/m69/AQNOEZnUSLUNyQAXUausTtUiEZ789-8d-LhyrnSUWJHg2NmZ6DYC6df_FJrOamHDTLKSKU2JKFhHVTMJJoKPBMvR.mp4?strext=1&_nc_cat=107&_nc_sid=8bf8fe&_nc_ht=video-ord5-2.xx.fbcdn.net&_nc_ohc=ev-AyLobhZMQ7kNvgFPv7_3&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5GQUNFQk9PSy4uQzMuMzYwLnN2ZV9zZCIsInhwdl9hc3NldF9pZCI6MTk1NTU0NTUxNDk3MTc2NCwidXJsZ2VuX3NvdXJjZSI6Ind3dyJ9&ccb=9-4&_nc_zt=28&oh=00_AYCT8RIesX_LC1cR0z7lXKpBVDrUfgwOb4guFYcls9llzw&oe=67B0B97E",
//         },
//       ],
//       additional_info: null,
//       ec_certificates: [],
//       extra_images: [],
//       extra_links: [],
//       extra_texts: [],
//       extra_videos: [],
//     },
//     spend: null,
//     start_date: 1739174400,
//     state_media_run_label: null,
//     targeted_or_reached_countries: [],
//     total_active_time: 52342,
//     url: "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=103537499312980",
//     total: 50001,
//   },
// ];

const ASSETS_BUCKET = "assets";

const adTrackerController = {
  trackAd: async (req, res) => {
    const adId = req.body.adURL;
    const folderId = req.body.folderId;
    const userId = req.body.user_id;
    console.log(adId, folderId, userId);
    const input = {
      urls: [
        {
          url: adId,
        },
      ],
      count: 200,
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
    // console.log(length);

    (async () => {
      // Run the Actor and wait for it to finish
      let scrappingData = [];
      const run = await client.actor("XtaWFhbtfxyzqrFmd").call(input);
      // Fetch and print Actor results from the run's dataset (if any)
      console.log("Results from dataset");
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
            // console.log(parsedData, "Parsed Data");

            let assetsUploded = [];
            let logoResults = [];
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

            // console.log(assetsUploded);

            return { parsedData, assetsUploded, logoResults };
          })
        );
        if (results && results.length > 0) {
          const { data: response, error } = await supabase
            .from("ad_tracker")
            .insert({
              facebook_page_id: adId,
              folder_id: folderId,
              user_id: userId,
              facebook_view_data: results,
              assets: results?.assetsUploded,
            });

          if (error) {
            console.error("Supabase Insert Error:", error.message);
            return res
              .status(500)
              .json({ error: "Failed to insert ad data to Supabase" });
          }

          if (response) {
            console.log("Ad data inserted successfully");
            return res.status(200).json({ success: true });
          }
        }

        // console.log(results, "hellows");
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
      console.log(` File uploaded to Supabase: ${uploadedFile}`);
      fs.unlinkSync(filePath);
      console.log(
        ` ${isVideo ? "Video" : "Image"} downloaded successfully: ${filePath}`
      );

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
