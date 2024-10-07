import express from "express";
import cors from "cors";
import { BASE_PORT } from "./utlis/config.js";
import { startCronJobs } from "./cronJobs.js";
import logger from "./_helpers/logger.js";
import transcriptionRoutes from "./service/transcription.js";
const app = express();
app.use(cors());
app.use(express.json()); // Parse incoming JSON requests
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded requests (if needed)
app.use('/', transcriptionRoutes)
app.listen(BASE_PORT, () => {
  logger.info(`Proxy server running at http://localhost:${BASE_PORT}`);
  startCronJobs();
});
