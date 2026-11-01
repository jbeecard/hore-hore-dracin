# Hore-Hore Dracin v2 🎬

Portal nonton drama pendek **gratis** — gaya platform streaming modern (inspirasi tampilan: Narto Drama).
**Tanpa langganan, tanpa kunci.** Penonton cukup menonton iklan singkat sebelum episode diputar.

## Fitur
- **Beranda** — hero slider, baris "Lanjutkan Nonton", kategori cepat, baris Populer/Terbaru/Rekomendasi + per-kategori, statistik
- **Jelajah** — pencarian, filter kategori/genre/format/provider, urutkan, pagination
- **Detail** — poster, sinopsis, tag, grid episode, judul terkait
- **Player** — HLS + dekripsi video Melolo, pilih kualitas, subtitle Indonesia, auto-next episode, simpan riwayat nonton
- **Iklan** — pre-roll interstitial + banner (mode demo; siap ganti AdSense/custom)
- **Login opsional** (lokal) untuk menyembunyikan iklan — **tidak wajib**, semua tetap gratis
- **Server** — API JSON (`/api/*`) + proxy playback/media

## Cara nganggo
```bash
node server.js
```
Buka **http://localhost:8000**.

Regenerasi katalog setelah mengubah `data/source-raw.js`:
```bash
node tools/build-catalog.js
```

## Deploy ke Netlify
Proyek sudah disiapkan untuk Netlify:
- `netlify.toml` — build static (publish: `.`), redirect SPA, & redirect ke Functions.
- `functions/narto-playback.js` — endpoint playback Narto (full episode).
- `functions/dracin-playback.js` — endpoint playback Dracinema (fallback).

Langkah:
1. Push repo ke GitHub (sudah).
2. Di Netlify: **Add new site → Import from Git → pilih `jbeecard/hore-hore-dracin`**.
3. Build settings otomatis terbaca dari `netlify.toml` (tidak perlu isi build command).
4. Deploy. Site dapat diakses di `https://<nama>.netlify.app`.
5. (Opsional) ganti domain kustom di **Domain settings**.

Catatan:
- Video diputar **langsung dari CDN Narto** (CORS `*`), jadi tidak perlu proxy media di sisi server.
- Endpoint `/proxy/narto-playback` diarahkan ke Function; di local dev tetap memakai `server.js`.

## Struktur
```
index.html                shell SPA
server.js                 web server + API + proxy playback/media
package.json
css/style.css             tema baru (gaya Narto Drama)
js/app.js                 logika SPA (routing, filter, player, iklan, riwayat)
js/hls.min.js             pemutar HLS (lokal)
js/melolo-decrypt.js      dekripsi video Melolo
data/dramalist.js         katalog akhir (terfilter: Narto, gratis ≤5 episode) — DATABASE
data/tags.js              taxonomi kategori/genre/provider + statistik
data/ads.js               konfigurasi iklan
data/filter.js            aturan filter (keepProviders + maxEps)
data/extras.js            judul tambahan dari Narto Drama (hasil scraper)
data/source-raw.js        sumber katalog asli Dracinema (arsip)
data/scan-state.json      hasil verifikasi episode (untuk maintenance)
img/logo.png              logo
tools/build-catalog.js    generator katalog (gabung + filter)
tools/fetch-narto.js      scraper judul tambahan dari sitemap Narto Drama
tools/scan-free.js        verifikasi episode gratis vs kunci
```

## Ganti iklan asli
Buka `data/ads.js`:
- `mode: "demo"` → `"adsense"` atau `"custom"`
- isi `adsense.client` + slot, atau tulis HTML iklan di `preroll.html` / `banner.html`

Model: gratis — tanpa langganan. Iklan hanya tampil untuk menonton (pre-roll singkat sebelum video).

## Regenerasi / update database
```bash
# 1) (opsional) ambil judul tambahan dari Narto Drama
node tools/fetch-narto.js

# 2) (opsional) verifikasi episode yang gratis (jalankan saat server nyala)
#    node tools/scan-free.js 0 850

# 3) bangun ulang katalog (menerapkan data/filter.js)
node tools/build-catalog.js
```

## Catatan
- Katalog final hanya berisi **source Narto Drama** — **episode FULL** (bukan cuma 5) bisa diputar gratis.
- Video diambil dari **CDN resmi Narto** (`cdn.narto-drama.com`) — langsung dari data halaman (tanpa panggil `refresh-source` tiap episode, sehingga **tidak terkena rate-limit 429**); `refresh-source` hanya fallback + di-cache 12 jam.
- Halaman Narto di-cache 6 jam & parse-nya di-retry otomatis (server 3x + app 2x).
- Model: gratis — tanpa langganan. Penonton cukup menonton iklan pre-roll; video tetap full episode.
- Untuk mengubah aturan filter (mis. batasi episode): edit `data/filter.js` (`keepProviders`, `maxEps`).
- Sumber asli Dracinema tetap diarsipkan di `data/source-raw.js`.
