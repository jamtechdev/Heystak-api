import express from "express";
import { extractAudio } from "./audioExtractor.js";
import { callOpenAiWhisperApi } from "./huggingFaceApi.js";
import dotenv from "dotenv";
import fs from "fs";
import OpenAI from "openai";
import cors from "cors";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));
router.use(cors());

router.use(express.static(path.join(__dirname, "generated_images")));
router.use(
  "/generated_images",
  express.static(path.join(__dirname, "generated_images"))
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
  console.log(CallToAction);
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
      scene_type: intent, // Modify this based on your logic
      script_copy: scriptCopy,
      action_description: actionDescription,
      text_overlay: textOverlay,
      company_name: company_name,
      product_name: product_name,
      target_audience: target_audience,

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
    Using the provided Script Copy and action descriptions,productName, companyName,target_audiance,generate a storyboard by converting the scene into an image that aligns with the brand’s style and assets.

    Scene Number: ${scene.scene_number}
    productName:${scene.product_name}

    companyName:${scene.company_name}
    target_audiance:${scene.target_audiance}

    Script Copy: "${scene.script_copy}"

    Action Description: "${scene.action_description}"

    Text Overlay: "${scene.text_overlay}"
    give a summary of the scene
    The image should visually represent the action described, while incorporating the brand's visual identity, such as colors, product features, and tone.
  `;
}

function saveImageToFolder(imageData, fileName) {
  const folderPath = path.join(__dirname, "generated_images");

  // Ensure the folder exists
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath);
  }

  const filePath = path.join(folderPath, fileName);

  // Write the image to the folder
  fs.writeFileSync(filePath, imageData, "base64");

  return fileName; // Return only the filename
}

// Helper function to call Hugging Face API for image generation
async function generateImageFromHuggingFace(prompt, sceneNumber) {
  const huggingFaceApiKey = process.env.HUGGING_FACE_API_KEY;

  try {
    const response = await axios.post(
      `https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-dev`,
      { inputs: prompt },
      {
        headers: {
          Authorization: `Bearer ${huggingFaceApiKey}`,
        },
        responseType: "arraybuffer", // For binary data (image)
      }
    );

    // Convert the binary image to base64 and save it as a PNG file
    const base64Image = Buffer.from(response.data, "binary").toString("base64");
    const fileName = `scene_${sceneNumber + new Date().getTime()}.png`;

    // Save the image to the local folder and return the filename
    return saveImageToFolder(base64Image, fileName);
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
}

router.get("/", (req, res) => {
  res.json({ message: "Welcome to the transcription service" });
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

  try {
    //Extract audio from video
    const outputAudioFile = await extractAudio(videoUrl);
    // Call gpt api ket to extract text from audio file
    const transcription = await callOpenAiWhisperApi(
      outputAudioFile,
      openAI_key
    );
    const transcriptionText = transcription[0].text;
    const originalScenes = createScenesFromTranscription(transcriptionText);
    const numberOfScenes = originalScenes.length;

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

    console.log("prompt :-", prompt);
    // Step 4: Call OpenAI API for script generation
    const generatedScript = await callOpenAITextGenerationAPI(prompt);
    console.log("Generated Script :-", generatedScript);
    // Parse the generated script into structured scenes
    const parsedGeneratedScript = parseGeneratedScript(
      generatedScript,
      company_name,
      product_name,
      target_audience
    );
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
router.post("/generate-image", async (req, res) => {
  try {
    const { data } = req.body;

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({
        success: false,
        message: "Invalid scenes data.",
      });
    }

    const processScene = async (scene) => {
      try {
        const prompt = generatePromptForScene(scene);
        const response = await openai.chat.completions.create({
          model: "gpt-4",
          messages: [{ role: "user", content: prompt }],
        });
        const generatedPrompt = response?.choices?.[0]?.message?.content;
        if (!generatedPrompt) {
          throw new Error("Failed to generate prompt from OpenAI.");
        }
        const imageFileName = await generateImageFromHuggingFace(
          generatedPrompt,
          scene.scene_number
        );
        return {
          scene_number: scene.scene_number,
          generated_prompt: generatedPrompt,
          generated_image: `/generated_images/${imageFileName}`,
        };
      } catch (error) {
        console.error(`Error processing scene ${scene.scene_number}:`, error);
        return {
          scene_number: scene.scene_number,
          error: "Failed to process scene.",
        };
      }
    };

    const results = await Promise.all(data.map((scene) => processScene(scene)));

    res.json({
      success: results.every((result) => !result.error),
      storyboards: results,
    });
  } catch (error) {
    console.error("Failed to generate storyboard and images:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate storyboard and images.",
    });
  }
});

export default router;
