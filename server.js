import express from "express";
import cors from "cors";
import { BASE_PORT } from "./utlis/config.js";
import { startCronJobs } from "./cronJobs.js";
import logger from "./_helpers/logger.js";

const app = express();

app.use(cors());

app.listen(BASE_PORT, () => {
  logger.info(`Proxy server running at http://localhost:${BASE_PORT}`);
  startCronJobs();
});
