// Hore-Hore Dracin v2 — server lokal + API JSON + proxy playback/media
// Cara nganggo:  node server.js  -> buka http://localhost:8000
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8000;
const ROOT = __dirname;
const API_KEY = 'xb3MdwdLrZrpaDXvrLLwfP==';
const ORIGIN = 'https://www.dracinema.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4'
};

function loadCatalog() {
  const file = path.join(ROOT, 'data', 'dramalist.js');
  try {
    const win = {};
    new Function('window', fs.readFileSync(file, 'utf8'))(win);
    return Array.isArray(win.DRAMAS) ? win.DRAMAS : [];
  } catch (e) { return []; }
}
function loadTaxonomy() {
  const file = path.join(ROOT, 'data', 'tags.js');
  try {
    const win = {};
    new Function('window', fs.readFileSync(file, 'utf8'))(win);
    return win.TAXONOMY || {};
  } catch (e) { return {}; }
}

let catalogCache = null;
function getCatalog() { if (!catalogCache) catalogCache = loadCatalog(); return catalogCache; }
let taxCache = null;
function getTaxonomy() { if (!taxCache) taxCache = loadTaxonomy(); return taxCache; }

function serveStatic(req, res) {
  let p = decodeURIComponent((req.url.split('?')[0]) || '/');
  if (p === '/') p = '/index.html';
  p = path.normalize(path.join(ROOT, p));
  if (!p.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function httpGet(urlStr, timeoutMs) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { reject(e); return; }
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get(u, { headers: { 'User-Agent': UA, Referer: ORIGIN + '/' } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.setTimeout(timeoutMs || 20000, () => req.destroy(new Error('Upstream timeout')));
    req.on('error', reject);
  });
}

// ---- Narto playback: ambil daftar episode dari halaman watch, lalu pilih URL stream ----
const NARTO_EDGE = 'https://edge.narto-drama.com';
const NARTO_DECRYPT = 'https://api.sansekai.my.id/api/dramabox/decrypt-stream?url=';
const nartoCache = new Map(); // slug -> {ts, eps: Map(ep -> {url, subtitle})}

function unescapeUrl(s) {
  return String(s || '').replace(/\\\//g, '/').replace(/\\"/g, '"');
}

function parseNartoEpisodes(html) {
  const eps = new Map();
  const rePos = /"route_episode_number":(\d+)/g;
  const pos = [];
  let m;
  while ((m = rePos.exec(html))) pos.push({ ep: parseInt(m[1], 10), idx: m.index });
  for (let i = 0; i < pos.length; i++) {
    const start = pos[i].idx;
    const end = i + 1 < pos.length ? pos[i + 1].idx : Math.min(html.length, start + 3000);
    const seg = html.slice(start, end);
    const play = (seg.match(/"play_url":"([^"]*)"/) || [])[1];
    const direct = (seg.match(/"direct_play_url":"([^"]*)"/) || [])[1];
    const sub = (seg.match(/"subtitle_url":"([^"]*)"/) || [])[1];
    const url = unescapeUrl(direct || play || '');
    if (!url.startsWith('http')) continue;
    const isMp4 = !!direct && !/\.m3u8/i.test(unescapeUrl(direct));
    eps.set(pos[i].ep, { url, isMp4, subtitle: sub ? unescapeUrl(sub) : null });
  }
  return eps;
}

async function resolveNartoStream(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower.includes('/api/dramabox/decrypt-stream?url=')) {
    try { const r = await httpGet(raw); return parseDecryptResponse(r.text); } catch (e) { return raw; }
  }
  if (!lower.includes('.encrypt.mp4')) return raw;
  try {
    const r = await httpGet(NARTO_DECRYPT + encodeURIComponent(raw));
    return parseDecryptResponse(r.text);
  } catch (e) { return raw; }
}

function parseDecryptResponse(text) {
  try {
    const j = JSON.parse(text);
    if (j && typeof j.url === 'string' && j.url) return j.url;
    if (j && j.data && typeof j.data.url === 'string' && j.data.url) return j.data.url;
  } catch (e) {}
  const t = String(text || '').trim();
  if (t.startsWith('http')) return t;
  return '';
}

async function nartoRefreshSource(slug, ep, token) {
  const url = NARTO_EDGE + '/detail/watch/' + encodeURIComponent(slug) + '/' + ep + '/refresh-source?lang=id-ID&force=1&rs_ctx=' + encodeURIComponent(token);
  const r = await httpGet(url, 30000);
  if (r.status === 429) { await sleep(2000); throw new Error('Narto refresh-source sibuk (429)'); }
  if (r.status !== 200) throw new Error('Narto refresh-source HTTP ' + r.status);
  let j = null;
  try { j = JSON.parse(r.text); } catch (e) { throw new Error('Narto refresh-source non-JSON'); }
  if (!j || !j.ok) throw new Error('Narto refresh-source gagal');
  const direct = unescapeUrl(j.direct_play_url || '');
  const play = unescapeUrl(j.play_url || '');
  const chosen = direct || play;
  if (!chosen) throw new Error('Narto: stream kosong dari refresh-source');
  return { url: chosen, isMp4: !!direct && j.direct_play_is_hls !== true, subtitle: unescapeUrl(j.subtitle_url || '') };
}

const refreshCache = new Map();
function refreshCacheGet(key) {
  const c = refreshCache.get(key);
  return (c && (Date.now() - c.ts) < 12 * 60 * 60 * 1000) ? c.item : null;
}
function refreshCacheSet(key, item) {
  if (refreshCache.size > 500) { const k = refreshCache.keys().next().value; refreshCache.delete(k); }
  refreshCache.set(key, { ts: Date.now(), item });
}

async function fetchNartoPage(slug) {
  const url = NARTO_EDGE + '/detail/watch/' + encodeURIComponent(slug) + '/1?lang=id-ID';
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await httpGet(url, 30000);
      if (r.status !== 200) { lastErr = new Error('Narto watch HTTP ' + r.status); await sleep(1200); continue; }
      const eps = parseNartoEpisodes(r.text);
      if (!eps.size) { lastErr = new Error('Narto: daftar episode kosong'); await sleep(1500); continue; }
      const tm = r.text.match(/const refreshSourceContextToken = "([^"]+)"/);
      return { eps, token: tm ? tm[1] : '' };
    } catch (e) { lastErr = e; await sleep(1000); }
  }
  throw lastErr || new Error('Narto: page gagal dimuat');
}

