// tools/build-catalog.js
// Baca katalog sumber (data/source-raw.js) + ekstra (data/extras.js) -> hasilake:
//   - data/dramalist.js  (katalog diperkaya: id, tags, provider)
//   - data/tags.js       (taxonomi kategori/genre/provider + statistik)
// Cara nganggo:  node tools/build-catalog.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.existsSync(path.join(ROOT, 'data', 'source-raw.js'))
  ? path.join(ROOT, 'data', 'source-raw.js')
  : path.join(ROOT, 'data.js');
const OUT_LIST = path.join(ROOT, 'data', 'dramalist.js');
const OUT_TAGS = path.join(ROOT, 'data', 'tags.js');
const EXTRA_FILE = path.join(ROOT, 'data', 'extras.js');

const GENRE_LABEL = {
  aksi: 'Aksi',
  ambisius: 'Ambisius',
  'balas-dendam': 'Balas Dendam',
  'ceo-bos': 'CEO & Bos',
  fantasi: 'Fantasi',
  'identitas-tersembunyi': 'Identitas Tersembunyi',
  keluarga: 'Keluarga',
  komedi: 'Komedi',
  kontemporer: 'Kontemporer',
  misteri: 'Misteri',
  modern: 'Modern',
  'pahlawan-wanita-kuat': 'Wanita Kuat',
  pengkhianatan: 'Pengkhianatan',
  perempuan: 'Perempuan',
  'perjalanan-waktu': 'Perjalanan Waktu',
  romansa: 'Romansa',
  romantis: 'Romantis'
};

const PROVIDER_LABEL = {
  dw: 'Dracinema',
  ml: 'Melolo',
  ns: 'NeoSaga',
  id: 'IndoDrama',
  mr: 'MegaRama',
  sm: 'Sulih Suara',
  sw: 'SwiftPlay',
  fr: 'FrameRush'
};

function humanize(s) {
  return String(s || '').split('-').map(function (w) {
    return w ? w[0].toUpperCase() + w.slice(1) : w;
  }).join(' ');
}

function detectProvider(slug) {
  const m = String(slug).match(/-([a-z]{2,4})_/) || String(slug).match(/-([a-z]{2,4})$/);
  const code = m ? m[1] : 'xx';
  return { code: code, label: PROVIDER_LABEL[code] || 'Lokal' };
}

if (!fs.existsSync(SRC)) {
  console.error('Sumber katalog ora ketemu:', SRC);
  process.exit(1);
}

const src = fs.readFileSync(SRC, 'utf8');
const win = {};
new Function('window', src)(win);
const list = Array.isArray(win.DRAMAS) ? win.DRAMAS : [];
if (!list.length) { console.error('DRAMAS kosong.'); process.exit(1); }

const out = list.map(function (d, i) {
  const genres = Array.isArray(d.genres) ? d.genres : [];
  const cats = Array.isArray(d.cats) ? d.cats : [];
  const prov = detectProvider(d.slug || '');
  const tags = genres.map(function (g) { return GENRE_LABEL[g] || humanize(g); });
  return {
    id: 'D' + String(i + 1).padStart(4, '0'),
    slug: d.slug,
    title: String(d.title || '').trim(),
    poster: d.poster || '',
    eps: Number(d.eps) || 0,
    dubbing: !!d.dubbing,
    synopsis: String(d.synopsis || '').trim(),
    cats: cats,
    genres: genres,
    tags: tags,
    provider: prov.label,
    providerCode: prov.code
  };
});

