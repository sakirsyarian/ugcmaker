import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { PROJECT_ROOT } from './paths';
import { assetsApi } from './routes/api/assets';
import { queueApi } from './routes/api/queue';
import { settingsApi } from './routes/api/settings';
import { videosApi } from './routes/api/videos';
import { pages } from './routes/pages';

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true }));

app.route('/api/assets', assetsApi);
app.route('/api/videos', videosApi);
app.route('/api/queue', queueApi);
app.route('/api/settings', settingsApi);

app.route('/', pages);

app.use('/uploads/*', serveStatic({ root: PROJECT_ROOT }));
app.use('/downloads/*', serveStatic({ root: PROJECT_ROOT }));
app.use('/*', serveStatic({ root: `${PROJECT_ROOT}/public` }));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || 'Internal server error' }, 500);
});

export { app };
