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

// HashMap to store the last processed page for each job
const jobState = {
  job1: 0, // Initial start for the first cron job (1 hr interval)
  job2: 101, // Initial start for the second cron job (3 hr interval)
  job3: 900, // Initial start for the third cron job (10 hr interval)
  job4: 2000, // Initial start for the fourth cron job (16 hr interval)
  job5: 10000, // Initial start for the fifth cron job (2 day interval)
};

// Function to split an array into chunks
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// Function to fetch data from Supabase and process it in chunks
async function fetchDataAndUpdate(pageStart, pageSize, chunkSize = 20) {
  try {
    // Check the total number of rows first
    console.log("job start");
    const { count: totalRows, error: countError } = await supabase
      .from("ads")
      .select("*", { count: "exact", head: true });

    if (countError) throw countError;

    // Ensure pageStart is within the range of total rows
    if (pageStart >= totalRows) {
      console.log(
        `Reached the end of available data. Total rows: ${totalRows}`
      );
      return; // Exit the function if there's no more data to fetch
    }

    // Adjust pageSize if the remaining rows are less than the pageSize
    const adjustedPageSize = Math.min(pageSize, totalRows - pageStart);

    const { data, error } = await supabase
      .from("ads")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(pageStart, pageStart + adjustedPageSize - 1); // Fetch rows within the specified range

    if (error) throw error;

    if (data) {
      const ads = data
        .map((ad) => ({
          adId: ad.id,
          adArchiveID: ad.raw_data?.adCard?.adArchiveID,
        }))
        .filter((ad) => ad.adId !== undefined && ad.adArchiveID !== undefined);

      // Split data into chunks
      const adChunks = chunkArray(ads, chunkSize);
      console.log(`Processing ${adChunks.length} chunks...`);

      // Loop through each chunk
      for (const chunk of adChunks) {
        // Process each chunk of ads
        for (const ad of chunk) {
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

            // Extract isActive status
            const isActive = match ? JSON.parse(match[1]) : null;
            const changeIsActive = isActive === true ? "active" : "inactive";

            // Log the extracted isActive status
            console.log({ isActive });

            if (isActive !== null) {
              const { data: updateData, error: updateError } = await supabase
                .from("ads")
                .update({ live_status: changeIsActive })
                .eq("id", ad.adId);

              if (updateError) {
                console.error(
                  `Error updating ad with id ${ad.adId}:`,
                  updateError
                );
              } else {
                console.log(
                  `Updated ad ${ad.adId} with live_status: ${changeIsActive}`
                );
              }
            } else {
              // No isActive status found, update live_status to empty string
              console.log(
                `No isActive status found for ad ${ad.adId}, updating live_status to NULL.`
              );
              // const { data: updateData, error: updateError } = await supabase
              //   .from("ads")
              //   .update({ live_status: '' })
              //   .eq("id", ad.adId);

              if (updateError) {
                console.error(`Error updating ad with id ${ad.adId} to NULL:`);
              } else {
                console.log(`Updated ad ${ad.adId} with live_status: NULL`);
              }
            }
          } catch (error) {
            console.error(`Error processing ad ${ad.adId}:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error("Error fetching ads data:", error);
  }
}

// Cron job functions for each interval
function job1() {
  console.log("Running job1 - every 1 hour");
  fetchDataAndUpdate(jobState.job1, 100); // Fetch 100 records starting from jobState.job1
  jobState.job1 += 100; // Increment for the next batch
}

function job2() {
  console.log("Running job2 - every 3 hours");
  fetchDataAndUpdate(jobState.job2, 800); // Fetch 800 records starting from jobState.job2
  jobState.job2 += 800; // Increment for the next batch
}

function job3() {
  console.log("Running job3 - every 10 hours");
  fetchDataAndUpdate(jobState.job3, 1100); // Fetch 1100 records starting from jobState.job3
  jobState.job3 += 1100; // Increment for the next batch
}

function job4() {
  console.log("Running job4 - every 16 hours");
  fetchDataAndUpdate(jobState.job4, 8000); // Fetch 8000 records starting from jobState.job4
  jobState.job4 += 8000; // Increment for the next batch
}

function job5() {
  console.log("Running job5 - every 2 days");
  fetchDataAndUpdate(jobState.job5, 10000); // Fetch 10000 records starting from jobState.job5
  jobState.job5 += 10000; // Increment for the next batch
}

// Set up cron jobs with different schedules

// Start the Express server
app.listen(process.env.BASE_PORT || 8090, () => {
  console.log(
    `Proxy server running at http://localhost:${process.env.BASE_PORT || 8090}`
  );
  console.log("Starting cron jobs...");
  cron.schedule("0 * * * *", job1); // Every 1 hour
  cron.schedule("0 */3 * * *", job2); // Every 3 hours
  cron.schedule("0 */10 * * *", job3); // Every 10 hours
  cron.schedule("0 */16 * * *", job4); // Every 16 hours
  cron.schedule("0 0 */2 * *", job5); // Every 2 days
});
