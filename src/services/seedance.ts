import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { getSettings } from '../db/database';
import { PROJECT_ROOT } from '../paths';
import type { AssetRow } from '../db/types';

export type ProviderError = Error & {
  statusCode?: number;
  code?: string;
  providerMessage?: string;
  requestId?: string | null;
};

const normalizeBaseUrl = (baseUrl: string | undefined) => {
  let url = (baseUrl || 'https://ark.ap-southeast.bytepluses.com/api/v3').replace(/\/+$/, '');
  if (!url.includes('/api/v3')) {
    url += '/api/v3';
  }
  return url;
};

const mapSeedanceModel = (model?: string) => {
  const modelMap: Record<string, string> = {
    'seedance-2.0': 'dreamina-seedance-2-0-260128',
    'seedance-2.0-fast': 'dreamina-seedance-2-0-fast-260128'
  };
  return modelMap[model || ''] || model || 'dreamina-seedance-2-0-260128';
};

const parseDuration = (duration?: string) => {
  const value = parseInt(String(duration || '5').replace('s', ''), 10);
  return Number.isNaN(value) ? 5 : value;
};

const createApiError = (errorData: Record<string, unknown>, fallback: string): ProviderError => {
  const rawMessage =
    (errorData.message as string) ||
    (errorData.error as { message?: string })?.message ||
    (errorData.error as string) ||
    JSON.stringify(errorData);
  const providerMessage = rawMessage && rawMessage !== '{}' ? String(rawMessage) : fallback;
  const requestIdMatch = providerMessage.match(/Request id:\s*([a-zA-Z0-9]+)/i);

  if (/input image may contain real person/i.test(providerMessage)) {
    const err = new Error(
      'Gambar reference terdeteksi berisi orang asli. Hapus atau ganti Creator reference dengan karakter AI/non-real person, lalu coba generate lagi.'
    ) as ProviderError;
    err.statusCode = 422;
    err.code = 'REAL_PERSON_IMAGE_REJECTED';
    err.providerMessage = providerMessage;
    err.requestId = requestIdMatch ? requestIdMatch[1] : null;
    return err;
  }

  const err = new Error(providerMessage || fallback) as ProviderError;
  err.providerMessage = providerMessage;
  err.requestId = requestIdMatch ? requestIdMatch[1] : null;
  return err;
};

export const imageToDataUrl = (asset: AssetRow | { filepath: string }) => {
  const filepath = asset.filepath || '';
  const fullPath = path.resolve(PROJECT_ROOT, filepath);

  if (!fullPath.startsWith(path.resolve(PROJECT_ROOT))) {
    throw new Error('Invalid asset path');
  }

  const bytes = fs.readFileSync(fullPath);
  const ext = path.extname(filepath).toLowerCase().replace('.', '');
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif'
  };
  const mime = mimeMap[ext] || 'image/png';

  return `data:${mime};base64,${bytes.toString('base64')}`;
};

const createPatternSvg = (width: number, height: number) => {
  const spacing = 34;
  const strokeWidth = 7;
  const opacity = 0.18;
  const lines: string[] = [];
  for (let x = -height; x < width + height; x += spacing) {
    lines.push(
      `<line x1="${x}" y1="${height}" x2="${x + height}" y2="0" stroke="#1d1d1f" stroke-width="${strokeWidth}" opacity="${opacity}" />`
    );
  }
  return Buffer.from(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${lines.join('')}</svg>`
  );
};

export const imageToPatternedDataUrl = async (asset: AssetRow | { filepath: string }) => {
  const filepath = asset.filepath || '';
  const fullPath = path.resolve(PROJECT_ROOT, filepath);

  if (!fullPath.startsWith(path.resolve(PROJECT_ROOT))) {
    throw new Error('Invalid asset path');
  }

  const source = sharp(fullPath).rotate();
  const metadata = await source.metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1024;
  const buffer = await source
    .composite([{ input: createPatternSvg(width, height), blend: 'over' }])
    .png()
    .toBuffer();

  return `data:image/png;base64,${buffer.toString('base64')}`;
};

type TaskOptions = {
  resolution?: string;
  ratio?: string;
  duration?: string;
  ai_model?: string;
  patternReferences?: boolean;
};

export const createVideoTask = async (prompt: string, imageInputs: AssetRow[], options: TaskOptions = {}) => {
  const settings = getSettings();
  const apiKey = settings.api_key;
  const baseUrl = normalizeBaseUrl(settings.api_base_url);

  if (!apiKey) {
    throw new Error('API key not configured. Go to Settings to add your BytePlus API key.');
  }

  const content: Record<string, unknown>[] = [];

  if (imageInputs && imageInputs.length > 0) {
    for (const input of imageInputs) {
      const url = options.patternReferences ? await imageToPatternedDataUrl(input) : imageToDataUrl(input);
      content.push({
        type: 'image_url',
        image_url: { url },
        role: 'reference_image'
      });
    }
  }

  content.push({
    type: 'text',
    text: prompt
  });

  const body = {
    model: mapSeedanceModel(options.ai_model),
    content,
    resolution: options.resolution || '720p',
    ratio: options.ratio || '9:16',
    duration: parseDuration(options.duration),
    watermark: false
  };

  const response = await fetch(`${baseUrl}/contents/generations/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw createApiError(errorData as Record<string, unknown>, `API request failed with status ${response.status}`);
  }

  const data = await response.json();
  return data.id || data.job_id || data.task_id;
};

export const pollTaskStatus = async (jobId: string) => {
  const settings = getSettings();
  const apiKey = settings.api_key;
  const baseUrl = normalizeBaseUrl(settings.api_base_url);

  const response = await fetch(`${baseUrl}/contents/generations/tasks/${jobId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw createApiError(errorData as Record<string, unknown>, `Poll request failed with status ${response.status}`);
  }

  const data = await response.json();
  const rawStatus = data.status as string;
  const statusMap: Record<string, string> = {
    succeeded: 'completed',
    success: 'completed',
    completed: 'completed',
    failed: 'failed',
    error: 'failed'
  };

  return {
    status: statusMap[rawStatus] || 'generating',
    video_url:
      data.content?.video_url || data.content?.[0]?.url || data.output?.video_url || data.video_url || null,
    error: data.error?.message || data.error || null
  };
};

export const resolveDownloadUrl = async (url: string) => url;
