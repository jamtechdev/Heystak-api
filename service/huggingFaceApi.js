import axios from "axios";
import fs from "fs";
import dotenv from "dotenv";
import FormData from "form-data";  

dotenv.config();
export const callOpenAiWhisperApi = async (audioFilePath, apiKey) => {
  try {
    const formData = new FormData();
    const audioFile = fs.createReadStream(audioFilePath);
    formData.append("file", audioFile);  
    formData.append("model", "whisper-1"); 
    // Set headers manually, as axios doesn't set them correctly with FormData
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      ...formData.getHeaders(),  
    };
    const response = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      formData,
      { headers }
    );
    const transcriptionText = response.data.text;
    const segments = response.data.segments; 
    console.log(segments,"timeline")
    if (transcriptionText) {
      return [{ text: transcriptionText }]; 
    } else {
      console.log("No transcription found.");
      return [{ text: "No transcription available." }];
    }
  } catch (error) {
    if (error.response) {
      console.error(
        `Error with OpenAI Whisper API: ${error.response.status} - ${error.response.data.error.message}`
      );
    } else {
      console.error(`Error: ${error.message}`);
    }
    throw new Error("Failed to process audio with OpenAI Whisper API");
  }
};


