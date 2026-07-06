# UGC Video Maker

![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-supported-2496ED?logo=docker&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-local-003B57?logo=sqlite&logoColor=white)
![EJS](https://img.shields.io/badge/EJS-templates-B4CA65)
![License](https://img.shields.io/badge/license-MIT-blue)

<img width="3092" height="933" alt="a" src="https://github.com/user-attachments/assets/01576cc4-ecae-440a-83ad-a3072dabc3f2" />

UGC Video Maker is a web application for generating affiliate-style UGC videos with **Seedance** (ByteDance). Upload product references, pick a creator/background, write a script, and generate ready-to-review videos.

**API providers** (choose one in Settings):

- **[kie.ai](https://kie.ai)** — Seedance 2.0, Fast, and Mini
- **[BytePlus ModelArk](https://bit.ly/4atg2fL)** — Seedance 2.0 and Fast

## Features

- Product, creator, and background image references
- Seedance 2.0, 2.0 Fast, and 2.0 Mini (kie.ai)
- Dual API provider: kie.ai or BytePlus ModelArk
- UGC presets: product demo, unboxing, testimonial, ASMR, affiliate selling
- Configurable resolution, ratio, duration, and editable prompt
- Queue-based batch generation
- Local video download and thumbnail capture
- History gallery with video playback
- SQLite persistence for settings, assets, queue, and videos

## Quick Start (Local Development)

**Requirements:** Node.js 22+, npm

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000)

Development with auto-reload:

```bash
npm run dev
```

> On Windows, use **Node.js 22 LTS** if `better-sqlite3` fails to install on Node 24.

## Deploy to Server

**Default (PM2)** — recommended for small VPS (1 GB RAM):

```bash
chmod +x install.sh
./install.sh
```

Installs Node.js 22 (if missing), npm dependencies, PM2, and starts the app on port **3000**.

**Docker** — recommended for 2 GB+ RAM or isolated deploy:

```bash
chmod +x install-docker.sh
./install-docker.sh
```

**Full beginner guide:** see **[DEPLOY.md](DEPLOY.md)** — SSH, backup, troubleshooting, and security notes.

Non-interactive install:

```bash
AUTO_INSTALL_NODE=1 AUTO_INSTALL_PM2=1 ./install.sh
AUTO_INSTALL_DOCKER=1 ./install-docker.sh
```

## Configuration

Open **Settings** in the app:

| Setting | Description |
|---------|-------------|
| API Provider | `kie.ai` or `BytePlus ModelArk` |
| API Key | From [kie.ai/api-key](https://kie.ai/api-key) or BytePlus console |
| API Base URL | Auto-filled per provider (can override) |
| Default model | Seedance 2.0 / Fast / Mini (Mini = kie.ai only) |
| Default resolution, ratio, duration | Used on the Create page |

The API key is stored in the local SQLite database — never commit `data/` or `.env` with secrets.

**Default base URLs:**

```txt
kie.ai:    https://api.kie.ai
BytePlus:  https://ark.ap-southeast.bytepluses.com/api/v3
```

## Tech Stack

- Node.js, Express, EJS
- SQLite (`better-sqlite3`)
- Multer, Sharp
- Vanilla JavaScript and CSS
- Docker + Docker Compose (optional deploy)
- PM2 (default server deploy via `install.sh`)

## Project Structure

```txt
.
├── server.js              # Express entry point
├── database.js            # SQLite schema and helpers
├── routes/                # Pages and API routes
├── services/
│   ├── seedance.js        # BytePlus Seedance client
│   ├── kie.js             # kie.ai Seedance client
│   ├── kieUpload.js       # kie.ai file upload
│   ├── videoProvider.js   # Provider adapter (BytePlus / kie)
│   └── localMedia.js      # Video download and thumbnails
├── views/                 # EJS templates
├── public/                # CSS, JS, static assets
├── uploads/               # User reference images
├── downloads/             # Generated videos and thumbnails
├── Dockerfile
├── docker-compose.yml
├── install.sh             # Default deploy: Node.js + PM2
├── install-docker.sh      # Docker deploy (+ optional Docker install)
├── scripts/
│   └── install-common.sh  # Shared install helpers
└── DEPLOY.md              # Step-by-step deploy guide
```

## Data Storage

| Data | Local dev / PM2 | Docker deploy |
|------|-----------------|---------------|
| Settings & DB | `data/ugc.db` | Docker volume `ugcmaker-data` |
| Uploads | `uploads/` | `./uploads` (bind mount) |
| Videos | `downloads/` | `./downloads` (bind mount) |

These paths are gitignored and may contain private media and API configuration.

## Notes

- Keep generated media and API credentials private.
- The app has **no built-in login** — protect public deployments (HTTPS, reverse proxy, or VPN). See [DEPLOY.md](DEPLOY.md).
- Review model pricing before large batches ([kie.ai/pricing](https://kie.ai/pricing) or BytePlus console).
