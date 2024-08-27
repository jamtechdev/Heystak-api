import cron from "node-cron";
import { fetchDataAndUpdate } from "./utlis/dataProcessor.js";
import logger from "./_helpers/logger.js";

// HashMap to store the last processed page for each job
const jobState = {
  job1: 0,
  job2: 101,
  job3: 900,
  job4: 2000,
  job5: 10000,
};

// Cron job functions for each interval
function job1() {
  logger.info("Running job1 - every 1 minute");
  fetchDataAndUpdate(jobState.job1, 100);
  jobState.job1 += 100;
  logger.info(`Job1 completed - Next start at ${jobState.job1}`);
}

function job2() {
  logger.info("Running job2 - every 2 minutes");
  fetchDataAndUpdate(jobState.job2, 800);
  jobState.job2 += 800;
  logger.info(`Job2 completed - Next start at ${jobState.job2}`);
}

function job3() {
  logger.info("Running job3 - every 3 minutes");
  fetchDataAndUpdate(jobState.job3, 1100);
  jobState.job3 += 1100;
  logger.info(`Job3 completed - Next start at ${jobState.job3}`);
}

// Additional jobs if needed
function job4() {
  logger.info("Running job4 - every 3 minutes"); // Adjusted to every 3 minutes for example purposes
  fetchDataAndUpdate(jobState.job4, 8000);
  jobState.job4 += 8000;
  logger.info(`Job4 completed - Next start at ${jobState.job4}`);
}

function job5() {
  logger.info("Running job5 - every 3 minutes"); // Adjusted to every 3 minutes for example purposes
  fetchDataAndUpdate(jobState.job5, 10000);
  jobState.job5 += 10000;
  logger.info(`Job5 completed - Next start at ${jobState.job5}`);
}
// Set up cron jobs
export function startCronJobs() {
  console.log("Starting cron jobs...");
  cron.schedule("0 * * * *", job1);
  cron.schedule("0 */3 * * *", job2);
  cron.schedule("0 */10 * * *", job3);
  cron.schedule("0 */16 * * *", job4);
  cron.schedule("0 0 */2 * *", job5);
}
