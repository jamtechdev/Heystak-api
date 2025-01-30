import express from "express";
import { processVideoUrl } from "./audioExtractor.js";
import { callOpenAiWhisperApi } from "./huggingFaceApi.js";
import dotenv from "dotenv";
import fs from "fs";
import OpenAI from "openai";
import cors from "cors";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import { Authenticate } from "../Middleware/Authenticate.js";
import { adTrackerController } from "../Controller/ScrapController/ScrapController.js";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();
// CORS setup
router.use(cors({ origin: "*", methods: "GET,POST,PUT,DELETE" }));
router.use(express.json());
router.use(express.urlencoded({ extended: true }));
router.use(express.static(path.join(__dirname, "generated_images")));
router.use(
  "/generated_images",
  express.static(path.join(__dirname, "generated_images"))
);
router.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.path}`);
  next();
});

const HUGGING_FACE_MODEL_URL =
  "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell";
const MAX_RETRIES = 5;
const DELAY_BETWEEN_RETRIES = 2000; // 2 seconds delay between retries
// OpenAI API initialization
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// Serve static files from the "generated_images" folder
router.use(express.static(path.join(__dirname, "generated_images")));
/**
 * Helper function to generate a prompt for a scene.
 * @param {Object} scene - The scene object containing details.
 * @returns {string} - Generated prompt for the scene.
 */

async function callOpenAITextGenerationAPI(prompt) {
  try {
    const response = await openai.chat.completions.create({
      messages: [{ role: "system", content: prompt }],
      model: "gpt-4",
    });

    if (!response || !response.choices || !response.choices[0].message) {
      throw new Error("Invalid response from OpenAI API");
    }

    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error in OpenAI text generation API:", error);
    throw error;
  }
}
const CallToAction = [];
function createScenesFromTranscription(transcriptionText) {
  const sentences = transcriptionText.split(". ");
  return sentences.map((sentence, index) => ({
    scene_number: (index + 1).toString(),
    scene_type: CallToAction,
    script_copy: sentence.trim(),
  }));
}
function calculateWordCountAndDuration(scriptCopy) {
  const words = scriptCopy.split(" ").length;
  const speakingRate = { min: 130, max: 150 };
  const durationMin = (words / speakingRate.max).toFixed(2);
  const durationMax = (words / speakingRate.min).toFixed(2);
  const formattedDurationMin = formatDuration(durationMin);
  const formattedDurationMax = formatDuration(durationMax);
  return {
    words,
    duration: `${formattedDurationMin} - ${formattedDurationMax}`,
  };
}
function formatDuration(decimalMinutes) {
  const totalSeconds = Math.floor(decimalMinutes * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
}
function parseGeneratedScript(
  generatedScript,
  company_name,
  product_name,
  target_audience
) {
  const scenes = generatedScript.split("\n\n").map((block, index) => {
    const lines = block.split("\n").filter((line) => line);
    const scriptCopyLine = lines.find((line) => line.includes("Script Copy:"));
    const scriptCopy = scriptCopyLine
      ? scriptCopyLine.replace("Script Copy:", "").trim()
      : "No content available";
    const actionDescriptionLine = lines.find((line) =>
      line.includes("Action & Description:")
    );
    const actionDescription = actionDescriptionLine
      ? actionDescriptionLine.replace("Action & Description:", "").trim()
      : "No action available";
    const textOverlayLine = lines.find((line) =>
      line.includes("Text Overlay:")
    );
    const imageDescriptionLine = lines.find((line) =>
      line.includes("Image Description:")
    );
    const textOverlay = textOverlayLine
      ? textOverlayLine.replace("Text Overlay:", "").trim()
      : "No overlay available";
    const intentLine = lines.find((line) => line.includes("Intent Analysis:"));
    const intent = intentLine
      ? intentLine.replace("Intent Analysis:", "").trim()
      : "No intent available";
    CallToAction.push(intent);
    const { words, duration } = calculateWordCountAndDuration(scriptCopy);
    return {
      scene_number: (index + 1).toString(),
      scene_type: intent,
      script_copy: scriptCopy,
      action_description: actionDescription,
      text_overlay: textOverlay,
      imageDescriptionLine: imageDescriptionLine,
      company_name,
      product_name,
      target_audience,
      summary: {
        words: `${words} Words`,
        duration: `${duration} Duration`,
        intent: intent,
      },
    };
  });

  return scenes;
}
function generatePromptForScene(scene) {
  return `
    Using the provided script copy and action descriptions, generate a storyboard by converting the scene into an image that aligns with the brand’s style and assets.

    Scene Number: ${scene.scene_number}
    Product Name: ${scene.product_name}
    Company Name: ${scene.company_name}
    Target Audience: ${scene.target_audience}

    Script Copy: "${scene.script_copy}"
    Action Description: "${scene.action_description}"
    Text Overlay: "${scene.text_overlay}"

    The image should visually represent the action described, while incorporating the brand's visual identity, such as colors, product features, and tone.
  `;
}

function saveImageToFolder(imageData, fileName) {
  const folderPath = path.join(__dirname, "generated_images");

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath);
  }

  const filePath = path.join(folderPath, fileName);
  fs.writeFileSync(filePath, imageData, "base64");
  return fileName;
}
async function generateImageFromHuggingFace(
  prompt,
  sceneNumber,
  maxRetries = 3
) {
  const huggingFaceApiKey = process.env.HUGGING_FACE_API_KEY;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await axios.post(
        HUGGING_FACE_MODEL_URL,
        { inputs: prompt },
        {
          headers: {
            Authorization: `Bearer ${huggingFaceApiKey}`,
          },
          responseType: "arraybuffer",
        }
      );

      const base64Image = Buffer.from(response.data, "binary").toString(
        "base64"
      );
      const fileName = `scene_${sceneNumber + new Date().getTime()}.png`;
      return saveImageToFolder(base64Image, fileName);
    } catch (error) {
      if (error.response?.status === 429 && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(
          `Rate limit reached. Retrying in ${delay / 1000} seconds...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error("Error generating image:", error);
        throw error;
      }
    }
  }

  throw new Error("Failed to generate image after maximum retries.");
}
/**
 * Helper function to process a single scene and generate an image.
 * @param {Object} scene - The scene object containing details.
 * @returns {Promise<Object>} - Result object containing scene info and image file name.
 */
