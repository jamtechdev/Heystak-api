import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import path from 'path';
import fs from 'fs';

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

// Ensure the music folder exists
const musicFolder = path.resolve('music');
if (!fs.existsSync(musicFolder)) {
    fs.mkdirSync(musicFolder);
}

// Function to extract audio from video
export const extractAudio = (videoUrl) => {
    return new Promise((resolve, reject) => {
        const outputAudioFileName = `output_audio_${Date.now()}.mp3`;
        const outputFilePath = path.resolve(musicFolder, outputAudioFileName);

        ffmpeg(videoUrl)
            .noVideo() 
            .audioCodec('libmp3lame') 
            .format('mp3') 
            .on('end', () => resolve(outputFilePath))
            .on('error', (err) => reject(err))
            .save(outputFilePath);
    });
};
