import express from 'express';
import { extractAudio } from './audioExtractor.js';
import { callHuggingFaceApi } from './huggingFaceApi.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const router = express.Router();

router.get('/', (req, res) => {
    res.send('Hello, World!');
});

// POST endpoint to accept video URL and return transcription with timeline
router.post('/extract-text', async (req, res) => {
    const { videoUrl } = req.body;
    const huggingFaceApiKey = process.env.HUGGING_FACE_API_KEY;  // Hugging Face API key from .env

    if (!videoUrl) {
        return res.status(400).json({ error: 'No video URL provided' });
    }

    try {
        // Step 1: Extract audio from video
        const outputAudioFile = await extractAudio(videoUrl);

        // Step 2: Send extracted audio to Hugging Face API and get transcription with timestamps
        const transcription = await callHuggingFaceApi(outputAudioFile, huggingFaceApiKey);

        // Step 3: Return the transcription text with timestamps and audio file path as the response
        res.status(200).json({
            transcription,  // Transcription with start/end times
            audioFilePath: `/music/${path.basename(outputAudioFile)}`  // Provide path to the audio file
        });

        // Step 4: Delete the audio file after the response
        fs.unlinkSync(outputAudioFile);
    } catch (error) {
        console.error('Error occurred:', error);
        res.status(500).json({ error: 'Failed to process the video' });

        // Ensure the file is deleted in case of an error
        if (fs.existsSync(outputAudioFile)) {
            fs.unlinkSync(outputAudioFile);
        }
    }
});

export default router;
