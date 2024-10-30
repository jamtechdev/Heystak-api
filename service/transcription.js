import express from "express";
import OpenAI from "openai";
import axios from "axios";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

// Constants
const HUGGING_FACE_MODEL_URL = "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell";
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

/**
 * Helper function to save the generated image to the folder.
 * @param {string} imageData - Base64 image data.
 * @param {string} fileName - File name for the image.
 * @returns {string} - File path of the saved image.
 */
function saveImageToFolder(imageData, fileName) {
  const folderPath = path.join(__dirname, "generated_images");
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath);
  }

  const filePath = path.join(folderPath, fileName);
  fs.writeFileSync(filePath, imageData, "base64");
  return fileName;
}

/**
 * Helper function to generate an image from Hugging Face API with retry logic.
 * @param {string} prompt - Prompt for generating the image.
 * @param {number} sceneNumber - Scene number for naming the image file.
 * @param {number} maxRetries - Maximum number of retries.
 * @returns {Promise<string>} - File name of the generated image.
 */
async function generateImageFromHuggingFace(prompt, sceneNumber, maxRetries = MAX_RETRIES) {
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

      const base64Image = Buffer.from(response.data, "binary").toString("base64");
      const fileName = `scene_${sceneNumber}_${Date.now()}.png`;
      return saveImageToFolder(base64Image, fileName);
    } catch (error) {
      if (error.response?.status === 429 && attempt < maxRetries - 1) {
        const delayTime = Math.pow(2, attempt) * DELAY_BETWEEN_RETRIES;
        console.log(`Rate limit reached. Retrying in ${delayTime / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delayTime));
      } else {
        console.error("Error generating image:", error.message);
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
    // Generate the prompt for the scene
    const prompt = generatePromptForScene(scene);

    // Call OpenAI to generate an image prompt
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
    });

    const generatedPrompt = response?.choices?.[0]?.message?.content;
    if (!generatedPrompt) {
      throw new Error("Failed to generate prompt from OpenAI.");
    }

    // Call Hugging Face to generate the image
    const imageFileName = await generateImageFromHuggingFace(generatedPrompt, scene.scene_number);

    return {
      scene_number: scene.scene_number,
      generated_prompt: generatedPrompt,
      generated_image: `/generated_images/${imageFileName}`,
    };
  } catch (error) {
    console.error(`Error processing scene ${scene.scene_number}:`, error.message);
    return {
      scene_number: scene.scene_number,
      error: "Failed to process scene.",
    };
  }
}

// Route to generate images sequentially
router.post("/generate-image", async (req, res) => {
  try {
    const { data } = req.body;
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({
        success: false,
        message: "Invalid scenes data.",
      });
    }

    const results = [];

    // Process scenes one-by-one (sequentially)
    for (const scene of data) {
      const result = await processScene(scene);
      results.push(result);

      // Optional: Add a delay between scenes to avoid potential rate limits
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

export default router;
