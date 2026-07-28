import { Hono } from 'hono';
import fs from 'fs';
import path from 'path';
import {
  createAsset,
  deleteAsset,
  getAllAssets,
  getAssetsByType
} from '../../db/database';
import { PROJECT_ROOT } from '../../paths';

const UPLOAD_BASE = path.join(PROJECT_ROOT, 'uploads');

const typeToFolder: Record<string, string> = {
  product: 'products',
  model: 'models',
  background: 'backgrounds'
};

for (const dir of ['products', 'models', 'backgrounds']) {
  fs.mkdirSync(path.join(UPLOAD_BASE, dir), { recursive: true });
}

const allowedImage = (name: string, mime: string) => {
  const allowed = /jpeg|jpg|png|webp|gif/i;
  const ext = allowed.test(path.extname(name).toLowerCase());
  const mimePart = mime.split('/')[1] || '';
  const mimeOk = allowed.test(mimePart);
  return ext || mimeOk;
};

const collectFiles = (value: unknown): File[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((f): f is File => f instanceof File);
  if (value instanceof File) return [value];
  return [];
};

const assetsApi = new Hono();

assetsApi.post('/upload', async (c) => {
  const body = await c.req.parseBody({ all: true });
  const type = (body.type as string) || 'product';
  const files = collectFiles(body.files);

  if (files.length === 0) {
    return c.json({ error: 'No files uploaded' }, 400);
  }

  const folder = typeToFolder[type] || 'products';
  const assets = [];

  for (const file of files.slice(0, 10)) {
    if (file.size > 20 * 1024 * 1024) {
      return c.json({ error: 'File too large (max 20MB)' }, 400);
    }
    if (!allowedImage(file.name, file.type)) {
      return c.json({ error: 'Only image files are allowed' }, 400);
    }

    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}${path.extname(file.name)}`;
    const destDir = path.join(UPLOAD_BASE, folder);
    const destPath = path.join(destDir, unique);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(destPath, buffer);

    const filepath = `uploads/${folder}/${unique}`;
    const result = createAsset({
      type,
      filename: file.name,
      filepath,
      filesize: file.size
    });

    assets.push({
      id: Number(result.lastInsertRowid),
      type,
      filename: file.name,
      filepath,
      filesize: file.size
    });
  }

  return c.json({ assets });
});

assetsApi.get('/', (c) => {
  const type = c.req.query('type');
  const assets = type ? getAssetsByType(type) : getAllAssets();
  return c.json({ assets });
});

assetsApi.delete('/:id', (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const deleted = deleteAsset(id);
  if (!deleted) {
    return c.json({ error: 'Asset not found' }, 404);
  }
  return c.json({ success: true });
});

export { assetsApi };
