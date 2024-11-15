import axios from 'axios';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import path from 'path';

ffmpeg.setFfmpegPath(ffmpegPath);

// Ensure the music folder exists
const musicFolder = path.resolve('music');
if (!fs.existsSync(musicFolder)) {
  fs.mkdirSync(musicFolder);
}

// Function to download a video from a URL
export async function downloadVideo(videoUrl, outputPath) {
  const writer = fs.createWriteStream(outputPath);
  const response = await axios({
    url: videoUrl,
    method: 'GET',
    responseType: 'stream',
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

// Function to convert mp4 to mp3
export function convertMp4ToMp3(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .output(outputPath)
      .on('end', () => {
        console.log('Conversion completed successfully!');
        resolve();
      })
      .on('error', (err) => {
        console.error('Error during conversion:', err);
        reject(err);
      })
      .run();
  });
}

// Main function to handle video URL input and return output file path and name
export async function processVideoUrl(videoUrl) {
  const tempVideoPath = 'downloaded-video.mp4';
  const outputAudioFileName = `output_audio_${Date.now()}.mp3`;
  const outputFilePath = path.resolve(musicFolder, outputAudioFileName);

  try {
    console.log('Downloading video...');
    await downloadVideo(videoUrl, tempVideoPath);
    console.log('Download completed!');

    console.log('Converting video to audio...');
    await convertMp4ToMp3(tempVideoPath, outputFilePath);
    console.log('Conversion completed! Check the output file:', outputFilePath);

    // Return the output file path and name
    return {
      outputFilePath,
      outputAudioFileName,
    };
  } catch (error) {
    console.error('An error occurred:', error);
    throw error;
  } finally {
    // Clean up: remove the downloaded video file if needed
    if (fs.existsSync(tempVideoPath)) {
      fs.unlinkSync(tempVideoPath);
    }
  }
}
