// Netlify Function: /proxy/narto-playback
const NARTO_EDGE = 'https://edge.narto-drama.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const nartoCache = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));

function unescapeUrl(s) {
  return String(s || '').replace(/\\\//g, '/').replace(/\\"/g, '"');
}

async function httpGet(url, timeout) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout || 30000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: ctl.signal });
    const text = await res.text();
    return { status: res.status, text };
  } finally { clearTimeout(t); }
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

async function fetchNartoPage(slug) {
  const url = NARTO_EDGE + '/detail/watch/' + encodeURIComponent(slug) + '/1?lang=id-ID';
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await httpGet(url, 35000);
      if (r.status !== 200) { lastErr = new Error('Narto watch HTTP ' + r.status); await sleep(1200); continue; }
      const eps = parseNartoEpisodes(r.text);
      if (!eps.size) { lastErr = new Error('Narto: daftar episode kosong'); await sleep(1500); continue; }
      const tm = r.text.match(/const refreshSourceContextToken = "([^"]+)"/);
      return { eps, token: tm ? tm[1] : '' };
    } catch (e) { lastErr = e; await sleep(1000); }
  }
  throw lastErr || new Error('Narto: page gagal dimuat');
}

async function nartoRefreshSource(slug, ep, token) {
  const url = NARTO_EDGE + '/detail/watch/' + encodeURIComponent(slug) + '/' + ep + '/refresh-source?lang=id-ID&force=1&rs_ctx=' + encodeURIComponent(token);
  const r = await httpGet(url, 35000);
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
  if (!data.token) throw new Error('Narto: token refresh ora kasedhiya');
  const src = await nartoRefreshSource(slug, ep, data.token);
  return { totalEps, item: { url: src.url, isMp4: src.isMp4, subtitle: src.subtitle } };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: '{}' };
  const p = event.queryStringParameters || {};
  const slug = (p.slug || '').trim();
  const ep = parseInt(p.ep || '1', 10);
  if (!slug) return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Missing slug' }) };
  try {
    const { totalEps, item } = await nartoPlayback(slug, ep);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        success: true, kind: 'ok', provider: 'Narto Drama',
        url: item.url, isMp4: item.isMp4,
        subtitleUrl: item.subtitle, totalEps, episode: ep
      })
    };
  } catch (e) {
    return { statusCode: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ success: false, error: e.message }) };
  }
};
