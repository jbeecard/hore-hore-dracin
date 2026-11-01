// tools/scan-free.js — verifikasi episode terakhir: gratis vs kunci (login_required)
// Cara:  node tools/scan-free.js [from] [to]   (default semua)
// State disimpan di data/scan-state.json; hasil allowlist ditulis hanya saat scan penuh.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.SCAN_PORT || 8123);
const STATE_FILE = path.join(ROOT, 'data', 'scan-state.json');
const OUT_ALLOW = path.join(ROOT, 'data', 'allowlist.js');

function loadCatalog() {
  const win = {};
  new Function('window', fs.readFileSync(path.join(ROOT, 'data', 'dramalist.js'), 'utf8'))(win);
  return win.DRAMAS || [];
}

function postPlay(movieKey, episode) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ movieKey, episode });
    const req = http.request({
      host: 'localhost', port: PORT, path: '/proxy/playback', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, text: d }));
    });
    req.setTimeout(25000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

function payloadOf(j) {
  if (j && j.payload) return j.payload;
  if (!j || !j.token) return null;
  try {
    let s = String(j.token).split('.')[1] || '';
    let b = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    return JSON.parse(Buffer.from(b, 'base64').toString('utf8'));
  } catch (e) { return null; }
}

async function classify(d) {
  if ((d.eps || 0) <= 5) return 'free';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await postPlay(d.slug, d.eps);
      if (r.status !== 200) { await new Promise(x => setTimeout(x, 800)); continue; }
      let j = null;
      try { j = JSON.parse(r.text); } catch (e) { await new Promise(x => setTimeout(x, 800)); continue; }
      const p = payloadOf(j);
      if (!p) { await new Promise(x => setTimeout(x, 800)); continue; }
      if (p.kind === 'ok') return 'free';
      if (p.kind === 'login_required') return 'locked';
      return 'unknown';
    } catch (e) {
      await new Promise(x => setTimeout(x, 800));
    }
  }
  return 'unknown';
}

(async () => {
  const from = parseInt(process.argv[2] || '0', 10);
  const to = parseInt(process.argv[3] || '999999', 10);
  const cat = loadCatalog();
  const fullRun = to >= cat.length;
  let state = {};
  if (fs.existsSync(STATE_FILE)) { try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) {} }
  const slice = cat.slice(from, Math.min(to, cat.length));
  for (let i = 0; i < slice.length; i++) {
    const d = slice[i];
    if (state[d.slug]) continue;
    const st = await classify(d);
    state[d.slug] = st;
    if (((i + 1) % 25) === 0) console.log('progress ' + (from + i + 1) + '/' + cat.length);
    await new Promise(r => setTimeout(r, 120));
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
  const freeSlugs = Object.keys(state).filter(k => state[k] === 'free').sort();
  if (fullRun) {
    fs.writeFileSync(OUT_ALLOW,
      '// Hasil otomatis saka tools/scan-free.js\n' +
      'window.FREE_SLUGS =\n' + JSON.stringify(freeSlugs, null, 1) + ';\n');
  }
  console.log('progress end: scanned=' + Object.keys(state).length +
    ' free=' + freeSlugs.length +
    ' locked=' + Object.values(state).filter(v => v === 'locked').length +
    ' unknown=' + Object.values(state).filter(v => v === 'unknown').length +
    (fullRun ? ' [FULL -> allowlist ditulis]' : ' [partial]'));
})();
