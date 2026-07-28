import { app } from './app';

const port = parseInt(process.env.PORT || '3000', 10);

console.log(`UGC Maker (Bun + Hono) starting on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch
};
