import { Hono } from 'hono';
import {
  createQueueItem,
  deleteQueueItem,
  getQueueItemById,
  getQueueItems,
  updateQueueItem
} from '../../db/database';
import type { QueueItemRow } from '../../db/types';

const parseQueueItem = (item: QueueItemRow | null) => {
  if (!item) return null;
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(item.payload_json || '{}');
  } catch {
    payload = {};
  }
  return {
    ...item,
    payload
  };
};

const queueApi = new Hono();

queueApi.get('/', (c) => {
  return c.json({ items: getQueueItems().map(parseQueueItem) });
});

queueApi.post('/', async (c) => {
  const body = await c.req.json();
  const { title, payload } = body;

  if (!payload || !payload.prompt) {
    return c.json({ error: 'Queue item payload is required.' }, 400);
  }

  const result = createQueueItem({ title, payload });
  return c.json({ item: parseQueueItem(getQueueItemById(Number(result.lastInsertRowid))) });
});

queueApi.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const item = getQueueItemById(id);
  if (!item) return c.json({ error: 'Queue item not found.' }, 404);

  const body = await c.req.json();
  const editsPayload =
    Object.prototype.hasOwnProperty.call(body, 'payload') ||
    Object.prototype.hasOwnProperty.call(body, 'title');
  if (item.status === 'running' && editsPayload) {
    return c.json({ error: 'Running queue item cannot be edited.' }, 400);
  }

  const { title, payload, status, video_id, error_message } = body;
  const updated = updateQueueItem(id, { title, payload, status, video_id, error_message });
  return c.json({ item: parseQueueItem(updated) });
});

queueApi.delete('/:id', (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const item = getQueueItemById(id);
  if (!item) return c.json({ error: 'Queue item not found.' }, 404);
  if (item.status === 'running' || item.status === 'completed') {
    return c.json({ error: 'Only queued, paused, or failed items can be deleted.' }, 400);
  }

  deleteQueueItem(id);
  return c.json({ success: true });
});

export { queueApi };
