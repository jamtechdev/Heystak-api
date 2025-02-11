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

const adTrackerController = {
  trackAd: async (req, res) => {
    const adId = req.body.adURL;
    const folderId = req.body.folderId;
    const userId = req.body.user_id;
    // console.log(adId, folderId, userId);
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
      let allSnapshots = [];
      const run = await client.actor("XtaWFhbtfxyzqrFmd").call(input);
      // Fetch and print Actor results from the run's dataset (if any)
      console.log("Results from dataset");
      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      items.forEach((item) => {
        allSnapshots = allSnapshots.concat(item);
      });
      res.status(200).send(allSnapshots);
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
        console.error("❌ Supabase Upload Error:", uploadError.message);
        return res
          .status(500)
          .json({ error: "Failed to upload media to Supabase" });
      }
      // const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${fileName}`;
      console.log(`✅ File uploaded to Supabase: ${uploadedFile}`);
      fs.unlinkSync(filePath);
      console.log(
        `✅ ${isVideo ? "Video" : "Image"} downloaded successfully: ${filePath}`
      );

      return res.status(200).json({
        contentType,
        uploadedFile: uploadedFile, // Returning the public URL
        media_type: mediaType,
      });
    } catch (error) {
      console.error("❌ Error downloading media:", error.message);
      return null;
    }
  },
};

export { userController, adTrackerController };
