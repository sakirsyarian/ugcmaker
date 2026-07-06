# Panduan Deploy UGC Maker

Panduan ini ditulis untuk **pemula non-developer**. Ikuti langkah demi langkah — tidak perlu bisa coding.

UGC Maker adalah aplikasi web untuk membuat video UGC dengan AI (Seedance). Setelah deploy, kamu bisa buka lewat browser seperti website biasa.

---

## Apa yang Kamu Butuhkan

Sebelum mulai, siapkan:

1. **VPS / server Linux** (Ubuntu 22.04 atau 24.04 direkomendasikan)
   - **PM2 (default):** minimal 1 GB RAM, 10 GB storage
   - **Docker:** disarankan 2 GB RAM, 10–20 GB storage
   - Contoh provider: DigitalOcean, Vultr, Hetzner, IDCloudHost, dll.

2. **Akses SSH ke server**
   - Kamu punya IP server, username (biasanya `root`), dan password atau SSH key

3. **API key** dari provider yang dipakai:
   - **kie.ai** → [https://kie.ai/api-key](https://kie.ai/api-key)
   - **BytePlus** → console BytePlus ModelArk

4. **Domain (opsional)**
   - Bisa pakai IP server dulu, misalnya `http://123.456.789.0:3000`

---

## Pilih Cara Deploy

| | **PM2 (default)** | **Docker** |
|---|-------------------|------------|
| Script | `./install.sh` | `./install-docker.sh` |
| RAM | 1 GB cukup | 2 GB disarankan |
| Prasyarat | Node.js 22 (auto-install) | Docker (auto-install) |
| Backup DB | Langsung di `./data/ugc.db` | Perlu `docker cp` |
| Cocok untuk | VPS kecil, personal | Isolasi, tanpa Node di host |

> **Rekomendasi:** VPS 1 GB → pakai `./install.sh`. VPS 2 GB+ atau sudah familiar Docker → `./install-docker.sh`.

---

## Langkah 1 — Masuk ke Server (SSH)

Masuk ke server lewat terminal. Contoh di Windows pakai **PuTTY** atau **Windows Terminal**:

```bash
ssh root@IP_SERVER_KAMU
```

---

## Langkah 2 — Download Project

```bash
cd /opt
git clone https://github.com/USERNAME/ugcmaker.git
cd ugcmaker
```

> Ganti URL `git clone` dengan link repository yang benar.

---

## Langkah 3 — Jalankan Install Otomatis

### Opsi A — PM2 (default, ringan)

```bash
chmod +x install.sh
./install.sh
```

Script ini akan:
- Mengecek Node.js 22 — **install otomatis jika belum ada** (Linux, setelah konfirmasi `y`)
- Install build tools untuk native modules (`better-sqlite3`, `sharp`)
- `npm ci --omit=dev`
- Install PM2 dan menjalankan aplikasi
- Menyalakan UGC Maker di port **3000**

Install tanpa konfirmasi (automation):

```bash
AUTO_INSTALL_NODE=1 AUTO_INSTALL_PM2=1 AUTO_PM2_STARTUP=1 ./install.sh
```

### Opsi B — Docker

```bash
chmod +x install-docker.sh
./install-docker.sh
```

Script ini akan:
- Mengecek Docker — **install otomatis jika belum ada** (Linux, setelah konfirmasi `y`)
- Membuat folder `uploads`, `downloads`, dan `data`
- Build image Docker dan menjalankan container
- Menyalakan UGC Maker di port **3000**

Install Docker tanpa konfirmasi:

```bash
AUTO_INSTALL_DOCKER=1 ./install-docker.sh
```

Kalau berhasil, akan muncul pesan seperti:

```text
UGC Maker is running.
  Local:  http://localhost:3000
```

---

## Langkah 4 — Buka Aplikasi di Browser

Buka di komputer kamu:

```text
http://IP_SERVER_KAMU:3000
```

Contoh: `http://123.456.789.0:3000`

### Port 3000 tidak bisa diakses?

Buka port di firewall server:

```bash
ufw allow 3000/tcp
ufw reload
```

Atau ganti port di file `.env`:

```env
PORT=8080
```

Lalu jalankan ulang:

**PM2:**

```bash
pm2 restart ugcmaker
```

**Docker:**

```bash
docker compose down
docker compose up -d
```

Akses: `http://IP_SERVER_KAMU:8080`

---

## Langkah 5 — Atur API Key (Penting!)

1. Buka menu **Settings** di aplikasi
2. Pilih **API Provider**:
   - **kie.ai** — jika pakai Seedance via kie.ai
   - **BytePlus ModelArk** — jika pakai BytePlus langsung
3. Paste **API Key** kamu
4. Klik **Save Settings**

Untuk kie.ai, saldo kredit akan muncul di halaman Settings setelah API key disimpan.

---

## Perintah Sehari-hari

Jalankan semua perintah di folder project (`cd /opt/ugcmaker`):

### PM2 (`./install.sh`)

| Tujuan | Perintah |
|--------|----------|
| Lihat status | `pm2 status` |
| Lihat log | `pm2 logs ugcmaker` |
| Stop aplikasi | `pm2 stop ugcmaker` |
| Start lagi | `pm2 start ugcmaker` |
| Restart | `pm2 restart ugcmaker` |
| Update setelah `git pull` | `git pull && npm ci --omit=dev && pm2 restart ugcmaker` |

### Docker (`./install-docker.sh`)

| Tujuan | Perintah |
|--------|----------|
| Lihat status | `docker compose ps` |
| Lihat log | `docker compose logs -f` |
| Stop aplikasi | `docker compose down` |
| Start lagi | `docker compose up -d` |
| Update setelah `git pull` | `docker compose up -d --build` |

Tekan `Ctrl + C` untuk keluar dari mode log.

---

## Backup Data Penting

### PM2 — semua file di folder project

| Data | Lokasi |
|------|--------|
| Pengaturan & database | `./data/ugc.db` |
| Gambar referensi upload | `./uploads` |
| Video hasil generate | `./downloads` |

```bash
cd /opt/ugcmaker
tar -czf backup-$(date +%Y%m%d).tar.gz data uploads downloads
```

### Docker

| Data | Lokasi |
|------|--------|
| Pengaturan & database | Docker volume `ugcmaker-data` |
| Gambar referensi upload | `./uploads` |
| Video hasil generate | `./downloads` |

```bash
cd /opt/ugcmaker
tar -czf backup-media-$(date +%Y%m%d).tar.gz uploads downloads
docker cp ugcmaker:/app/data/ugc.db ./backup-ugc.db
```

Jalankan backup secara berkala (misalnya seminggu sekali).

---

## Update Aplikasi

**PM2:**

```bash
cd /opt/ugcmaker
git pull
npm ci --omit=dev
pm2 restart ugcmaker
```

**Docker:**

```bash
cd /opt/ugcmaker
git pull
docker compose up -d --build
```

Data lama (video, settings) tetap aman selama folder `data/`, volume Docker, `uploads/`, dan `downloads/` tidak dihapus.

---

## Troubleshooting

### PM2 — aplikasi tidak jalan

```bash
pm2 logs ugcmaker --lines 50
pm2 restart ugcmaker
```

### PM2 — `npm ci` gagal (better-sqlite3)

Pastikan build tools terpasang:

```bash
sudo apt-get install -y build-essential python3 libvips42
npm ci --omit=dev
pm2 restart ugcmaker
```

### Docker belum terpasang / permission denied

Jalankan ulang:

```bash
./install-docker.sh
```

Atau install manual:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Lalu **logout dan login lagi** ke SSH, setelah itu:

```bash
./install-docker.sh
```

### Container tidak jalan / status `Restarting`

```bash
docker compose logs --tail 50
```

(Gunakan `sudo docker compose logs` jika perlu.)

### Port sudah dipakai aplikasi lain

Edit `.env`:

```env
PORT=8080
```

Lalu restart (PM2: `pm2 restart ugcmaker` / Docker: `docker compose down && docker compose up -d`).

### Lupa API key / settings hilang

Settings disimpan di database (`data/ugc.db` atau volume Docker). Restore dari backup jika pernah di-backup.

### Halaman tidak muncul dari luar server

Cek:
1. App jalan (`pm2 status` atau `docker compose ps`)
2. Firewall VPS sudah buka port
3. Provider cloud punya **Security Group** — buka port 3000 (atau port custom kamu)

---

## Keamanan (Wajib Dibaca)

- Aplikasi **tidak punya login/password** bawaan
- **Jangan** expose langsung ke internet publik tanpa proteksi
- Rekomendasi untuk production:
  - Pasang **HTTPS** (pakai Caddy atau Nginx + domain)
  - Batasi akses dengan **password** di reverse proxy, atau
  - Hanya buka via **VPN** / IP whitelist

---

## Deploy di Windows (Lokal / Testing)

**Development (Node langsung):**

```powershell
npm install
npm start
```

**Docker Desktop:**

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
2. Buka folder project di terminal
3. Jalankan:

```powershell
docker compose up -d --build
```

4. Buka `http://localhost:3000`

> Jika port 3000 sudah dipakai, buat file `.env` dengan isi `PORT=3001` lalu akses `http://localhost:3001`.

---

## Ringkasan Cepat

```bash
# Install PM2 (default, VPS 1GB+)
git clone <repo-url> /opt/ugcmaker
cd /opt/ugcmaker
chmod +x install.sh && ./install.sh

# Install Docker (VPS 2GB+)
chmod +x install-docker.sh && ./install-docker.sh

# Sehari-hari — PM2
pm2 status
pm2 logs ugcmaker
pm2 restart ugcmaker

# Sehari-hari — Docker
docker compose ps
docker compose logs -f
docker compose up -d

# Update — PM2
git pull && npm ci --omit=dev && pm2 restart ugcmaker

# Update — Docker
git pull && docker compose up -d --build
```

Setelah deploy, buka **Settings** → masukkan API key → mulai buat video di menu **Create**.

Butuh bantuan lebih lanjut? Cek log (`pm2 logs ugcmaker` atau `docker compose logs -f`) dan kirim screenshot error-nya.
