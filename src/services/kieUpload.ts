import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT } from '../paths';
import type { AssetRow } from '../db/types';

const UPLOAD_BASE_URL = 'https://kieai.redpandaai.co';
const CACHE_TTL_MS = 20 * 60 * 60 * 1000;
const BASE64_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const uploadCache = new Map<string, { url: string; at: number }>();

const mimeFromPath = (filePath: string) => {
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif'
  };
  return mimeMap[ext] || 'application/octet-stream';
};

const extractUploadUrl = (result: { data?: { downloadUrl?: string; fileUrl?: string }; code?: number; msg?: string }) => {
  const data = result.data || {};
  return data.downloadUrl || data.fileUrl || null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withUploadRetry = async <T>(fn: () => Promise<T>, attempts = 3): Promise<T> => {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const retryable = /ECONNRESET|ETIMEDOUT|ECONNREFUSED|socket hang up/i.test(message);
      if (!retryable || i === attempts - 1) throw err;
      await sleep(1000 * (i + 1));
    }
  }
  throw lastError;
};

const resolveAssetPath = (asset: AssetRow | { filepath: string }) => {
  const filepath = asset.filepath || '';
  const fullPath = path.resolve(PROJECT_ROOT, filepath);
  if (!fullPath.startsWith(path.resolve(PROJECT_ROOT))) {
    throw new Error('Invalid asset path');
  }
  return fullPath;
};

const buildMultipartBody = (fileBuffer: Buffer, fileName: string, uploadPath: string) => {
  const boundary = `----KieUpload${Date.now()}${Math.random().toString(36).slice(2)}`;
  const preamble = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="uploadPath"\r\n\r\n` +
      `${uploadPath}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="fileName"\r\n\r\n` +
      `${fileName}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`
  );
  const closing = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([preamble, fileBuffer, closing]),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
};

const uploadBase64 = async (apiKey: string, base64Data: string, fileName: string) => {
  const response = await fetch(`${UPLOAD_BASE_URL}/api/file-base64-upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      base64Data,
      uploadPath: 'ugc-refs',
      fileName
    })
  });

  const result = await response.json().catch(() => ({}));
  const fileUrl = extractUploadUrl(result);
  if (!response.ok || result.code !== 200 || !fileUrl) {
    throw new Error(result.msg || `Kie file upload failed with status ${response.status}`);
  }

  return fileUrl;
};

const fileToBase64DataUrl = (fullPath: string) => {
  const bytes = fs.readFileSync(fullPath);
  const mime = mimeFromPath(fullPath);
  return `data:${mime};base64,${bytes.toString('base64')}`;
};

const uploadStream = async (apiKey: string, fullPath: string, fileName: string) => {
  const fileBuffer = fs.readFileSync(fullPath);
  const { body, contentType } = buildMultipartBody(fileBuffer, fileName, 'ugc-refs');

  const response = await fetch(`${UPLOAD_BASE_URL}/api/file-stream-upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': contentType
    },
    body
  });

  const result = await response.json().catch(() => ({}));
  const fileUrl = extractUploadUrl(result);
  if (!response.ok || result.code !== 200 || !fileUrl) {
    throw new Error(result.msg || `Kie file upload failed with status ${response.status}`);
  }

  return fileUrl;
};

type UploadOptions = {
  patternReferences?: boolean;
  patternFn?: (asset: AssetRow) => Promise<string>;
};

export const uploadAsset = async (apiKey: string, asset: AssetRow, options: UploadOptions = {}) => {
  const cacheKey = `${asset.filepath}:${options.patternReferences ? 'pattern' : 'raw'}`;
  const cached = uploadCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.url;
  }

  let fileUrl: string;
  if (options.patternReferences && options.patternFn) {
    const base64Data = await options.patternFn(asset);
    const fileName = `pattern-${path.basename(asset.filepath, path.extname(asset.filepath))}.png`;
    fileUrl = await withUploadRetry(() => uploadBase64(apiKey, base64Data, fileName));
  } else {
    const fullPath = resolveAssetPath(asset);
    const fileName = path.basename(fullPath);
    const size = fs.statSync(fullPath).size;
    if (size <= BASE64_UPLOAD_MAX_BYTES) {
      const base64Data = fileToBase64DataUrl(fullPath);
      fileUrl = await withUploadRetry(() => uploadBase64(apiKey, base64Data, fileName));
    } else {
      fileUrl = await withUploadRetry(() => uploadStream(apiKey, fullPath, fileName));
    }
  }

  uploadCache.set(cacheKey, { url: fileUrl, at: Date.now() });
  return fileUrl;
};

export const uploadAssets = async (apiKey: string, assets: AssetRow[], options: UploadOptions = {}) => {
  const urls: string[] = [];
  for (const asset of assets) {
    urls.push(await uploadAsset(apiKey, asset, options));
  }
  return urls;
};

export { uploadBase64 };
