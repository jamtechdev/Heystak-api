import { createLogger, format, transports } from "winston";
import path from "path";
import { fileURLToPath } from "url";

// Get the current file path and directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the log file path
const logFilePath = path.join(__dirname, "logs", "cron_jobs.log");

// Create a Winston logger
const logger = createLogger({
  level: "info",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.printf(
      ({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`
    )
  ),
  transports: [
    new transports.Console(), // Log to console
    new transports.File({ filename: logFilePath }), // Log to file
  ],
});

export default logger;
