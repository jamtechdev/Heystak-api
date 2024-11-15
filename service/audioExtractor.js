import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);
const unlink = promisify(fs.unlink);

ffmpeg.setFfmpegPath(ffmpegPath);

const config = {
    outputDir: 'music',
    defaultBitrate: '128k',
    maxRetries: 3,
    retryDelay: 2000,
    cleanup: true,
    // Memory-related configurations
    maxProcessingTime: 300, // 5 minutes timeout
    memoryLimit: '256m',    // Memory limit for FFmpeg process
};

async function ensureDirectory(dir) {
    try {
        await access(dir);
    } catch {
        await mkdir(dir, { recursive: true });
    }
}

async function validateInput(url) {
    if (!url) return false;
    
    try {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return true;
        }
        await access(url);
        return true;
    } catch {
        return false;
    }
}

<<<<<<< HEAD
        ffmpeg(videoUrl)
            .noVideo() 
            .audioCodec('libmp3lame') 
            .format('mp3') 
            .on('end', () => resolve(outputFilePath))
            .on('error', (err) => reject(err))
            .save(outputFilePath);
    });
};
=======
/**
 * Extracts audio from a video file with memory optimization
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

    if (!await validateInput(videoUrl)) {
        throw new Error('Invalid or inaccessible video source');
    }

    const musicFolder = path.resolve(outputDir);
    await ensureDirectory(musicFolder);

    const outputAudioFileName = `audio_${Date.now()}.${outputFormat}`;
    const outputFilePath = path.resolve(musicFolder, outputAudioFileName);

    let retries = 0;
    let ffmpegProcess = null;

    const cleanup_file = async () => {
        try {
            if (fs.existsSync(outputFilePath)) {
                await unlink(outputFilePath);
            }
        } catch (e) {
            console.error('Cleanup error:', e);
        }
    };

    while (retries < config.maxRetries) {
        try {
            await new Promise((resolve, reject) => {
                let isCompleted = false;
                
                // Create timeout to kill process if it takes too long
                const timeout = setTimeout(() => {
                    if (!isCompleted && ffmpegProcess) {
                        ffmpegProcess.kill('SIGKILL');
                        reject(new Error('Process timed out'));
                    }
                }, config.maxProcessingTime * 1000);

                ffmpegProcess = ffmpeg(videoUrl)
                    .outputOptions([
                        '-max_muxing_queue_size 1024',
                        '-threads 2',                    // Reduced thread count
                        '-preset superfast',            // Fastest preset
                        '-movflags faststart',
                        `-memory_limit ${config.memoryLimit}`,  // Set memory limit
                        '-analyzeduration 10000000',    // Reduce analysis time
                        '-probesize 10000000',          // Reduce probe size
                        '-map_metadata -1',             // Strip metadata
                        '-vn'                           // No video processing
                    ])
                    .audioCodec('libmp3lame')
                    .audioBitrate(bitrate)
                    .format(outputFormat);

                let lastProgress = 0;
                ffmpegProcess
                    .on('progress', (progress) => {
                        if (progress.percent - lastProgress >= 10) {
                            console.log(`Processing: ${Math.round(progress.percent)}% done`);
                            lastProgress = progress.percent;
                        }
                    })
                    .on('start', (command) => {
                        console.log('Starting FFmpeg process with command:', command);
                    })
                    .on('end', () => {
                        isCompleted = true;
                        clearTimeout(timeout);
                        console.log('Audio extraction completed successfully');
                        resolve(outputFilePath);
                    })
                    .on('error', async (err) => {
                        isCompleted = true;
                        clearTimeout(timeout);
                        console.error(`FFmpeg error (attempt ${retries + 1}/${config.maxRetries}):`, err);
                        
                        if (cleanup) {
                            await cleanup_file();
                        }
                        reject(err);
                    })
                    .save(outputFilePath);
            });

            // If we get here, the extraction was successful
            return outputFilePath;

        } catch (error) {
            retries++;
            
            // Kill the FFmpeg process if it's still running
            if (ffmpegProcess) {
                try {
                    ffmpegProcess.kill('SIGKILL');
                } catch (e) {
                    console.error('Error killing FFmpeg process:', e);
                }
            }

            if (retries >= config.maxRetries) {
                await cleanup_file();
                throw new Error(`Failed to extract audio after ${config.maxRetries} attempts: ${error.message}`);
            }

            // Wait longer between retries
            await new Promise(resolve => setTimeout(resolve, config.retryDelay * retries));
        }
    }
};

export const cleanupAudio = async (filePath) => {
    try {
        await unlink(filePath);
        console.log('Cleanup completed:', filePath);
    } catch (error) {
        console.error('Cleanup failed:', error);
        throw error;
    }
};
>>>>>>> 80dd536e197d61492286ed3248be6418b69b2401
