import axios from 'axios';
import fs from 'fs';
import dotenv from "dotenv";

dotenv.config();

// Function to call Hugging Face API for transcription with timestamps
export const callHuggingFaceApi = async (audioFilePath, apiKey) => {
    const audioData = fs.readFileSync(audioFilePath);

    try {
        const response = await axios({
            method: 'post',
            url: 'https://api-inference.huggingface.co/models/openai/whisper-large-v3', // Example speech-to-text model
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'audio/mp3',
            },
            data: audioData,
        });

        // Log the full response to inspect if segments are available
        console.log('Full API Response:', response.data);

        // Check if the response includes 'segments' which contain start and end times
        const segments = response.data.segments;

        if (segments && segments.length > 0) {
            // Extract transcription with timestamps (start and end time)
            const transcriptionWithTimestamps = segments.map(segment => ({
                start: segment.start, // Timestamp for start
                end: segment.end, // Timestamp for end
                text: segment.text // Transcription text
            }));

            return transcriptionWithTimestamps;  // Return transcription with timestamps
        } else {
            // If no segments are found, fallback to plain transcription
            console.log('No segments found, returning plain transcription.');
            return [{ text: response.data.text }];
        }
    } catch (error) {
        console.error('Error with Hugging Face API:', error.response ? error.response.data : error.message);
        throw new Error('Failed to process audio with Hugging Face API');
    }
};