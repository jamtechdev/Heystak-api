import axios from "axios";
import fs from "fs";
import dotenv from "dotenv";
import FormData from "form-data";  // Ensure you are using FormData for multipart form data

dotenv.config();

// Function to call OpenAI API for transcription with Whisper model
export const callOpenAiWhisperApi = async (audioFilePath, apiKey) => {
  try {
    // Create a form and append the audio file and model information
    const formData = new FormData();
    const audioFile = fs.createReadStream(audioFilePath); // Use a file stream for large files

    formData.append("file", audioFile);  // Attach the audio file to the request
    formData.append("model", "whisper-1");  // Specify the Whisper model

    // Set headers manually, as axios doesn't set them correctly with FormData
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      ...formData.getHeaders(),  // This is important to include the correct form-data headers
    };

    // Send the POST request to OpenAI API
    const response = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      formData,
      { headers }
    );

    // Log the response from OpenAI API
    console.log("Full API Response:", response.data);

    // Check if transcription is available
    const transcriptionText = response.data.text;
    if (transcriptionText) {
      return [{ text: transcriptionText }];  // Return the transcribed text
    } else {
      console.log("No transcription found.");
      return [{ text: "No transcription available." }];
    }
  } catch (error) {
    // Enhanced error logging
    if (error.response) {
      console.error(
        `Error with OpenAI Whisper API: ${error.response.status} - ${error.response.data.error.message}`
      );
    } else {
      console.error(`Error: ${error.message}`);
    }
    // Re-throw the error
    throw new Error("Failed to process audio with OpenAI Whisper API");
  }
};


