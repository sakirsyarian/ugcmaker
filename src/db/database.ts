import { Database } from 'bun:sqlite';
import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT } from '../paths';
import type { AssetRow, QueueItemRow, SettingsRow, VideoRow } from './types';

const DB_PATH = path.join(PROJECT_ROOT, 'data', 'ugc.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);

const journalMode = process.env.SQLITE_JOURNAL_MODE || 'WAL';
db.run(`PRAGMA journal_mode = ${journalMode}`);
db.run('PRAGMA foreign_keys = ON');

db.run(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    api_key TEXT DEFAULT '',
    api_base_url TEXT DEFAULT 'https://ark.ap-southeast.bytepluses.com/api/v3',
    default_resolution TEXT DEFAULT '1080p',
    default_ratio TEXT DEFAULT '9:16',
    default_model TEXT DEFAULT 'seedance-2.0',
    default_duration TEXT DEFAULT '5s'
  );

  INSERT OR IGNORE INTO settings (id) VALUES (1);

  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('product', 'model', 'background')),
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    filesize INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt TEXT NOT NULL,
    resolution TEXT NOT NULL DEFAULT '1080p',
    ratio TEXT NOT NULL DEFAULT '9:16',
    ai_model TEXT NOT NULL DEFAULT 'seedance-2.0',
    duration TEXT NOT NULL DEFAULT '5s',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
    job_id TEXT,
    video_url TEXT,
    local_video_path TEXT,
    thumbnail_path TEXT,
    error_message TEXT,
    asset_ids TEXT DEFAULT '[]',
    recipe_data TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT (datetime('now')),
    completed_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS queue_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT 'Untitled video',
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'paused', 'completed', 'failed')),
    payload_json TEXT NOT NULL,
    video_id INTEGER,
    error_message TEXT,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now')),
    started_at DATETIME,
    completed_at DATETIME
  );
`);

const tryAlter = (sql: string) => {
  try {
    db.run(sql);
  } catch {
    /* column exists */
  }
};

tryAlter("ALTER TABLE settings ADD COLUMN default_duration TEXT DEFAULT '5s'");
tryAlter("ALTER TABLE videos ADD COLUMN duration TEXT DEFAULT '5s'");
tryAlter("ALTER TABLE videos ADD COLUMN recipe_data TEXT DEFAULT '{}'");
tryAlter('ALTER TABLE videos ADD COLUMN local_video_path TEXT');
tryAlter('ALTER TABLE videos ADD COLUMN thumbnail_path TEXT');
tryAlter('ALTER TABLE queue_items ADD COLUMN updated_at DATETIME');
tryAlter('ALTER TABLE queue_items ADD COLUMN started_at DATETIME');
tryAlter('ALTER TABLE queue_items ADD COLUMN completed_at DATETIME');
tryAlter("ALTER TABLE settings ADD COLUMN api_provider TEXT DEFAULT 'byteplus'");

export const getSettings = (): SettingsRow =>
  db.query('SELECT * FROM settings WHERE id = 1').get() as SettingsRow;

export const updateSettings = (data: Partial<SettingsRow>) => {
  return db.run(
    `UPDATE settings SET
      api_key = COALESCE(?, api_key),
      api_base_url = COALESCE(?, api_base_url),
      api_provider = COALESCE(?, api_provider),
      default_resolution = COALESCE(?, default_resolution),
      default_ratio = COALESCE(?, default_ratio),
      default_model = COALESCE(?, default_model),
      default_duration = COALESCE(?, default_duration)
    WHERE id = 1`,
    [
      data.api_key ?? null,
      data.api_base_url ?? null,
      data.api_provider ?? null,
      data.default_resolution ?? null,
      data.default_ratio ?? null,
      data.default_model ?? null,
      data.default_duration ?? null
    ]
  );
};

export const createAsset = (data: { type: string; filename: string; filepath: string; filesize: number }) => {
  return db.run('INSERT INTO assets (type, filename, filepath, filesize) VALUES (?, ?, ?, ?)', [
    data.type,
    data.filename,
    data.filepath,
    data.filesize
  ]);
};

export const getAssetsByType = (type: string) =>
  db.query('SELECT * FROM assets WHERE type = ? ORDER BY created_at DESC').all(type) as AssetRow[];

export const getAllAssets = () =>
  db.query('SELECT * FROM assets ORDER BY created_at DESC').all() as AssetRow[];

export const getAssetById = (id: number) =>
  db.query('SELECT * FROM assets WHERE id = ?').get(id) as AssetRow | null;

export const deleteAsset = (id: number) => {
  const asset = getAssetById(id);
  if (asset) {
    const fullPath = path.join(PROJECT_ROOT, asset.filepath);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    db.run('DELETE FROM assets WHERE id = ?', [id]);
  }
  return asset;
};

export const createVideo = (data: {
  prompt: string;
  resolution?: string;
  ratio?: string;
  ai_model?: string;
  duration?: string;
  status?: string;
  job_id?: string | null;
  asset_ids?: number[];
  recipe_data?: Record<string, unknown>;
}) => {
  return db.run(
    `INSERT INTO videos (prompt, resolution, ratio, ai_model, duration, status, job_id, asset_ids, recipe_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.prompt,
      data.resolution || '1080p',
      data.ratio || '9:16',
      data.ai_model || 'seedance-2.0',
      data.duration || '5s',
      data.status || 'pending',
      data.job_id || null,
      JSON.stringify(data.asset_ids || []),
      JSON.stringify(data.recipe_data || {})
    ]
  );
};