async function nartoPlayback(slug, ep) {
  const cached = nartoCache.get(slug);
  if (!cached || (Date.now() - cached.ts) >= 6 * 60 * 60 * 1000) {
    const fresh = await fetchNartoPage(slug);
    nartoCache.set(slug, { ts: Date.now(), eps: fresh.eps, token: fresh.token });
  }
  const data = nartoCache.get(slug);
  const base = data.eps.get(ep);
  const totalEps = data.eps.size;
  if (base && base.url) {
    return { totalEps, item: { url: base.url, isMp4: base.isMp4, subtitle: base.subtitle } };
  }
  const rkey = slug + ':' + ep;
  const rc = refreshCacheGet(rkey);
  if (rc) return { totalEps, item: rc };
  if (!data.token) throw new Error('Narto: token refresh ora kasedhiya');
  const src = await nartoRefreshSource(slug, ep, data.token);
  const item = { url: src.url, isMp4: src.isMp4, subtitle: src.subtitle };
  refreshCacheSet(rkey, item);
  return { totalEps, item };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function httpJsonPost(urlStr, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { reject(e); return; }
    const mod = u.protocol === 'https:' ? https : http;
    const payload = Buffer.from(String(body), 'utf8');
    const req = mod.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: Object.assign({ 'Content-Length': payload.length }, headers)
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.setTimeout(timeoutMs || 20000, () => req.destroy(new Error('Upstream timeout')));
    req.on('error', reject);
    req.end(payload);
  });
}

