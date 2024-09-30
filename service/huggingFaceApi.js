import axios from "axios";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

// Function to call Hugging Face API for transcription with timestamps
export const callHuggingFaceApi = async (audioFilePath, apiKey) => {
  // Read audio data from file
  const audioData = fs.readFileSync(audioFilePath);

  try {
    const response = await axios({
      method: "post",
      url: "https://api-inference.huggingface.co/models/openai/whisper-large-v3", // Model URL
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "audio/mp3", // Ensure correct format
      },
      data: audioData, // Send audio data in request body
    });
    console.log(response.data);
    // Log the full response for debugging purposes (optional)
    console.log("Full API Response:", response.data);
    // Check if 'segments' are available in the API response (timestamps and text)
    const segments = response.data.segments;
    if (segments && segments.length > 0) {
      // Map over segments and extract timestamps and transcription text
      const transcriptionWithTimestamps = segments.map((segment) => ({
        start: segment.start, // Start timestamp (seconds)
        end: segment.end, // End timestamp (seconds)
        text: segment.text, // Transcribed text for the segment
      }));

      return transcriptionWithTimestamps; // Return formatted transcription with timestamps
    } else {
      // Fallback: If segments are missing, return the plain transcription text
      console.log("No segments found, returning plain transcription.");
      return [{ text: response.data.text }];
    }
  } catch (error) {
    // Enhanced error logging: Include HTTP status code, message, and response data if available
    if (error.response) {
      console.error(
        `Error with Hugging Face API: ${error.response.status} - ${error.response.data.error}`
      );
    } else {
      console.error(`Error: ${error.message}`);
    }
    // Re-throw error to be caught by the caller
    throw new Error("Failed to process audio with Hugging Face API");
  }
};
