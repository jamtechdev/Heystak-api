import express from "express";
import { extractAudio } from "./audioExtractor.js";
import { callOpenAiWhisperApi } from "./huggingFaceApi.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import axios from "axios";
import OpenAI from "openai";
dotenv.config();
const router = express.Router();
router.get("/", (req, res) => {
  res.send("Hello, World!");
});
// POST endpoint to accept video URL and return transcription with timeline
// POST endpoint to accept video URL and return transcription with timeline
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); // Initialize OpenAI with API key
async function callOpenAITextGenerationAPI(prompt) {
  try {
    const response = await openai.chat.completions.create({
      messages: [{ role: "system", content: prompt }],
      model: "gpt-4",
    });
    return response.choices[0].message; // Return the generated text
  } catch (error) {
    console.error("Error in OpenAI text generation API:", error);
    throw error;
  }
}

router.post("/extract-text", async (req, res) => {
  const {
    videoUrl,
    company_name,
    product_name,
    target_audience,
    language,
    product_description,
    generateAction,
    importInspirationImages,
    generateTextOverlay,
  } = req.body;
  const huggingFaceApiKey = process.env.HUGGING_FACE_API_KEY; // Hugging Face API key from .env
  const openAI_key = process.env.OPENAI_API_KEY;

  if (!videoUrl) {
    return res.status(400).json({ error: "No video URL provided" });
  }

  try {
    // Step 1: Extract audio from video
    const outputAudioFile = await extractAudio(videoUrl);

    // Step 2: Send extracted audio to Hugging Face API and get transcription with timestamps
    const transcription = await callOpenAiWhisperApi(
      outputAudioFile,
      openAI_key
    );

    const prompt = `
            Company Name: ${company_name}
            Product Name: ${product_name}
            Target Audience: ${target_audience}
            Language: ${language}
            Product Description: ${product_description}
            Transcription: ${transcription[0].text}
            Action: ${generateAction ? generateAction : "None"}
            Inspiration Images: ${importInspirationImages ? "Yes" : "No"}
            Text Overlay: ${generateTextOverlay ? "Yes" : "No"}
            Generate a creative and engaging marketing script for the video transcription above, considering the company name, product description, and target audience.
            create a marketing script for the video transcription
        `;

    // Step 4: Call Hugging Face API for script generation
    const script = await callOpenAITextGenerationAPI(prompt);
    console.log(script);

    // Step 5: Return the transcription and generated script
    res.status(200).json({
      transcription, // Transcription with start/end times
      generatedScript: script, // Generated marketing script
    });
  } catch (error) {
    console.error("Error occurred:", error);
    res.status(500).json({ error: "Failed to process the video" });

    // Ensure the file is deleted in case of an error
    if (fs.existsSync(outputAudioFile)) {
      fs.unlinkSync(outputAudioFile);
    }
  }
});

export default router;
