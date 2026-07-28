import { getSettings } from '../db/database';
import type { AssetRow } from '../db/types';
import { uploadAssets } from './kieUpload';
import { imageToPatternedDataUrl } from './seedance';
import type { ProviderError } from './seedance';

const KIE_API_BASE = 'https://api.kie.ai';

const mapKieModel = (model?: string) => {
  const modelMap: Record<string, string> = {
    'seedance-2.0': 'bytedance/seedance-2',
    'seedance-2.0-fast': 'bytedance/seedance-2-fast',
    'seedance-2.0-mini': 'bytedance/seedance-2-mini'
  };
  return modelMap[model || ''] || model || 'bytedance/seedance-2';
};

const parseDuration = (duration?: string) => {
  const value = parseInt(String(duration || '5').replace('s', ''), 10);
  return Number.isNaN(value) ? 5 : value;
};

const createApiError = (code: number | undefined, msg: string | undefined, fallback: string): ProviderError => {
  const providerMessage = msg || fallback;
  const err = new Error(providerMessage) as ProviderError;
  err.providerMessage = providerMessage;

  if (code === 401) {
    err.message = 'API key kie.ai tidak valid. Periksa kunci di Settings.';
    err.statusCode = 401;
  } else if (code === 402) {
    err.message = 'Kredit kie.ai tidak cukup. Silakan top up akun Anda.';
    err.statusCode = 402;
  } else if (code === 422) {
    err.statusCode = 422;
    if (/real person|real_person|wajah|face/i.test(providerMessage)) {
      err.message =
        'Gambar reference terdeteksi berisi orang asli. Hapus atau ganti Creator reference dengan karakter AI/non-real person, lalu coba generate lagi.';
      err.code = 'REAL_PERSON_IMAGE_REJECTED';
    }
  } else if (code === 501) {
    err.message = `Generasi video gagal: ${providerMessage}`;
    err.statusCode = 501;
  }

  if (/input image may contain real person|real person/i.test(providerMessage)) {
    err.message =
      'Gambar reference terdeteksi berisi orang asli. Hapus atau ganti Creator reference dengan karakter AI/non-real person, lalu coba generate lagi.';
    err.statusCode = 422;
    err.code = 'REAL_PERSON_IMAGE_REJECTED';
  }

  return err;
};

const getApiKey = () => {
  const settings = getSettings();
  const apiKey = settings.api_key;
  if (!apiKey) {
    throw new Error('API key not configured. Go to Settings to add your kie.ai API key.');
  }
  return apiKey;
};

type TaskOptions = {
  resolution?: string;
  ratio?: string;
  duration?: string;
  ai_model?: string;
  patternReferences?: boolean;
};

export const createVideoTask = async (prompt: string, imageInputs: AssetRow[], options: TaskOptions = {}) => {
  const apiKey = getApiKey();

  const input: Record<string, unknown> = {
    prompt,
    resolution: options.resolution || '720p',
    aspect_ratio: options.ratio || '9:16',
    duration: parseDuration(options.duration),
    generate_audio: false
  };

  if (imageInputs && imageInputs.length > 0) {
    input.reference_image_urls = await uploadAssets(apiKey, imageInputs, {
      patternReferences: options.patternReferences,
      patternFn: imageToPatternedDataUrl
    });
  }

  const body = {
    model: mapKieModel(options.ai_model),
    input
  };

  const response = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.code !== 200 || !data.data?.taskId) {
    throw createApiError(data.code, data.msg, `API request failed with status ${response.status}`);
  }

  return data.data.taskId as string;
};

export const pollTaskStatus = async (taskId: string) => {
  const apiKey = getApiKey();

  const response = await fetch(`${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.code !== 200) {
    throw createApiError(data.code, data.msg, `Poll request failed with status ${response.status}`);
  }

  const task = data.data || {};
  const stateMap: Record<string, string> = {
    waiting: 'generating',
    queuing: 'generating',
    generating: 'generating',
    success: 'completed',
    fail: 'failed'
  };

  let videoUrl: string | null = null;
  if (task.state === 'success' && task.resultJson) {
    try {
      const parsed = JSON.parse(task.resultJson as string);
      videoUrl = parsed.resultUrls?.[0] || null;
    } catch {
      videoUrl = null;
    }
  }

  if (task.state === 'fail') {
    const err = createApiError(501, task.failMsg as string, 'Generation failed');
    return {
      status: 'failed' as const,
      video_url: null,
      error: err.message
    };
  }

  return {
    status: stateMap[task.state as string] || 'generating',
    video_url: videoUrl,
    error: null
  };
};

export const resolveDownloadUrl = async (url: string) => {
  if (!url) return url;

  const apiKey = getApiKey();
  const response = await fetch(`${KIE_API_BASE}/api/v1/common/download-url`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ url })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.code !== 200 || !data.data) {
    return url;
  }

  return data.data as string;
};

export const getCredits = async () => {
  const apiKey = getApiKey();
  const response = await fetch(`${KIE_API_BASE}/api/v1/chat/credit`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.code !== 200) {
    throw createApiError(data.code, data.msg, `Failed to fetch credits (${response.status})`);
  }

  return data.data;
};
