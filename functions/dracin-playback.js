// Netlify Function: /proxy/playback (Dracinema) — fallback
const ORIGIN = 'https://www.dracinema.com';
const API_KEY = 'xb3MdwdLrZrpaDXvrLLwfP==';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function decodeTokenPayload(token) {
  if (!token) return null;
  try {
    const part = String(token).split('.')[1] || '';
    let b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch (e) { return null; }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: '{}' };
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}
  const movieKey = body.movieKey || '';
  const episode = Number(body.episode) || 1;
  if (!movieKey) return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Missing movieKey' }) };
  try {
    const playUrl = ORIGIN + '/play/' + movieKey + '/' + episode;
    const res = await fetch(ORIGIN + '/api/playback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
        Origin: ORIGIN,
        Referer: playUrl,
        'User-Agent': UA,
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({ movieKey, episode })
    });
    const text = await res.text();
    let parsed = {};
    try { parsed = JSON.parse(text); } catch (e) { parsed = {}; }
    const enriched = Object.assign({}, parsed, { payload: decodeTokenPayload(parsed.token) });
    return { statusCode: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(enriched) };
  } catch (e) {
    return { statusCode: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ success: false, error: e.message }) };
  }
};
