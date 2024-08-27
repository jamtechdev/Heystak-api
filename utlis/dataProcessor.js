import fetch from "node-fetch";
import supabase from "./supabaseClient.js";
import { FACEBOOK_ADS_URL } from "./config.js";
import logger from "../_helpers/logger.js";

// Function to split an array into chunks
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// Function to fetch data from Supabase and process it in chunks
export async function fetchDataAndUpdate(pageStart, pageSize, chunkSize = 20) {
  try {
    logger.info(`Fetching data from Supabase starting at page: ${pageStart}`);

    const { count: totalRows, error: countError } = await supabase
      .from("ads")
      .select("*", { count: "exact", head: true });

    if (countError) throw countError;

    if (pageStart >= totalRows) {
      logger.info(
        `Reached the end of available data. Total rows: ${totalRows}`
      );
      return;
    }

    const adjustedPageSize = Math.min(pageSize, totalRows - pageStart);
    const { data, error } = await supabase
      .from("ads")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(pageStart, pageStart + adjustedPageSize - 1);

    if (error) throw error;

    if (data) {
      const ads = data
        .map((ad) => ({
          adId: ad.id,
          adArchiveID: ad.raw_data?.adCard?.adArchiveID,
        }))
        .filter((ad) => ad.adId !== undefined && ad.adArchiveID !== undefined);

      const adChunks = chunkArray(ads, chunkSize);
      logger.info(`Processing ${adChunks.length} chunks...`);

      for (const chunk of adChunks) {
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
            const isActive = match ? JSON.parse(match[1]) : null;
            const changeIsActive = isActive === true ? "active" : "inactive";

            logger.info(
              `Fetched data for ad ${ad.adId} with isActive: ${isActive}`
            );

            if (isActive !== null) {
              const { data: updateData, error: updateError } = await supabase
                .from("ads")
                .update({ live_status: changeIsActive })
                .eq("id", ad.adId);

              if (updateError) {
                logger.error(
                  `Error updating ad with id ${ad.adId}: ${updateError.message}`
                );
              } else {
                logger.info(
                  `Updated ad ${ad.adId} with live_status: ${changeIsActive}`
                );
              }
            } else {
              logger.warn(
                `No isActive status found for ad ${ad.adId}, updating live_status to NULL.`
              );
              // Update logic if needed
            }
          } catch (error) {
            logger.error(`Error processing ad ${ad.adId}: ${error.message}`);
          }
        }
      }
    }
  } catch (error) {
    logger.error(`Error fetching ads data: ${error.message}`);
  }
}
