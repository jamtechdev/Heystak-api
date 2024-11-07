import express from "express";
import cors from "cors";
import { BASE_PORT } from "./utlis/config.js";
import { startCronJobs } from "./cronJobs.js";
import logger from "./_helpers/logger.js";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import transcriptionRoutes from "./service/transcription.js";
const app = express();
app.use(cors({ origin: '*', methods: 'GET,POST,PUT,DELETE' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/generated_images', express.static(path.join(__dirname, 'generated_images')));

app.use(express.urlencoded({ extended: true }));
app.use("/", transcriptionRoutes);
app.listen(BASE_PORT, () => {
  logger.info(`Proxy server running at http://localhost:${BASE_PORT}`);
  // startCronJobs();
});
