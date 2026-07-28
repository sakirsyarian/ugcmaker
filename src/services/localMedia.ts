import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT } from '../paths';

const DOWNLOAD_ROOT = path.join(PROJECT_ROOT, 'downloads');
const VIDEO_DIR = path.join(DOWNLOAD_ROOT, 'videos');
const THUMB_DIR = path.join(DOWNLOAD_ROOT, 'thumbnails');

const ensureDirs = () => {
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
  fs.mkdirSync(THUMB_DIR, { recursive: true });
};

const toPublicPath = (fullPath: string) => {
  return path.relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/');
};

export const downloadVideo = async (videoId: number, videoUrl: string) => {
  ensureDirs();
  const outputPath = path.join(VIDEO_DIR, `video-${videoId}.mp4`);

  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
    return toPublicPath(outputPath);
  }

  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Failed to download video with status ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  await Bun.write(outputPath, buffer);
  return toPublicPath(outputPath);
};

export const saveThumbnail = (videoId: number, dataUrl: string) => {
  ensureDirs();
  const match = String(dataUrl || '').match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid thumbnail data');
  }

  const ext = match[1] === 'jpeg' || match[1] === 'jpg' ? 'jpg' : match[1];
  const outputPath = path.join(THUMB_DIR, `video-${videoId}.${ext}`);
  fs.writeFileSync(outputPath, Buffer.from(match[2], 'base64'));
  return toPublicPath(outputPath);
};
