import { Hono } from 'hono';
import { getAllAssets, getSettings, getVideoById } from '../db/database';
import { Layout } from '../views/Layout';
import { CreatePage } from '../views/CreatePage';
import { HistoryPage } from '../views/HistoryPage';
import { SettingsPage } from '../views/SettingsPage';

const pages = new Hono();

pages.get('/', (c) => {
  const settings = getSettings();
  const videoId = c.req.query('video_id');
  let prefillData: { video: ReturnType<typeof getVideoById>; assets: ReturnType<typeof getAllAssets> } | null = null;

  if (videoId) {
    const video = getVideoById(parseInt(videoId, 10));
    if (video) {
      const assetIds = JSON.parse(video.asset_ids || '[]') as number[];
      const assets = getAllAssets().filter((a) => assetIds.includes(a.id));
      prefillData = { video, assets };
    }
  }

  return c.html(
    <Layout page="create">
      <CreatePage settings={settings} prefillData={prefillData} />
    </Layout>
  );
});

pages.get('/history', (c) => {
  return c.html(
    <Layout page="history">
      <HistoryPage />
    </Layout>
  );
});

pages.get('/settings', (c) => {
  const settings = getSettings();
  return c.html(
    <Layout page="settings">
      <SettingsPage settings={settings} />
    </Layout>
  );
});

export { pages };
