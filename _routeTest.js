import express from "express";
import { createClient } from "@supabase/supabase-js";
import cron from "node-cron";
import dotenv from "dotenv";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

dotenv.config();

const app = express();
import cors from "cors";

app.use(cors());

// Initialize your Supabase client
const supabaseUrl = process.env.SUPABASE_URL; // Your Supabase URL
const supabaseKey = process.env.SUPABASE_KEY; // Your Supabase API Key
const supabase = createClient(supabaseUrl, supabaseKey);

// Define your Facebook Ads URL
const FACEBOOK_ADS_URL = process.env.FACEBOOK_ADS_URL; // Your Facebook Ads Library URL

app.get("/ads", async (req, res) => {
  try {
    // Get the 'page' query parameter, defaulting to 1 if not provided
    const page = parseInt(req.query.page) || 1;
    const pageSize = 5; // Number of records per page
    const from = (page - 1) * pageSize; // Calculate the starting index
    const to = from + pageSize - 1; // Calculate the ending index

    // Fetch data with pagination
    const { data, count, error } = await supabase
      .from("ads")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to); // Fetch rows within the specified range

    if (error) throw error;

    if (data) {
      // Combine adId and adArchiveID in a single array of objects
      const ads = data
        .map((ad) => ({
          adId: ad.id,
          adArchiveID: ad.raw_data?.adCard?.adArchiveID,
        }))
        .filter((ad) => ad.adId !== undefined && ad.adArchiveID !== undefined);

      // Loop through each ad to call the Facebook API and update Supabase
      for (const ad of ads) {
        try {
          const response = await fetch(
            `${FACEBOOK_ADS_URL}/?id=${ad.adArchiveID}`
          );

          if (!response.ok) {
            throw new Error(
              `Facebook Ads Library API responded with ${response.status}`
            );
          }

          const htmlData = await response.text();
          const regex = /"isActive":\s*(true|false|null)/;
          const match = htmlData.match(regex);
          console.log({ isActive: match ? match[1] : null });

          // If we found the isActive status, update the ad's live_status in Supabase
          if (isActive !== null) {
            const { data: updateData, error: updateError } = await supabase
              .from("ads")
              .update({ live_status: isActive })
              .eq("id", ad.adId);

            if (updateError) {
              console.error(
                `Error updating ad with id ${ad.adId}:`,
                updateError
              );
            } else {
              console.log(
                `Updated ad ${ad.adId} with live_status: ${isActive}`
              );
            }
          } else {
            // No isActive status found, update live_status to NULL
            console.log(
              `No isActive status found for ad ${ad.adId}, updating live_status to NULL.`
            );
            const { data: updateData, error: updateError } = await supabase
              .from("ads")
              .update({ live_status: null })
              .eq("id", ad.adId);

            if (updateError) {
              console.error(
                `Error updating ad with id ${ad.adId} to NULL:`,
                updateError
              );
            } else {
              console.log(`Updated ad ${ad.adId} with live_status: NULL`);
            }
          }
        } catch (error) {
          console.error(`Error processing ad ${ad.adId}:`, error);
        }
      }

      // Send the paginated data and total count as JSON response
      // return res.json({
      //   ads: ads, // Combined array with adId and adArchiveID
      //   totalAds: count, // Total count of ads in the database
      //   currentPage: page, // Current page number
      //   totalPages: Math.ceil(count / pageSize), // Total number of pages
      // });
    } else {
      // If no data, send an empty array
      return res.json({
        ads: [], // Empty array if no ads found
        totalAds: 0,
        currentPage: page,
        totalPages: 0,
      });
    }
  } catch (error) {
    console.error("Error fetching ads data:", error);
    res
      .status(500)
      .json({ error: "An error occurred while fetching ads data." });
  }
});

// Start the Express server
app.listen(process.env.BASE_PORT || 8090, () => {
  console.log(
    `Proxy server running at http://localhost:${process.env.BASE_PORT || 8090}`
  );
});
