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
            .outputOptions([
                '-max_muxing_queue_size 1024',
                '-threads 4',           // Limit threads
                '-preset fast',         // Use faster encoding
                '-movflags faststart'   // Enable fast start
            ])
            .noVideo()
            .audioCodec('libmp3lame')
            .audioBitrate('128k')      // Set a reasonable bitrate
            .format('mp3')
            .on('start', (command) => {
                console.log('FFmpeg process started:', command);
            })
            .on('progress', (progress) => {
                console.log('Processing: ' + progress.percent + '% done');
            })
            .on('end', () => {
                console.log('Audio extraction completed');
                resolve(outputFilePath);
            })
            .on('error', (err) => {
                console.error('FFmpeg error:', err);
                reject(err);
            })
            .save(outputFilePath);
    });
};