export const updateVideoStatus = (
  id: number,
  data: {
    status?: string;
    job_id?: string | null;
    video_url?: string | null;
    local_video_path?: string | null;
    thumbnail_path?: string | null;
    error_message?: string | null;
  }
) => {
  return db.run(
    `UPDATE videos SET
      status = COALESCE(?, status),
      job_id = COALESCE(?, job_id),
      video_url = COALESCE(?, video_url),
      local_video_path = COALESCE(?, local_video_path),
      thumbnail_path = COALESCE(?, thumbnail_path),
      error_message = COALESCE(?, error_message),
      completed_at = CASE WHEN ? IN ('completed', 'failed') THEN datetime('now') ELSE completed_at END
    WHERE id = ?`,
    [
      data.status ?? null,
      data.job_id ?? null,
      data.video_url ?? null,
      data.local_video_path ?? null,
      data.thumbnail_path ?? null,
      data.error_message ?? null,
      data.status ?? null,
      id
    ]
  );
};

export const getVideoById = (id: number) =>
  db.query('SELECT * FROM videos WHERE id = ?').get(id) as VideoRow | null;

export const getAllVideos = (search?: string) => {
  if (search) {
    return db
      .query("SELECT * FROM videos WHERE status = 'completed' AND prompt LIKE ? ORDER BY created_at DESC")
      .all(`%${search}%`) as VideoRow[];
  }
  return db
    .query("SELECT * FROM videos WHERE status = 'completed' ORDER BY created_at DESC")
    .all() as VideoRow[];
};

export const deleteVideo = (id: number) => db.run('DELETE FROM videos WHERE id = ?', [id]);

export const getQueueItems = () =>
  db.query('SELECT * FROM queue_items ORDER BY created_at ASC, id ASC').all() as QueueItemRow[];

export const getQueueItemById = (id: number) =>
  db.query('SELECT * FROM queue_items WHERE id = ?').get(id) as QueueItemRow | null;

export const createQueueItem = (data: { title?: string; status?: string; payload: Record<string, unknown> }) => {
  return db.run('INSERT INTO queue_items (title, status, payload_json) VALUES (?, ?, ?)', [
    data.title || 'Untitled video',
    data.status || 'queued',
    JSON.stringify(data.payload || {})
  ]);
};

export const updateQueueItem = (
  id: number,
  data: {
    title?: string;
    status?: string;
    payload?: Record<string, unknown>;
    video_id?: number | null;
    error_message?: string | null;
  }
) => {
  const current = getQueueItemById(id);
  if (!current) return null;

  const status = data.status ?? current.status;
  const nextErrorMessage = Object.prototype.hasOwnProperty.call(data, 'error_message')
    ? data.error_message
    : current.error_message;

  db.run(
    `UPDATE queue_items SET
      title = COALESCE(?, title),
      status = COALESCE(?, status),
      payload_json = COALESCE(?, payload_json),
      video_id = COALESCE(?, video_id),
      error_message = ?,
      updated_at = datetime('now'),
      started_at = CASE WHEN ? = 'running' AND started_at IS NULL THEN datetime('now') ELSE started_at END,
      completed_at = CASE WHEN ? IN ('completed', 'failed') THEN datetime('now') ELSE completed_at END
    WHERE id = ?`,
    [
      data.title ?? null,
      status,
      data.payload ? JSON.stringify(data.payload) : null,
      data.video_id ?? null,
      nextErrorMessage,
      status,
      status,
      id
    ]
  );
  return getQueueItemById(id);
};

export const deleteQueueItem = (id: number) =>
  db.run("DELETE FROM queue_items WHERE id = ? AND status IN ('queued', 'paused', 'failed')", [id]);
