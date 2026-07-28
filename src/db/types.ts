export type SettingsRow = {
  id: number;
  api_key: string;
  api_base_url: string;
  api_provider: string;
  default_resolution: string;
  default_ratio: string;
  default_model: string;
  default_duration: string;
};

export type AssetRow = {
  id: number;
  type: string;
  filename: string;
  filepath: string;
  filesize: number;
  created_at: string;
};

export type VideoRow = {
  id: number;
  prompt: string;
  resolution: string;
  ratio: string;
  ai_model: string;
  duration: string;
  status: string;
  job_id: string | null;
  video_url: string | null;
  local_video_path: string | null;
  thumbnail_path: string | null;
  error_message: string | null;
  asset_ids: string;
  recipe_data: string;
  created_at: string;
  completed_at: string | null;
};

export type QueueItemRow = {
  id: number;
  title: string;
  status: string;
  payload_json: string;
  video_id: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string | null;
  started_at: string | null;
  completed_at: string | null;
};
