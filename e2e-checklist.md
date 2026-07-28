# E2E verification checklist (Bun + Hono)

Run after deploy or major changes. Requires Bun locally or Docker with daemon running.

## Smoke (automated-friendly)

- [ ] `bun install` completes
- [ ] `bun run src/index.ts` — `GET /health` → `{"ok":true}`
- [ ] `GET /` returns Create page HTML with `/js/create.js`
- [ ] `GET /settings`, `/history` return 200
- [ ] Static: `GET /css/style.css` (or main CSS under `public/`)

## API parity

- [ ] `GET /api/settings` — JSON settings
- [ ] `POST /api/settings` — save provider/key
- [ ] `GET /api/settings/credits` — kie credits (with valid key)
- [ ] `POST /api/assets/upload` — multipart, type product/model/background
- [ ] `GET /api/assets`, delete asset
- [ ] `POST /api/videos/generate` — kie task created
- [ ] Poll `GET /api/videos/:id/status` until completed/failed
- [ ] Pattern fallback when `REAL_PERSON_IMAGE_REJECTED`
- [ ] Queue CRUD + batch run

## Data & media

- [ ] Existing `data/ugc.db` opens; history rows visible
- [ ] Generated videos in `downloads/` playable from History

## Deploy

- [ ] `./install.sh` on Linux (Bun + PM2)
- [ ] `docker compose up -d --build` — health on mapped port
- [ ] `SQLITE_JOURNAL_MODE=DELETE` in compose for Docker SQLite
