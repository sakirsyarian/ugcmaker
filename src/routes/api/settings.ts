import { Hono } from 'hono';
import { getSettings, updateSettings } from '../../db/database';
import { getCredits } from '../../services/videoProvider';

const settingsApi = new Hono();

settingsApi.post('/', async (c) => {
  const body = await c.req.json();
  updateSettings({
    api_key: body.api_key,
    api_base_url: body.api_base_url,
    api_provider: body.api_provider,
    default_resolution: body.default_resolution,
    default_ratio: body.default_ratio,
    default_model: body.default_model,
    default_duration: body.default_duration
  });
  return c.json({ success: true });
});

settingsApi.get('/', (c) => {
  const settings = getSettings();
  return c.json({
    api_provider: settings.api_provider || 'byteplus',
    api_base_url: settings.api_base_url,
    default_resolution: settings.default_resolution,
    default_ratio: settings.default_ratio,
    default_model: settings.default_model,
    default_duration: settings.default_duration,
    has_api_key: !!settings.api_key
  });
});

settingsApi.get('/credits', async (c) => {
  const settings = getSettings();
  if ((settings.api_provider || 'byteplus') !== 'kie') {
    return c.json({ error: 'Credits are only available for kie.ai provider' }, 400);
  }
  if (!settings.api_key) {
    return c.json({ error: 'API key not configured' }, 400);
  }

  try {
    const credits = await getCredits();
    return c.json({ credits });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch credits';
    return c.json({ error: message }, 500);
  }
});

export { settingsApi };