async function proxyPlayback(body) {
  const playUrl = ORIGIN + '/play/' + body.movieKey + '/' + (body.episode || 1);
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, */*',
    Origin: ORIGIN,
    Referer: playUrl,
    'User-Agent': UA,
    'X-API-Key': API_KEY,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin'
  };
  const payload = JSON.stringify({ movieKey: body.movieKey, episode: Number(body.episode) });
  if (typeof fetch === 'function') {
    const r = await fetch(ORIGIN + '/api/playback', { method: 'POST', headers, body: payload });
    return { status: r.status, text: await r.text() };
  }
  return httpJsonPost(ORIGIN + '/api/playback', headers, payload);
}

function refererFor(targetUrl) {
  try {
    const h = new URL(targetUrl).hostname;
    if (/narto-drama\.com$/.test(h) || /nartodrama-api\.online$/.test(h) || /sansekai\.my\.id$/.test(h)) return 'https://stream.narto-drama.com/';
  } catch (e) {}
  return ORIGIN + '/';
}

function proxyMedia(targetUrl, rangeHeader, res) {
  let u;
  try { u = new URL(targetUrl); } catch (e) { res.writeHead(400); res.end('Bad url'); return; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') { res.writeHead(400); res.end('Bad protocol'); return; }
  const mod = u.protocol === 'https:' ? https : http;
  const headers = { 'User-Agent': UA, Referer: refererFor(targetUrl) };
  if (rangeHeader) headers.Range = rangeHeader;
  const req = mod.get(u, { headers }, upstream => {
    const out = {
      'Content-Type': upstream.headers['content-type'] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Accept-Ranges': upstream.headers['accept-ranges'] || 'bytes'
    };
    if (upstream.headers['content-length']) out['Content-Length'] = upstream.headers['content-length'];
    if (upstream.headers['content-range']) out['Content-Range'] = upstream.headers['content-range'];
    res.writeHead(upstream.statusCode || 200, out);
    upstream.pipe(res);
  });
  req.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Proxy media error');
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url.startsWith('/proxy/media')) {
    let u = '';
    try { u = decodeURIComponent(new URL(req.url, 'http://x').searchParams.get('url') || ''); } catch (e) {}
    if (!u) { res.writeHead(400); res.end('Missing url'); return; }
    proxyMedia(u, req.headers.range, res);
    return;
  }
  if (req.method === 'GET' && req.url.startsWith('/proxy/narto-playback')) {
    const u = new URL(req.url, 'http://x');
    const slug = u.searchParams.get('slug') || '';
    const ep = parseInt(u.searchParams.get('ep') || '1', 10);
    if (!slug) { json(res, 400, { success: false, error: 'Missing slug' }); return; }
    (async () => {
      try {
        const { totalEps, item } = await nartoPlayback(slug, ep);
        const streamUrl = item.url;
        if (!streamUrl) { json(res, 502, { success: false, error: 'Narto: stream URL kosong' }); return; }
        json(res, 200, {
          success: true, kind: 'ok', provider: 'Narto Drama',
          url: streamUrl,
          isMp4: !!item.isMp4,
          subtitleUrl: item.subtitle,
          totalEps: totalEps,
          episode: ep
        });
      } catch (e) {
        console.error('[narto playback]', e.message);
        json(res, 502, { success: false, error: String(e.message) });
      }
    })();
    return;
  }
  if (req.method === 'POST' && req.url.startsWith('/proxy/playback')) {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', async () => {
      function decodeTokenPayload(token) {
        if (!token) return null;
        try {
          const part = String(token).split('.')[1] || '';
          let b64 = part.replace(/-/g, '+').replace(/_/g, '/');
          while (b64.length % 4) b64 += '=';
          return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
        } catch (e) { return null; }
      }
      try {
        const body = JSON.parse(raw || '{}');
        const { status, text } = await proxyPlayback(body);
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
        if (!parsed) {
          console.error('[proxy playback] non-JSON dari upstream, status=' + status);
          json(res, 502, { success: false, error: 'Upstream membalas non-JSON (status ' + status + ')' });
          return;
        }
        const enriched = Object.assign({}, parsed, { payload: decodeTokenPayload(parsed.token) });
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(enriched));
      } catch (e) {
        console.error('[proxy playback]', e.message);
        json(res, 502, { success: false, error: String(e.message) });
      }
    });
    return;
  }
  if (req.method === 'GET' && req.url.startsWith('/api/')) {
    const u = new URL(req.url, 'http://x');
    const pathname = u.pathname;
    if (pathname === '/api/health') { json(res, 200, { ok: true, name: 'Hore-Hore Dracin', time: new Date().toISOString() }); return; }
    if (pathname === '/api/catalog') { json(res, 200, getCatalog()); return; }
    if (pathname === '/api/stats') { json(res, 200, getTaxonomy().totals || {}); return; }
    if (pathname === '/api/tags') { json(res, 200, getTaxonomy()); return; }
    const mm = pathname.match(/^\/api\/movie\/(.+)$/);
    if (mm) {
      const slug = decodeURIComponent(mm[1]);
      const d = getCatalog().find(x => x.slug === slug);
      if (d) { json(res, 200, d); return; }
      json(res, 404, { success: false, error: 'movie not found' });
      return;
    }
    json(res, 404, { success: false, error: 'unknown api' });
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log('Hore-Hore Dracin v2 jalan ing: http://localhost:' + PORT);
});

