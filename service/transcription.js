import express from "express";
import { extractAudio } from "./audioExtractor.js";
import { callOpenAiWhisperApi } from "./huggingFaceApi.js";
import dotenv from "dotenv";
import fs from "fs";
import OpenAI from "openai";
import cors from "cors";
dotenv.config();

const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));
router.use(cors());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); // Initialize OpenAI with API key

// Helper function to call OpenAI API for text generation
async function callOpenAITextGenerationAPI(prompt) {
  try {
    const response = await openai.chat.completions.create({
      messages: [{ role: "system", content: prompt }],
      model: "gpt-4",
    });

    if (!response || !response.choices || !response.choices[0].message) {
      throw new Error("Invalid response from OpenAI API");
    }

    return response.choices[0].message.content; // Return the generated text content
  } catch (error) {
    console.error("Error in OpenAI text generation API:", error);
    throw error;
  }
}

// Helper function to create scenes from transcription
function createScenesFromTranscription(transcriptionText) {
  const sentences = transcriptionText.split(". "); // Split transcription into sentences
  return sentences.map((sentence, index) => ({
    scene_number: (index + 1).toString(),
    scene_type: "General", // You can add logic to assign specific scene types if needed
    script_copy: sentence.trim(),
  }));
}

// Function to calculate word count and estimated duration
function calculateWordCountAndDuration(scriptCopy) {
  const words = scriptCopy.split(' ').length;
  const speakingRate = { min: 130, max: 150 }; // Words per minute
  const durationMin = (words / speakingRate.max).toFixed(2);
  const durationMax = (words / speakingRate.min).toFixed(2);

  const formattedDurationMin = formatDuration(durationMin);
  const formattedDurationMax = formatDuration(durationMax);

  return {
    words,
    duration: `${formattedDurationMin} - ${formattedDurationMax}`
  };
}

// Helper function to format duration from decimal minutes to "mm:ss"
function formatDuration(decimalMinutes) {
  const totalSeconds = Math.floor(decimalMinutes * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Helper function to parse the generated script
function parseGeneratedScript(generatedScript) {
  // Split the generated script into blocks based on double line breaks (each scene)
  const scenes = generatedScript.split("\n\n").map((block, index) => {
    // Split each block into lines
    const lines = block.split("\n").filter((line) => line);

    // Capture Script Copy
    const scriptCopyLine = lines.find((line) => line.includes("Script Copy:"));
    const scriptCopy = scriptCopyLine
      ? scriptCopyLine.replace("Script Copy:", "").trim()
      : "No content available";

    // Capture Action & Description
    const actionDescriptionLine = lines.find((line) =>
      line.includes("Action & Description:")
    );
    const actionDescription = actionDescriptionLine
      ? actionDescriptionLine.replace("Action & Description:", "").trim()
      : "No action available";

    // Capture Text Overlay
    const textOverlayLine = lines.find((line) =>
      line.includes("Text Overlay:")
    );
    const textOverlay = textOverlayLine
      ? textOverlayLine.replace("Text Overlay:", "").trim()
      : "No overlay available";

    // Calculate word count and duration for the script copy
    const { words, duration } = calculateWordCountAndDuration(scriptCopy);

    // Return parsed scene as an object with word count and duration
    return {
      scene_number: (index + 1).toString(),
      scene_type: "General", // Modify this based on your logic
      script_copy: scriptCopy,
      action_description: actionDescription,
      text_overlay: textOverlay,
      summary: {
        words: `${words} Words`,
        duration: `${duration} Duration`
      }
    };
  });

  return scenes;
}

router.post("/extract-text", async (req, res) => {
  const {
    videoUrl,
    company_name,
    product_name,
    target_audience,
    language,
    product_description,
  } = req.body;

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
    const transcriptionText = transcription[0].text;
    const originalScenes = createScenesFromTranscription(transcriptionText);
    const numberOfScenes = originalScenes.length;

    // Step 3: Create the prompt for OpenAI to generate the rewritten script
    const prompt = `
    Using the provided video transcription and brand details, generate a new script tailored to the company's brand assets. Ensure that the rewritten script remains simple, concise, and consistent across all sections. Avoid over-complicating or writing too much.
    
    Company Name: ${company_name}
    Product Name: ${product_name}
    Target Audience: ${target_audience}
    Language: ${language}
    Product Description: ${product_description}
    Transcription: ${transcriptionText}
    
    Generate exactly ${numberOfScenes} scenes for this video, ensuring that each scene is **unique** and does not repeat any previous scene.
    
    For each scene, provide the following:
    
    1. Script Copy: Rewrite the sentence in a clear and concise manner, maintaining a consistent tone and message with the brand's identity. Keep it simple and impactful.
    2. Action & Description: Describe what visual elements or scenes should be shown for this part of the script. The visual description should align with the brand and product messaging.
    3. Text Overlay: Provide short and impactful on-screen text that reinforces the message without being wordy.
    
    Guidelines:
    - Keep the script copy short and impactful.
    - Ensure all visual descriptions and text overlays are simple and aligned with the brand tone.
    - Avoid unnecessary details or over-explanation.
    - **Each scene should be distinct and provide new information or a new angle on the product.**
    `;

    console.log("prompt :-", prompt);
    // Step 4: Call OpenAI API for script generation
    const generatedScript = await callOpenAITextGenerationAPI(prompt);
    console.log("Generated Script :-", generatedScript);
    // Parse the generated script into structured scenes
    const parsedGeneratedScript = parseGeneratedScript(generatedScript);
    // Step 5: Return the structured response
    res.status(200).json({
      original: { scenes: originalScenes },
      generated: { scenes: parsedGeneratedScript },
    });

    // Clean up audio file after processing
    if (fs.existsSync(outputAudioFile)) {
      fs.unlinkSync(outputAudioFile);
    }
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
