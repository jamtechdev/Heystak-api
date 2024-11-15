import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

// Convert fs methods to promises
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);
const unlink = promisify(fs.unlink);

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

// Configuration object
const config = {
    outputDir: 'music',
    defaultBitrate: '128k',
    maxRetries: 3,
    retryDelay: 1000, // ms
    cleanup: true     // automatically cleanup failed extractions
};

/**
 * Ensures the output directory exists
 * @param {string} dir - Directory path
 * @returns {Promise<void>}
 */
async function ensureDirectory(dir) {
    try {
        await access(dir);
    } catch {
        await mkdir(dir, { recursive: true });
    }
}

/**
 * Validates the video URL
 * @param {string} url - Video URL or file path
 * @returns {Promise<boolean>}
 */
async function validateInput(url) {
    try {
        await access(url);
        return true;
    } catch {
        // If it's not a local file, assume it's a valid URL
        return url.startsWith('http://') || url.startsWith('https://');
    }
}

/**
 * Extracts audio from a video file
 * @param {string} videoUrl - Path or URL to video file
 * @param {Object} options - Extraction options
 * @returns {Promise<string>} Path to the extracted audio file
 */
export const extractAudio = async (videoUrl, options = {}) => {
    const {
        bitrate = config.defaultBitrate,
        outputFormat = 'mp3',
        outputDir = config.outputDir,
        cleanup = config.cleanup
    } = options;

    // Validate input
    if (!videoUrl) {
        throw new Error('Video URL or path is required');
    }

    const isValid = await validateInput(videoUrl);
    if (!isValid) {
        throw new Error('Invalid video source');
    }

    // Ensure output directory exists
    const musicFolder = path.resolve(outputDir);
    await ensureDirectory(musicFolder);

    // Generate output filename
    const outputAudioFileName = `audio_${Date.now()}.${outputFormat}`;
    const outputFilePath = path.resolve(musicFolder, outputAudioFileName);

    let retries = 0;
    
    while (retries < config.maxRetries) {
        try {
            await new Promise((resolve, reject) => {
                const command = ffmpeg(videoUrl)
                    .outputOptions([
                        '-max_muxing_queue_size 1024',
                        '-threads 4',
                        '-preset fast',
                        '-movflags faststart'
                    ])
                    .noVideo()
                    .audioCodec('libmp3lame')
                    .audioBitrate(bitrate)
                    .format(outputFormat);

                // Add progress tracking
                let lastProgress = 0;
                command.on('progress', (progress) => {
                    if (progress.percent - lastProgress >= 10) {
                        console.log(`Processing: ${Math.round(progress.percent)}% done`);
                        lastProgress = progress.percent;
                    }
                });

                // Handle events
                command
                    .on('start', (command) => {
                        console.log('Starting FFmpeg process:', command);
                    })
                    .on('end', () => {
                        console.log('Audio extraction completed successfully');
                        resolve(outputFilePath);
                    })
                    .on('error', async (err) => {
                        console.error(`FFmpeg error (attempt ${retries + 1}/${config.maxRetries}):`, err);
                        if (cleanup) {
                            try {
                                await unlink(outputFilePath);
                            } catch (e) {
                                // Ignore cleanup errors
                            }
                        }
                        reject(err);
                    })
                    .save(outputFilePath);
            });

            // If we get here, the extraction was successful
            return outputFilePath;

        } catch (error) {
            retries++;
            if (retries >= config.maxRetries) {
                throw new Error(`Failed to extract audio after ${config.maxRetries} attempts: ${error.message}`);
            }
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, config.retryDelay));
        }
    }
};

/**
 * Clean up extracted audio files
 * @param {string} filePath - Path to the audio file
 * @returns {Promise<void>}
 */
export const cleanupAudio = async (filePath) => {
    try {
        await unlink(filePath);
        console.log('Cleanup completed:', filePath);
    } catch (error) {
        console.error('Cleanup failed:', error);
        throw error;
    }
};