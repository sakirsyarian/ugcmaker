const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const UPLOAD_BASE_URL = 'https://kieai.redpandaai.co';
const CACHE_TTL_MS = 20 * 60 * 60 * 1000;
const uploadCache = new Map();

const resolveAssetPath = (asset) => {
  const filepath = asset.filepath || '';
  const fullPath = path.resolve(__dirname, '..', filepath);
  if (!fullPath.startsWith(path.resolve(__dirname, '..'))) {
    throw new Error('Invalid asset path');
  }
  return fullPath;
};

const buildMultipartBody = (fileBuffer, fileName, uploadPath) => {
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

const uploadBase64 = async (apiKey, base64Data, fileName) => {
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
  if (!response.ok || result.code !== 200 || !result.data?.fileUrl) {
    throw new Error(result.msg || `Kie file upload failed with status ${response.status}`);
  }

  return result.data.fileUrl;
};

const uploadStream = async (apiKey, fullPath, fileName) => {
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
  if (!response.ok || result.code !== 200 || !result.data?.fileUrl) {
    throw new Error(result.msg || `Kie file upload failed with status ${response.status}`);
  }

  return result.data.fileUrl;
};

const uploadAsset = async (apiKey, asset, options = {}) => {
  const cacheKey = `${asset.filepath}:${options.patternReferences ? 'pattern' : 'raw'}`;
  const cached = uploadCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.url;
  }

  let fileUrl;
  if (options.patternReferences && options.patternFn) {
    const base64Data = await options.patternFn(asset);
    const fileName = `pattern-${path.basename(asset.filepath, path.extname(asset.filepath))}.png`;
    fileUrl = await uploadBase64(apiKey, base64Data, fileName);
  } else {
    const fullPath = resolveAssetPath(asset);
    const fileName = path.basename(fullPath);
    fileUrl = await uploadStream(apiKey, fullPath, fileName);
  }

  uploadCache.set(cacheKey, { url: fileUrl, at: Date.now() });
  return fileUrl;
};

const uploadAssets = async (apiKey, assets, options = {}) => {
  const urls = [];
  for (const asset of assets) {
    urls.push(await uploadAsset(apiKey, asset, options));
  }
  return urls;
};

module.exports = {
  uploadAsset,
  uploadAssets,
  uploadBase64
};