// ---- ekstra dari Narto (data/extras.js) ----
let extras = [];
if (fs.existsSync(EXTRA_FILE)) {
  try {
    const w2 = {};
    new Function('window', fs.readFileSync(EXTRA_FILE, 'utf8'))(w2);
    const arr = Array.isArray(w2.NARTO_EXTRA) ? w2.NARTO_EXTRA : [];
    const existing = new Set(out.map(x => x.slug));
    arr.forEach((e, i) => {
      if (!e || !e.slug || existing.has(e.slug)) return;
      existing.add(e.slug);
      extras.push({
        id: 'N' + String(i + 1).padStart(4, '0'),
        slug: e.slug,
        title: String(e.title || '').trim(),
        poster: e.poster || '',
        eps: Number(e.eps) || 0,
        dubbing: !!e.dubbing,
        synopsis: String(e.synopsis || '').trim(),
        cats: Array.isArray(e.cats) && e.cats.length ? e.cats : ['Lainnya'],
        genres: Array.isArray(e.genres) ? e.genres : [],
        tags: Array.isArray(e.tags) ? e.tags : [],
        provider: e.provider || 'Narto Drama',
        providerCode: e.providerCode || 'nt'
      });
    });
  } catch (e) { console.error('Extras gagal dimuat:', e.message); }
}
const all = out.concat(extras);

// ---- allowlist: mung tampilake video sing gratis (hasil scan) ----
let final = all;
const ALLOW_FILE = path.join(ROOT, 'data', 'allowlist.js');
if (fs.existsSync(ALLOW_FILE)) {
  try {
    const w3 = {};
    new Function('window', fs.readFileSync(ALLOW_FILE, 'utf8'))(w3);
    const set = new Set(Array.isArray(w3.FREE_SLUGS) ? w3.FREE_SLUGS : []);
    if (set.size) final = all.filter(x => set.has(x.slug));
  } catch (e) { console.error('Allowlist gagal dimuat:', e.message); }
}

// ---- filter tambahan (data/filter.js) ----
const FILTER_FILE = path.join(ROOT, 'data', 'filter.js');
if (fs.existsSync(FILTER_FILE)) {
  try {
    const w4 = {};
    new Function('window', fs.readFileSync(FILTER_FILE, 'utf8'))(w4);
    const f = w4.CATALOG_FILTER || {};
    let arr = final;
    if (f.keepProviders && f.keepProviders.length) {
      arr = arr.filter(x => f.keepProviders.indexOf(x.provider) !== -1);
    }
    if (typeof f.maxEps === 'number' && f.maxEps > 0) {
      arr = arr.map(x => Object.assign({}, x, { eps: Math.min(x.eps, f.maxEps) }));
    }
    final = arr;
  } catch (e) { console.error('Filter gagal dimuat:', e.message); }
}

function countBy(fn, labelFn) {
  const m = new Map();
  final.forEach(function (d) {
    fn(d).forEach(function (k) {
      const key = String(k);
      m.set(key, (m.get(key) || 0) + 1);
    });
  });
  return Array.from(m.entries()).map(function (e) {
    return { key: e[0], label: labelFn ? labelFn(e[0]) : humanize(e[0]), count: e[1] };
  }).sort(function (a, b) { return b.count - a.count; });
}

const taxonomy = {
  updated: new Date().toISOString(),
  totals: {
    movies: final.length,
    episodes: final.reduce(function (s, d) { return s + d.eps; }, 0),
    dubbing: final.filter(function (d) { return d.dubbing; }).length,
    subtitle: final.filter(function (d) { return !d.dubbing; }).length
  },
  categories: countBy(function (d) { return d.cats; }),
  genres: countBy(function (d) { return d.genres; }, function (k) { return GENRE_LABEL[k] || humanize(k); }),
  tags: countBy(function (d) { return d.tags; }),
  providers: countBy(function (d) { return [d.provider]; })
};

fs.writeFileSync(OUT_LIST,
  '// Hasil otomatis saka tools/build-catalog.js (total: ' + final.length + ' judul)\n' +
  "window.DRAMAS =\n" + JSON.stringify(final, null, 1) + ';\n');

fs.writeFileSync(OUT_TAGS,
  '// Taxonomi otomatis saka tools/build-catalog.js\n' +
  "window.TAXONOMY =\n" + JSON.stringify(taxonomy, null, 1) + ';\n');

console.log('OK  total=' + final.length + ' judul, totalEpisode=' + taxonomy.totals.episodes);