async function processScene(scene) {
  try {
    const imageFileName = await generateImageFromHuggingFace(
      scene?.imageDescription,
      scene.sceneNumber
    );
    return {
      scene_number: scene.sceneNumber,
      generated_prompt: scene?.imageDescription,
      generated_image: `/generated_images/${imageFileName}`,
    };
  } catch (error) {
    console.error(
      `Error processing scene ${scene.scene_number}:`,
      error.message
    );
    return {
      scene_number: scene.scene_number,
      error: "Failed to process scene.",
    };
  }
}
// extract only Image Description
function getImageDescriptionsOnly(scenes) {
  return scenes.map((scene) => ({
    sceneNumber: scene.scene_number,
    imageDescription: scene.imageDescriptionLine
      .replace("- Image Description: ", "")
      .trim(),
  }));
}
router.get("/", (req, res) => {
  res.send("Hello, World!");
});
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
  console.log("videoUrl", videoUrl);
  try {
    const outputAudioFile = await processVideoUrl(videoUrl);
    console.log("outputAudioFile", outputAudioFile);

    const transcription = await callOpenAiWhisperApi(
      outputAudioFile,
      openAI_key
    );
    const transcriptionText = transcription[0].text;
    const originalScenes = createScenesFromTranscription(transcriptionText);
    const numberOfScenes = originalScenes.slice(0, 5).length;

    const prompt = `
    Using the provided video transcription and brand details, generate a *completely new* script tailored to the company's brand assets. Ensure that the rewritten script remains simple, concise, and consistent across all sections. Avoid over-complicating or writing too much, but *do not copy the original text*.

    The new script should express the same ideas but using fresh, original wording and phrasing.

    Company Name: ${company_name}
    Product Name: ${product_name}
    Target Audience: ${target_audience}
    Language: ${language}
    Product Description: ${product_description}
    Transcription: ${transcriptionText}

    Generate exactly ${numberOfScenes} scenes for this video, ensuring that each scene is **unique** and does not repeat any previous scene.

    For each scene, provide the following:

    1. Script Copy: *Rephrase the sentence* in a clear and concise manner, maintaining a consistent tone and message with the brand's identity. Use *new wording* and *avoid reusing phrases* from the original.
    2. Action & Description: Describe what visual elements or scenes should be shown for this part of the script. The visual description should align with the brand and product messaging.
    3. Text Overlay: Provide short and impactful on-screen text that reinforces the message without being wordy.
    4. Image Description : 'Using the provided script copy and action descriptions, generate a storyboard image by converting the scene into an image that aligns with the brand’s style and assets.
    The image should visually represent the action described, while incorporating the brand's visual identity, such as colors, product features, and tone'.

    **Intent Analysis:**
    For each sentence, provide a one-word summary that captures the primary intent or purpose of the message (e.g., "Tease," "Offer," "Call-to-action").
    Ensure the one-word summaries are precise and aligned with the overall script structure.

    Guidelines:
    - Ensure each scene feels distinct in its language from the original transcription.
    - Keep the script copy short and impactful.
    - Ensure all visual descriptions and text overlays are simple and aligned with the brand tone.
    - Avoid unnecessary details or over-explanation.
    - **Each scene should be distinct and provide new information or a new angle on the product.**
    - Provide a one-word intent analysis for each sentence.

    Using the provided Script Copy and action descriptions, generate a storyboard by converting each scene into images that align with the brand’s style and assets. The storyboard should visually represent the flow of the ad, using appropriate visuals for each action described in the script. Each image should correspond to a scene from the script, reflecting the actions, and incorporating brand assets.
    `;
    const generatedScript = await callOpenAITextGenerationAPI(prompt);
    console.log(generatedScript);
    const parsedGeneratedScript = parseGeneratedScript(
      generatedScript,
      company_name,
      product_name,
      target_audience
    );
    res.status(200).json({
      original: { scenes: originalScenes },
      generated: { scenes: parsedGeneratedScript },
    });

    if (fs.existsSync(outputAudioFile)) {
      fs.unlinkSync(outputAudioFile);
    }
  } catch (error) {
    console.error("Error occurred:", error);
    res.status(500).json({ error: "Failed to process the video" });
  }
});
router.post("/generate-image", async (req, res) => {
  try {
    const { data } = req.body;
    const imageDescriptions = getImageDescriptionsOnly(data);
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({
        success: false,
        message: "Invalid scenes data.",
      });
    }
    const results = [];
    // Process scenes one-by-one (sequentially)
    for (const scene of imageDescriptions) {
      const result = await processScene(scene);
      results.push(result);
      await new Promise((resolve) => setTimeout(resolve, 500)); // 0.5-second delay
    }
    res.json({
      success: results.every((result) => !result.error),
      storyboards: results,
    });
  } catch (error) {
    console.error("Failed to generate storyboard and images:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to generate storyboard and images.",
    });
  }
});
router.post("/ad-tracker", Authenticate, adTrackerController?.trackAd);
export default router;
