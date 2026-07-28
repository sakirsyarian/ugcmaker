import { Hono } from 'hono';
import {
  createVideo,
  deleteVideo,
  getAllAssets,
  getAllVideos,
  getSettings,
  getVideoById,
  updateVideoStatus
} from '../../db/database';
import type { VideoRow } from '../../db/types';
import { downloadVideo, saveThumbnail } from '../../services/localMedia';
import { createVideoTask, pollTaskStatus, resolveDownloadUrl } from '../../services/videoProvider';
import type { ProviderError } from '../../services/seedance';

const publicVideo = (video: VideoRow | null) => {
  if (!video) return video;
  const localVideoUrl = video.local_video_path ? '/' + video.local_video_path : null;
  const thumbnailUrl = video.thumbnail_path ? '/' + video.thumbnail_path : null;
  return {
    ...video,
    remote_video_url: video.video_url,
    local_video_url: localVideoUrl,
    thumbnail_url: thumbnailUrl,
    video_url: localVideoUrl || video.video_url
  };
};

const startPolling = (videoId: number, jobId: string) => {
  let attempts = 0;
  const maxAttempts = 120;
  const delays = [3000, 3000, 5000, 5000, 10000];

  const poll = async () => {
    attempts++;
    if (attempts > maxAttempts) {
      updateVideoStatus(videoId, { status: 'failed', error_message: 'Generation timed out' });
      return;
    }

    try {
      const result = await pollTaskStatus(jobId);

      if (result.status === 'completed' && result.video_url) {
        const downloadUrl = await resolveDownloadUrl(result.video_url);
        const localVideoPath = await downloadVideo(videoId, downloadUrl);
        updateVideoStatus(videoId, {
          status: 'completed',
          video_url: result.video_url,
          local_video_path: localVideoPath
        });
        return;
      }

      if (result.status === 'failed') {
        updateVideoStatus(videoId, {
          status: 'failed',
          error_message: result.error || 'Generation failed'
        });
        return;
      }

      const delay = delays[Math.min(attempts - 1, delays.length - 1)];
      setTimeout(poll, delay);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Poll failed';
      updateVideoStatus(videoId, { status: 'failed', error_message: message });
    }
  };

  setTimeout(poll, 3000);
};

const videosApi = new Hono();

videosApi.post('/generate', async (c) => {
  const body = await c.req.json();
  const { prompt, resolution, ratio, duration, ai_model, asset_ids, recipe_data } = body;

  if (!prompt) {
    return c.json({ error: 'Prompt is required' }, 400);
  }

  const settings = getSettings();
  if (!settings.api_key) {
    return c.json({ error: 'API key not configured. Go to Settings to add your API key.' }, 400);
  }

  const selectedModel = ai_model || settings.default_model;
  if ((settings.api_provider || 'byteplus') !== 'kie' && selectedModel === 'seedance-2.0-mini') {
    return c.json({ error: 'Seedance 2.0 Mini is only available with the kie.ai provider.' }, 400);
  }

  const result = createVideo({
    prompt,
    resolution: resolution || settings.default_resolution,
    ratio: ratio || settings.default_ratio,
    duration: duration || settings.default_duration,
    ai_model: ai_model || settings.default_model,
    status: 'generating',
    asset_ids: asset_ids || [],
    recipe_data: recipe_data || {}
  });

  const videoId = Number(result.lastInsertRowid);

  try {
    const selectedAssetIds = (asset_ids || [])
      .map((id: unknown) => parseInt(String(id), 10))
      .filter((id: number) => !Number.isNaN(id));
    const selectedAssets = getAllAssets().filter((asset) => selectedAssetIds.includes(asset.id));

    const taskOptions = {
      resolution: resolution || settings.default_resolution,
      ratio: ratio || settings.default_ratio,
      duration: duration || settings.default_duration,
      ai_model: ai_model || settings.default_model
    };

    let jobId: string;
    let usedPatternFallback = false;
    try {
      jobId = await createVideoTask(prompt, selectedAssets, taskOptions);
    } catch (err) {
      const perr = err as ProviderError;
      if (perr.code !== 'REAL_PERSON_IMAGE_REJECTED' || selectedAssets.length === 0) {
        throw err;
      }
      usedPatternFallback = true;
      jobId = await createVideoTask(prompt, selectedAssets, {
        ...taskOptions,
        patternReferences: true
      });
    }

    updateVideoStatus(videoId, { job_id: jobId, status: 'generating' });
    startPolling(videoId, jobId);

    return c.json({
      id: videoId,
      job_id: jobId,
      status: 'generating',
      reference_fallback: usedPatternFallback
    });
  } catch (err) {
    const perr = err as ProviderError;
    const errorMessage = perr.requestId ? `${perr.message} Request ID: ${perr.requestId}` : perr.message;
    updateVideoStatus(videoId, {
      status: 'failed',
      error_message: errorMessage
    });
    return c.json(
      {
        id: videoId,
        error: perr.message,
        error_code: perr.code || null,
        request_id: perr.requestId || null,
        status: 'failed'
      },
      perr.statusCode === 422 ? 200 : 500
    );
  }
});

videosApi.get('/:id/status', (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const video = getVideoById(id);
  if (!video) {
    return c.json({ error: 'Video not found' }, 404);
  }
  return c.json({
    id: video.id,
    status: video.status,
    video_url: video.local_video_path ? '/' + video.local_video_path : video.video_url,
    local_video_url: video.local_video_path ? '/' + video.local_video_path : null,
    thumbnail_url: video.thumbnail_path ? '/' + video.thumbnail_path : null,
    error_message: video.error_message
  });
});

videosApi.get('/', (c) => {
  const search = c.req.query('search') || '';
  const videos = getAllVideos(search).map((v) => publicVideo(v));
  return c.json({ videos });
});

videosApi.get('/:id', (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const video = getVideoById(id);
  if (!video) {
    return c.json({ error: 'Video not found' }, 404);
  }
  return c.json({ video: publicVideo(video) });
});

videosApi.post('/:id/thumbnail', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const video = getVideoById(id);
  if (!video) {
    return c.json({ error: 'Video not found' }, 404);
  }

  try {
    const body = await c.req.json();
    const thumbnailPath = saveThumbnail(id, body.thumbnail);
    updateVideoStatus(id, { thumbnail_path: thumbnailPath });
    return c.json({ thumbnail_url: '/' + thumbnailPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save thumbnail';
    return c.json({ error: message }, 400);
  }
});

videosApi.delete('/:id', (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const video = getVideoById(id);
  if (!video) {
    return c.json({ error: 'Video not found' }, 404);
  }
  deleteVideo(id);
  return c.json({ success: true });
});

export { videosApi };
