const fetch = require('node-fetch');
const { getSettings } = require('../database');
const { uploadAssets } = require('./kieUpload');
const { imageToPatternedDataUrl } = require('./seedance');

const KIE_API_BASE = 'https://api.kie.ai';

const mapKieModel = (model) => {
  const modelMap = {
    'seedance-2.0': 'bytedance/seedance-2',
    'seedance-2.0-fast': 'bytedance/seedance-2-fast',
    'seedance-2.0-mini': 'bytedance/seedance-2-mini'
  };
  return modelMap[model] || model || 'bytedance/seedance-2';
};

const parseDuration = (duration) => {
  const value = parseInt(String(duration || '5').replace('s', ''), 10);
  return Number.isNaN(value) ? 5 : value;
};

const createApiError = (code, msg, fallback) => {
  const providerMessage = msg || fallback;
  const err = new Error(providerMessage);
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
      err.message = 'Gambar reference terdeteksi berisi orang asli. Hapus atau ganti Creator reference dengan karakter AI/non-real person, lalu coba generate lagi.';
      err.code = 'REAL_PERSON_IMAGE_REJECTED';
    }
  } else if (code === 501) {
    err.message = `Generasi video gagal: ${providerMessage}`;
    err.statusCode = 501;
  }

  if (/input image may contain real person|real person/i.test(providerMessage)) {
    err.message = 'Gambar reference terdeteksi berisi orang asli. Hapus atau ganti Creator reference dengan karakter AI/non-real person, lalu coba generate lagi.';
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

const createVideoTask = async (prompt, imageInputs, options = {}) => {
  const apiKey = getApiKey();

  if (options.ai_model === 'seedance-2.0-mini') {
    // mini is kie-only; no extra check needed when routed here
  }

  const input = {
    prompt,
    resolution: options.resolution || '720p',
    aspect_ratio: options.ratio || '9:16',
    duration: parseDuration(options.duration),
    generate_audio: false
  };

  if (imageInputs && imageInputs.length > 0) {
    const uploadOptions = {
      patternReferences: options.patternReferences,
      patternFn: imageToPatternedDataUrl
    };
    input.reference_image_urls = await uploadAssets(apiKey, imageInputs, uploadOptions);
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

  return data.data.taskId;
};

const pollTaskStatus = async (taskId) => {
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
  const stateMap = {
    waiting: 'generating',
    queuing: 'generating',
    generating: 'generating',
    success: 'completed',
    fail: 'failed'
  };

  let videoUrl = null;
  if (task.state === 'success' && task.resultJson) {
    try {
      const parsed = JSON.parse(task.resultJson);
      videoUrl = parsed.resultUrls?.[0] || null;
    } catch (e) {
      videoUrl = null;
    }
  }

  if (task.state === 'fail') {
    const err = createApiError(501, task.failMsg, 'Generation failed');
    return {
      status: 'failed',
      video_url: null,
      error: err.message
    };
  }

  return {
    status: stateMap[task.state] || 'generating',
    video_url: videoUrl,
    error: null
  };
};

const resolveDownloadUrl = async (url) => {
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

  return data.data;
};

const getCredits = async () => {
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

module.exports = {
  createVideoTask,
  pollTaskStatus,
  resolveDownloadUrl,
  getCredits
};
