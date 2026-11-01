// tools/fetch-narto.js — ambil judul tambahan dari sitemap Narto Drama
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'extras.js');
const MAX_UNIQUE = 600;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function decode(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 10)); })
    .replace(/&#x([0-9a-f]+);/gi, function (m, n) { return String.fromCharCode(parseInt(n, 16)); });
}

function guessCats(t) {
  const s = ' ' + t.toLowerCase() + ' ';
  const cats = [];
  if (/cinta|romansa|romantis|pernikahan|menikah|kasih|suami|istri|pacar|hati|cium|drama/.test(s)) cats.push('Romantis');
  if (/dendam|balas|pembalasan|revenge|venganza|karma|aib|musuh|kejam|counterattack/.test(s)) { cats.push('Dendam'); cats.push('Pembalasan'); }
  if (/selingkuh|perselingkuhan|affair|kekasih gelap/.test(s)) cats.push('Perselingkuhan');
  if (/sedih|tangis|air mata|pilu|kehilangan|menderita|menyesal/.test(s)) cats.push('Sedih');
  if (!cats.length) cats.push('Lainnya');
  return Array.from(new Set(cats)).slice(0, 3);
}

function fetchEpisodes(fileNo) {
  return new Promise((resolve, reject) => {
    const url = 'https://narto-drama.com/sitemaps/v2/episodes/' + fileNo + '.xml';
    const movies = new Map();
    let buf = '';
    const req = https.get(url, { headers: { 'User-Agent': UA, Accept: '*/*' } }, res => {
      if (res.statusCode !== 200) { req.destroy(); reject(new Error('HTTP ' + res.statusCode)); return; }
      res.setEncoding('utf8');
      res.on('data', chunk => {
        buf += chunk;
        let m;
        const re = /<url>[\s\S]*?<\/url>/g;
        while ((m = re.exec(buf))) {
          const block = m[0];
          const loc = (block.match(/<loc>(.*?)<\/loc>/) || [])[1] || '';
          const mm = loc.match(/\/detail\/watch\/([^/]+)\/(\d+)/);
          if (!mm) continue;
          const slug = mm[1];
          const ep = parseInt(mm[2], 10);
          const title = decode((block.match(/<image:title>(.*?)<\/image:title>/) || [])[1]);
          const poster = (block.match(/<image:loc>(.*?)<\/image:loc>/) || [])[1] || '';
          const desc = decode((block.match(/<video:description>(.*?)<\/video:description>/) || [])[1]).replace(/\s+/g, ' ').trim();
          let mv = movies.get(slug);
          if (!mv) { mv = { slug: slug, title: title, poster: poster, desc: desc, epsSet: new Set() }; movies.set(slug, mv); }
          if (title && !mv.title) mv.title = title;
          if (poster && !mv.poster) mv.poster = poster;
          if (desc && !mv.desc) mv.desc = desc;
          mv.epsSet.add(ep);
          if (movies.size >= MAX_UNIQUE) { req.destroy(); return; }
        }
        const last = buf.lastIndexOf('</url>');
        if (last > -1) buf = buf.slice(last + 6);
      });
      res.on('end', () => resolve(movies));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('timeout')));
  });
}

(async () => {
  const combined = new Map();
  for (let i = 1; i <= 4 && combined.size < MAX_UNIQUE; i++) {
    try {
      const mv = await fetchEpisodes(i);
      for (const [k, v] of mv) if (!combined.has(k)) combined.set(k, v);
      console.log('file ' + i + ' -> ' + mv.size + ' unik; total ' + combined.size);
    } catch (e) {
      console.log('file ' + i + ' ERR ' + e.message);
    }
  }
  const arr = Array.from(combined.values()).slice(0, MAX_UNIQUE);
  const extras = arr.map((v, i) => ({
    slug: v.slug,
    title: v.title || v.slug.replace(/-/g, ' '),
    poster: v.poster,
    eps: v.epsSet.size,
    dubbing: /\(dub\)|dubbed|sulih suara/i.test(v.title),
    synopsis: v.desc,
    cats: guessCats((v.title || '') + ' ' + (v.desc || '')),
    provider: 'Narto Drama',
    providerCode: 'nt'
  }));
  fs.writeFileSync(OUT,
    '// Hasil otomatis saka tools/fetch-narto.js (total: ' + extras.length + ' judul tambahan)\n' +
    'window.NARTO_EXTRA =\n' + JSON.stringify(extras, null, 1) + ';\n');
  console.log('Ditulis ' + extras.length + ' judul ekstra -> data/extras.js');
})();
