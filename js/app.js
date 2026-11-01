(function () {
  'use strict';

  /* ================= HORE-HORE DRACIN v2 — SPA ================= */

  var DRAMAS = window.DRAMAS || [];
  var TAX = window.TAXONOMY || { totals: { movies: 0, episodes: 0 }, categories: [], genres: [], tags: [], providers: [] };
  var AD = window.AD_CONFIG || { mode: 'demo' };

  var APP = document.getElementById('app');
  var HISTORY_KEY = 'hh2:history';
  var PROFILE_KEY = 'hh2:profile';
  var PER_PAGE = 24;
  var heroTimer = null;

  /* ---------- util ---------- */
  function $(id) { return document.getElementById(id); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function excerpt(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (!s) return 'Sinopsis belum tersedia.';
    if (s.length <= n) return s;
    var cut = s.slice(0, n).replace(/\s+\S*$/, '');
    return cut + '…';
  }
  function fmtEps(n) { return n ? n + ' Episode' : ''; }
  function debounce(fn, ms) {
    var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); };
  }
  function findMovie(slug) {
    for (var i = 0; i < DRAMAS.length; i++) if (DRAMAS[i].slug === slug) return DRAMAS[i];
    return null;
  }
  function encodeSlug(s) { return encodeURIComponent(s); }

  /* ---------- data helpers ---------- */
  function tagChipsHTML(d, max) {
    var t = d.tags || [];
    if (max) t = t.slice(0, max);
    return t.map(function (x) { return '<span class="tag-chip">#' + esc(x) + '</span>'; }).join('');
  }
  function listByCat(cat) { return DRAMAS.filter(function (d) { return (d.cats || []).indexOf(cat) !== -1; }); }
  function byTag(tag) { return DRAMAS.filter(function (d) { return (d.tags || []).indexOf(tag) !== -1; }); }
  function popularList(n) {
    var arr = DRAMAS.slice().sort(function (a, b) { return (b.eps || 0) - (a.eps || 0); });
    return arr.slice(0, n || 12);
  }
  function newestList(n) { return DRAMAS.slice(0, n || 12); }
  function recommendedList(n) {
    var arr = DRAMAS.slice();
    var seed = 7;
    arr.sort(function () { seed = (seed * 16807 + 19) % 2147483647; return (seed % 3) - 1; });
    return arr.slice(0, n || 12);
  }
  function relatedList(d, n) {
    var scored = DRAMAS.filter(function (x) { return x.slug !== d.slug; }).map(function (x) {
      var s = 0;
      (x.cats || []).forEach(function (c) { if ((d.cats || []).indexOf(c) !== -1) s += 2; });
      (x.tags || []).forEach(function (t) { if ((d.tags || []).indexOf(t) !== -1) s += 1; });
      return { d: x, s: s };
    }).filter(function (o) { return o.s > 0; }).sort(function (a, b) { return b.s - a.s; });
    return scored.slice(0, n || 10).map(function (o) { return o.d; });
  }

  /* ---------- profile & history (localStorage) ---------- */
  function getProfile() { try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null') || null; } catch (e) { return null; } }
  function setProfile(p) { if (p) localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); else localStorage.removeItem(PROFILE_KEY); }
  function adEnabled() { var p = getProfile(); return !p || !p.noAds; }
  function loadHistory() { try { var a = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function saveHistory(list) { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch (e) {} }
  function pushHistory(rec) {
    var list = loadHistory().filter(function (h) { return !(h.slug === rec.slug && h.ep === rec.ep); });
    list.unshift(rec);
    if (list.length > 40) list = list.slice(0, 40);
    saveHistory(list);
  }
  function resumeFor(slug) {
    var list = loadHistory();
    for (var i = 0; i < list.length; i++) if (list[i].slug === slug) return list[i];
    return null;
  }
  function continueItems() { return loadHistory(); }

  /* ---------- iklan (ads) ---------- */
  function demoCreativeHTML(kind) {
    return '<div class="ad-creative demo">'
      + '<span class="ad-label">' + (kind === 'preroll' ? 'IKLAN PRE-ROLL' : 'IKLAN BANNER') + '</span>'
      + '<div class="demo-ad-icon">📢</div>'
      + '<div class="demo-ad-title">Ruang Iklan — ' + esc(AD.brand || 'Hore-Hore Dracin') + '</div>'
      + '<div class="demo-ad-sub">Ganti isi iklan di <b>data/ads.js</b> (mode <code>demo</code> → <code>adsense</code>/<code>custom</code>).</div>'
      + '</div>';
  }
  function adSlotHTML(cfg, kind) {
    if (!cfg) return '';
    if ((AD.mode || 'demo') !== 'demo' && cfg.html) return cfg.html;
    return demoCreativeHTML(kind);
  }
  function bannerAdHTML(pos) {
    var b = AD.banner || {};
    if (!b.enabled || (b.position || 'below-hero') !== pos) return '';
    return '<div class="banner-ad-wrap">' + adSlotHTML(b, 'banner') + '</div>';
  }

  /* ---------- modal & toast ---------- */
  function openModal(html) {
    var m = $('modalMount');
    m.innerHTML = '<div class="modal-overlay"><div class="modal">'
      + '<button type="button" class="modal-close" id="mClose" aria-label="Tutup">✕</button>'
      + html + '</div></div>';
    $('mClose').addEventListener('click', closeModal);
    m.querySelector('.modal-overlay').addEventListener('click', function (e) {
      if (e.target.classList.contains('modal-overlay')) closeModal();
    });
  }
  function closeModal() { $('modalMount').innerHTML = ''; }
  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 2600);
  }

  /* ---------- login (opsional, lokal) ---------- */
  function openLogin() {
    var p = getProfile();
    openModal(
      '<h3>' + (p ? 'Profil' : 'Masuk / Daftar') + '</h3>'
      + '<p class="muted" style="line-height:1.6">Nonton gratis tanpa langganan. Login bersifat opsional — hanya untuk menyembunyikan iklan di perangkat ini.</p>'
      + '<input class="field" id="lgName" maxlength="24" placeholder="Nama kamu…" value="' + esc(p ? p.name : '') + '">'
      + '<label class="check"><input type="checkbox" id="lgNoAds" ' + (p && p.noAds ? 'checked' : '') + '> Mode tanpa iklan (lokal)</label>'
      + '<div style="display:flex;gap:10px;margin-top:14px">'
      + '<button class="btn btn-primary" id="lgSave">Simpan</button>'
      + (p ? '<button class="btn btn-ghost" id="lgOut">Keluar</button>' : '')
      + '</div>'
    );
    $('lgSave').addEventListener('click', function () {
      var name = ($('lgName').value || '').trim();
      var noAds = $('lgNoAds').checked;
      setProfile(name ? { name: name, noAds: noAds, at: Date.now() } : null);
      closeModal();
      toast(name ? 'Halo, ' + name + '!' : 'Mode tamu aktif (iklan kembali tampil).');
      renderShell();
      route();
    });
    if (p) $('lgOut').addEventListener('click', function () { setProfile(null); closeModal(); renderShell(); route(); });
  }

  /* ---------- shell (nav & footer) ---------- */
  function navbarHTML() {
    var p = getProfile();
    var searchBox = '<div class="nav-search"><span class="ic">🔍</span>'
      + '<input id="navQ" type="search" placeholder="Cari drama…" aria-label="Cari"></div>';
    var auth = '<div class="nav-auth">'
      + (p
        ? '<button class="btn btn-ghost btn-sm" id="navUser">👤 ' + esc(p.name) + '</button>'
        : '<button class="btn btn-ghost btn-sm" id="navLogin">Masuk</button>')
      + '</div>';
    return '<nav class="nav"><div class="nav-inner">'
      + '<a class="nav-brand" href="#/"><img src="img/logo.png" alt="Logo"><span class="nm"><b>Hore-Hore</b> Dracin</span></a>'
      + '<div class="nav-links">'
      + '<a class="nav-link" href="#/" data-nav="home">Beranda</a>'
      + '<a class="nav-link" href="#/browse" data-nav="browse">Jelajah</a>'
      + '<a class="nav-link" href="#/history" data-nav="history">Riwayat</a>'
      + '</div>' + searchBox + auth + '</div></nav>';
  }
  function footerHTML() {
    var tot = TAX.totals || {};
    var tags = (TAX.tags || []).slice(0, 14).map(function (t) {
      return '<a class="tag-chip" href="#/browse?tag=' + encodeURIComponent(t.key) + '">#' + esc(t.label) + '</a>';
    }).join('');
    return '<footer class="site-footer"><div class="footer-inner">'
      + '<div class="footer-col"><h4>Hore-Hore Dracin</h4>'
      + '<p class="muted" style="line-height:1.7">Portal nonton drama pendek gratis — tanpa langganan, tanpa kunci. Penonton cukup membantu dengan menonton iklan singkat sebelum episode diputar.</p>'
      + '<div class="stats-row">'
      + '<div class="stat"><b>' + (tot.movies || 0) + '</b><span>Judul</span></div>'
      + '<div class="stat"><b>' + (tot.episodes || 0) + '</b><span>Episode</span></div>'
      + '<div class="stat"><b>' + (tot.subtitle || 0) + '</b><span>Sub Indo</span></div>'
      + '</div></div>'
      + '<div class="footer-col"><h4>Tautan</h4><div class="footer-links">'
      + '<a href="#/">Beranda</a>'
      + '<a href="#/browse">Jelajah Semua</a>'
      + '<a href="#/history">Riwayat Nonton</a>'
      + '<a href="#/browse?cat=' + encodeURIComponent('Romantis') + '">Drama Romantis</a>'
      + '<a href="#/browse?cat=' + encodeURIComponent('Dendam') + '">Drama Dendam</a>'
      + '</div></div>'
      + '<div class="footer-col"><h4>Tag Populer</h4><div class="tagcloud">' + tags + '</div></div>'
      + '</div>'
      + '<div class="footer-base">© 2026 Hore-Hore Dracin — Gratis, nonton iklan. Data sumber: Dracinema. · <a href="#/">Sitemap</a></div>'
      + '</footer>';
  }
  function renderShell() {
    $('navMount').innerHTML = navbarHTML();
    $('footerMount').innerHTML = footerHTML();
    var navQ = $('navQ');
    if (navQ) navQ.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var q = navQ.value.trim();
        location.hash = '#/browse' + (q ? '?q=' + encodeURIComponent(q) : '');
      }
    });
    $$('.nav-link').forEach(function (a) { a.addEventListener('click', updateNavActive); });
    var lg = $('navLogin'); if (lg) lg.addEventListener('click', openLogin);
    var ur = $('navUser'); if (ur) ur.addEventListener('click', openLogin);
    updateNavActive();
  }
  function updateNavActive() {
    var h = location.hash || '';
    var isHome = h === '' || h === '#' || h === '#/';
    var isBrowse = h.indexOf('#/browse') === 0;
    var isHistory = h.indexOf('#/history') === 0;
    $$('.nav-link').forEach(function (a) {
      var key = a.getAttribute('data-nav');
      var active = (key === 'home' && isHome)
        || (key === 'browse' && isBrowse)
        || (key === 'history' && isHistory);
      a.classList.toggle('active', !!active);
    });
  }

  /* ---------- komponen kartu & baris ---------- */
  function cardHTML(d) {
    var epsBadge = d.eps ? '<span class="ep-badge">▶ ' + d.eps + ' Ep</span>' : '';
    var dub = d.dubbing ? '<span class="dub-badge">DUB</span>' : '';
    return '<article class="card">'
      + '<a href="#/movie/' + encodeSlug(d.slug) + '" aria-label="' + esc(d.title) + '">'
      + '<div class="poster"><img loading="lazy" src="' + esc(d.poster) + '" alt="' + esc(d.title) + '">'
      + '<span class="play-overlay"><span class="play-ico">▶</span></span>'
      + epsBadge + dub + '</div>'
      + '<div class="card-body"><h3 class="card-title">' + esc(d.title) + '</h3>'
      + '<div class="card-tags">' + tagChipsHTML(d, 2) + '</div></div>'
      + '</a></article>';
  }
  function rowHTML(title, items, link) {
    if (!items.length) return '';
    return '<section class="section wrap"><div class="section-head">'
      + '<span class="sec-accent"></span>'
      + '<h2 class="section-title">' + esc(title) + '</h2>'
      + (link ? '<a class="section-link" href="' + link + '">Lihat semua →</a>' : '')
      + '</div><div class="row"><div class="row-viewport">'
      + items.map(cardHTML).join('')
      + '</div></div></section>';
  }
  function fmtTime(s) {
    s = Math.floor(s || 0);
    var m = Math.floor(s / 60), ss = s % 60;
    return m + ':' + (ss < 10 ? '0' : '') + ss;
  }
  function continueCardHTML(h) {
    var d = findMovie(h.slug);
    if (!d) return '';
    var pct = h.dur > 0 ? Math.min(100, Math.round((h.pos / h.dur) * 100)) : 0;
    return '<div class="continue-item">'
      + '<img class="continue-poster" src="' + esc(d.poster) + '" alt="">'
      + '<div class="continue-meta"><div class="continue-title">' + esc(d.title) + '</div>'
      + '<div class="muted" style="font-size:.8rem;margin-top:2px">Episode ' + h.ep + (h.pos > 30 ? ' · ' + fmtTime(h.pos) : '') + '</div>'
      + '<div class="progress"><i style="width:' + pct + '%"></i></div></div>'
      + '<a class="btn btn-primary btn-sm continue-cta" href="#/play/' + encodeSlug(d.slug) + '/' + h.ep + '">Lanjut ▶</a>'
      + '</div>';
  }
  function statsStripHTML() {
    var tot = TAX.totals || {};
    return '<div class="wrap"><div class="stats-row">'
      + '<div class="stat"><b>' + (tot.movies || 0) + '</b><span>Total Judul</span></div>'
      + '<div class="stat"><b>' + (tot.episodes || 0) + '</b><span>Total Episode</span></div>'
      + '<div class="stat"><b>' + (tot.subtitle || 0) + '</b><span>Subtitle Indonesia</span></div>'
      + '<div class="stat"><b>' + (tot.dubbing || 0) + '</b><span>Dubbing</span></div>'
      + '</div></div>';
  }
  function quickCatsHTML() {
    var chips = (TAX.categories || []).map(function (c) {
      return '<a class="chip" href="#/browse?cat=' + encodeURIComponent(c.key) + '">' + esc(c.label) + ' <span class="n">(' + c.count + ')</span></a>';
    }).join('');
    return '<div class="wrap quickcats"><div class="chips">' + chips + '</div></div>';
  }

  /* ---------- Hero ---------- */
  function heroItems() {
    var pool = DRAMAS.filter(function (d) { return d.poster && d.eps > 0; });
    var sorted = pool.slice().sort(function (a, b) { return (b.eps || 0) - (a.eps || 0); });
    var picked = [], seenCats = {}, i, k;
    for (i = 0; i < sorted.length && picked.length < 6; i++) {
      var d = sorted[i], ok = false;
      for (k = 0; k < d.cats.length; k++) if (!seenCats[d.cats[k]]) { ok = true; break; }
      if (ok) { picked.push(d); d.cats.forEach(function (c) { seenCats[c] = 1; }); }
    }
    for (i = 0; i < sorted.length && picked.length < 6; i++) {
      if (picked.indexOf(sorted[i]) === -1) picked.push(sorted[i]);
    }
    if (!picked.length) picked = DRAMAS.slice(0, 4);
    return picked;
  }
  function heroHTML(picked) {
    var slides = picked.map(function (d, i) {
      return '<div class="hero-slide' + (i === 0 ? ' active' : '') + '" style="background-image:url(\'' + esc(d.poster) + '\')">'
        + '<div class="hero-shade"></div><div class="hero-shade-b"></div>'
        + '<div class="hero-content">'
        + '<span class="hero-kicker">✦ Rekomendasi</span>'
        + '<h2 class="hero-title">' + esc(d.title) + '</h2>'
        + '<div class="hero-meta">'
        + '<span class="badge brand">' + esc(d.provider) + '</span>'
        + (d.dubbing ? '<span class="badge gold">🎙️ Dubbing</span>' : '<span class="badge">🔇 Subtitle Indonesia</span>')
        + '<span class="badge">▶ ' + d.eps + ' Episode</span>'
        + '</div><div class="hero-actions">'
        + '<a class="btn btn-primary btn-lg" href="#/play/' + encodeSlug(d.slug) + '/1">▶ Nonton</a>'
        + '<a class="btn btn-ghost btn-lg" href="#/movie/' + encodeSlug(d.slug) + '">Detail</a>'
        + '</div></div></div>';
    }).join('');
    var dots = picked.map(function (_, i) {
      return '<button type="button" class="hero-dot' + (i === 0 ? ' active' : '') + '" data-i="' + i + '" aria-label="Slide ' + (i + 1) + '"></button>';
    }).join('');
    return '<div class="wrap"><div class="hero" id="hero">'
      + slides
      + '<button type="button" class="hero-arrow prev" aria-label="Sebelumnya">‹</button>'
      + '<button type="button" class="hero-arrow next" aria-label="Berikutnya">›</button>'
      + '<div class="hero-dots">' + dots + '</div>'
      + '</div></div>';
  }
  function initHero() {
    var heroEl = $('hero'); if (!heroEl) return;
    var slides = $$('.hero-slide', heroEl);
    var dots = $$('.hero-dot', heroEl);
    var idx = 0, timer = null;
    function show(i) {
      idx = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.classList.toggle('active', k === idx); });
      dots.forEach(function (d, k) { d.classList.toggle('active', k === idx); });
    }
    function restart() { clearInterval(timer); timer = setInterval(function () { show(idx + 1); }, 6000); }
    heroEl.querySelector('.next').addEventListener('click', function () { show(idx + 1); restart(); });
    heroEl.querySelector('.prev').addEventListener('click', function () { show(idx - 1); restart(); });
    dots.forEach(function (d) { d.addEventListener('click', function () { show(parseInt(d.dataset.i, 10)); restart(); }); });
    restart();
  }

  /* ---------- Home ---------- */
  function renderHome() {
    var vis = '<div id="homeView">';
    vis += heroHTML(heroItems());
    vis += bannerAdHTML('below-hero');
    var cont = continueItems().filter(function (h) { return findMovie(h.slug); });
    if (cont.length) {
      vis += '<section class="section wrap"><div class="section-head"><span class="sec-accent"></span><h2 class="section-title">⏩ Lanjutkan Nonton</h2><a class="section-link" href="#/history">Semua →</a></div><div class="row"><div class="row-viewport">'
        + cont.map(continueCardHTML).join('')
        + '</div></div></section>';
    }
    vis += quickCatsHTML();
    vis += rowHTML('🔥 Lagi Populer', popularList(12), '#/browse?sort=popular');
    vis += rowHTML('🆕 Terbaru', newestList(12), '#/browse?sort=newest');
    vis += rowHTML('🎬 Rekomendasi', recommendedList(12), '#/browse?sort=recommended');
    (TAX.categories || []).forEach(function (c) {
      if (c.count >= 8 && c.key !== 'Lainnya') {
        vis += rowHTML(c.label, listByCat(c.key).slice(0, 12), '#/browse?cat=' + encodeURIComponent(c.key));
      }
    });
    vis += statsStripHTML();
    vis += '</div>';
    APP.innerHTML = vis;
    initHero();
  }

  /* ---------- Jelajah (Browse) ---------- */
  function qParams() {
    var qs = (location.hash.split('?')[1] || '');
    var p = {};
    try { new URLSearchParams(qs).forEach(function (v, k) { p[k] = v; }); } catch (e) {}
    return p;
  }
  function browseUrl(over) {
    var p = qParams();
    Object.keys(over).forEach(function (k) {
      if (over[k]) p[k] = over[k]; else delete p[k];
    });
    var parts = [];
    ['q', 'cat', 'tag', 'format', 'provider', 'sort', 'page'].forEach(function (k) {
      if (p[k]) parts.push(k + '=' + encodeURIComponent(p[k]));
    });
    return '#/browse' + (parts.length ? '?' + parts.join('&') : '');
  }
  function filterList(q, cat, tag, format, provider) {
    return DRAMAS.filter(function (d) {
      if (q) {
        var t = (d.title + ' ' + d.tags.join(' ') + ' ' + d.cats.join(' ')).toLowerCase();
        if (t.indexOf(q) === -1) return false;
      }
      if (cat && (d.cats || []).indexOf(cat) === -1) return false;
      if (tag && (d.tags || []).indexOf(tag) === -1) return false;
      if (format === 'dub' && !d.dubbing) return false;
      if (format === 'sub' && d.dubbing) return false;
      if (provider && d.provider !== provider) return false;
      return true;
    });
  }
  function sortList(list, sort) {
    var arr = list.slice();
    if (sort === 'az') arr.sort(function (a, b) { return a.title.localeCompare(b.title, 'id'); });
    else if (sort === 'za') arr.sort(function (a, b) { return b.title.localeCompare(a.title, 'id'); });
    else if (sort === 'eps') arr.sort(function (a, b) { return (b.eps || 0) - (a.eps || 0); });
    else if (sort === 'newest') arr.sort(function (a, b) { return a.id.localeCompare(b.id); });
    return arr;
  }
  function chipActive(curr, val) { return curr === val ? ' active' : ''; }
  function catChips(cat) {
    var h = '<button type="button" class="chip' + chipActive(cat, '') + '" data-cat="">Semua <span class="n">(' + DRAMAS.length + ')</span></button>';
    (TAX.categories || []).forEach(function (c) {
      h += '<button type="button" class="chip' + chipActive(cat, c.key) + '" data-cat="' + esc(c.key) + '">' + esc(c.label) + ' <span class="n">(' + c.count + ')</span></button>';
    });
    return h;
  }
  function tagChips(tag) {
    var h = '<button type="button" class="chip' + chipActive(tag, '') + '" data-tag="">Semua</button>';
    (TAX.genres || []).slice(0, 20).forEach(function (g) {
      h += '<button type="button" class="chip' + chipActive(tag, g.key) + '" data-tag="' + esc(g.key) + '">#' + esc(g.label) + ' <span class="n">(' + g.count + ')</span></button>';
    });
    return h;
  }
  function formatChips(format) {
    var opts = [['all', 'Semua Format'], ['sub', 'Subtitle Indonesia'], ['dub', 'Dubbing']];
    return opts.map(function (o) {
      return '<button type="button" class="chip' + chipActive(format, o[0]) + '" data-fmt="' + o[0] + '">' + o[1] + '</button>';
    }).join('');
  }
  function providerOptions(provider) {
    var h = '<option value="">Semua Provider</option>';
    (TAX.providers || []).forEach(function (pv) {
      h += '<option value="' + esc(pv.key) + '"' + (provider === pv.key ? ' selected' : '') + '>' + esc(pv.label) + ' (' + pv.count + ')</option>';
    });
    return h;
  }
  function sortOptions(sort) {
    var m = { popular: 'Populer', newest: 'Terbaru', eps: 'Episode Terbanyak', az: 'A–Z', za: 'Z–A' };
    return Object.keys(m).map(function (k) {
      return '<option value="' + k + '"' + (sort === k ? ' selected' : '') + '>' + m[k] + '</option>';
    }).join('');
  }

  function paginationHTML(page, pages, cur) {
    if (pages <= 1) return '';
    return '<div class="pagination">'
      + '<button type="button" class="pagebtn"' + (page <= 1 ? ' disabled' : '') + ' data-page="' + (page - 1) + '">‹ Sebelumnya</button>'
      + '<span class="muted">Halaman ' + page + ' / ' + pages + '</span>'
      + '<button type="button" class="pagebtn"' + (page >= pages ? ' disabled' : '') + ' data-page="' + (page + 1) + '">Berikutnya ›</button>'
      + '</div>';
  }
  function renderBrowse() {
    var p = qParams();
    var q = (p.q || '').toLowerCase();
    var cat = p.cat || '', tag = p.tag || '', format = p.format || '', provider = p.provider || '';
    var sort = p.sort || 'popular';
    var page = Math.max(1, parseInt(p.page, 10) || 1);
    var list = sortList(filterList(q, cat, tag, format, provider), sort);
    var pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    page = Math.min(page, pages);
    var slice = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    var h = '<div class="wrap">';
    h += '<h1 class="page-title">Jelajah</h1>';
    h += '<div class="filterbar">';
    h += '<div class="filter-row"><input class="search-field" id="bfQ" placeholder="Cari judul / genre…" value="' + esc(p.q || '') + '">';
    h += '<select class="sel sortsel" id="bfSort">' + sortOptions(sort) + '</select></div>';
    h += '<div class="filter-row"><span class="flabel">Kategori:</span><div class="chips" id="bfCats">' + catChips(cat) + '</div></div>';
    h += '<div class="filter-row"><span class="flabel">Genre:</span><div class="chips" id="bfTags">' + tagChips(tag) + '</div></div>';
    h += '<div class="filter-row"><span class="flabel">Format:</span><div class="chips" id="bfFmt">' + formatChips(format) + '</div></div>';
    h += '<div class="filter-row"><span class="flabel">Provider:</span><select class="sel" id="bfProv">' + providerOptions(provider) + '</select></div>';
    h += '</div>';
    h += '<div class="result-info">' + list.length + ' judul ditemukan</div>';
    h += '<div class="grid">' + slice.map(cardHTML).join('') + '</div>';
    h += paginationHTML(page, pages, { q: q, cat: cat, tag: tag, format: format, provider: provider, sort: sort });
    h += '</div>';
    APP.innerHTML = h;
    bindBrowse(q, cat, tag, format, provider, sort, page);
  }
  function bindBrowse(q, cat, tag, format, provider, sort, page) {
    var qEl = $('bfQ');
    if (qEl) qEl.addEventListener('input', debounce(function () {
      location.hash = browseUrl({ q: qEl.value.trim(), page: '' });
    }, 350));
    var sEl = $('bfSort');
    if (sEl) sEl.addEventListener('change', function () { location.hash = browseUrl({ sort: sEl.value, page: '' }); });
    var pEl = $('bfProv');
    if (pEl) pEl.addEventListener('change', function () { location.hash = browseUrl({ provider: pEl.value, page: '' }); });
    $$('#bfCats .chip').forEach(function (c) {
      c.addEventListener('click', function () { location.hash = browseUrl({ cat: c.dataset.cat, page: '' }); });
    });
    $$('#bfTags .chip').forEach(function (c) {
      c.addEventListener('click', function () { location.hash = browseUrl({ tag: c.dataset.tag, page: '' }); });
    });
    $$('#bfFmt .chip').forEach(function (c) {
      c.addEventListener('click', function () { location.hash = browseUrl({ format: c.dataset.fmt, page: '' }); });
    });
    $$('.pagebtn').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.disabled) return;
        location.hash = browseUrl({ page: b.dataset.page });
      });
    });
  }

  /* ---------- Detail ---------- */
  function renderDetail(slug) {
    var d = findMovie(slug);
    if (!d) { APP.innerHTML = '<div class="empty">Judul ora ketemu.</div>'; return; }
    var res = resumeFor(slug);
    var h = '<div class="wrap">';
    h += '<div class="crumb"><a href="#/">Beranda</a><span>›</span><span>' + esc(d.title) + '</span></div>';
    h += '<div class="detail-hero" style="background-image:url(\'' + esc(d.poster) + '\')">';
    h += '<div class="shade"></div><div class="detail-inner">';
    h += '<img class="detail-poster" src="' + esc(d.poster) + '" alt="' + esc(d.title) + '">';
    h += '<div class="detail-info">';
    h += '<h1 class="detail-title">' + esc(d.title) + '</h1>';
    h += '<div class="detail-meta">';
    h += '<span class="badge brand">' + esc(d.provider) + '</span>';
    h += (d.dubbing ? '<span class="badge gold">🎙️ Dubbing</span>' : '<span class="badge">🔇 Subtitle Indonesia</span>');
    h += '<span class="badge gold">🎁 Gratis · ' + d.eps + ' Episode</span>';
    h += '</div>';
    h += '<p class="detail-desc">' + esc(excerpt(d.synopsis, 260)) + '</p>';
    h += '<div class="detail-tags">' + tagChipsHTML(d) + '</div>';
    h += '<div class="detail-actions">';
    var startEp = res ? res.ep : 1;
    h += '<a class="btn btn-primary btn-lg" href="#/play/' + encodeSlug(d.slug) + '/' + startEp + '">'
      + (res ? '⏩ Lanjutkan ke Episode ' + res.ep : '▶ Nonton Sekarang') + '</a>';
    if (res) h += '<a class="btn btn-ghost btn-lg" href="#/play/' + encodeSlug(d.slug) + '/1">Mulai dari Awal</a>';
    h += '</div>';
    h += '<p class="muted" style="font-size:.82rem;margin-top:10px">Gratis — tanpa langganan. Nonton iklan kanggo nglanjutake episode.</p>';
    h += '</div></div></div>';
    h += '<section class="section wrap"><div class="card detail-card"><h2 class="section-title">Sinopsis</h2><p class="detail-full">' + esc(d.synopsis) + '</p></div></section>';
    h += '<section class="section wrap"><div class="section-head"><span class="sec-accent"></span><h2 class="section-title">Semua Episode</h2></div>';
    h += '<div class="eps-grid">';
    for (var e = 1; e <= d.eps; e++) {
      h += '<a class="eps-btn' + (e === startEp ? ' active' : '') + '" href="#/play/' + encodeSlug(d.slug) + '/' + e + '">' + e + '</a>';
    }
    h += '</div></section>';
    var rel = relatedList(d, 10);
    if (rel.length) h += rowHTML('Mirip dengan Ini', rel, null);
    h += '</div>';
    APP.innerHTML = h;
  }

  /* ---------- Player: util & HLS/melolo ---------- */
  function proxyUrl(u) { return '/proxy/media?url=' + encodeURIComponent(u); }
  function rewritePlaylist(text, base) {
    return text.split('\n').map(function (line) {
      var t = line.trim();
      if (!t || t.charAt(0) === '#') {
        return line.replace(/URI="([^"]+)"/g, function (m, u) {
          try { return 'URI="' + proxyUrl(new URL(u, base).href) + '"'; } catch (e) { return m; }
        });
      }
      try { return proxyUrl(new URL(t, base).href); } catch (e) { return line; }
    }).join('\n');
  }
  function toSeconds(s) {
    var m = s.match(/(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?/);
    if (!m) return 0;
    var h = m[1] ? parseInt(m[1], 10) : 0;
    var mm = parseInt(m[2], 10);
    var ss = parseInt(m[3], 10);
    var ms = m[4] ? parseInt(m[4].padEnd(3, '0'), 10) : 0;
    return h * 3600 + mm * 60 + ss + ms / 1000;
  }
  function parseVtt(t) {
    var cues = [];
    if (!t || !String(t).trim()) return cues;
    var lines = String(t).split(/\r?\n/);
    var cur = null;
    function flush() {
      if (cur && cur.text.length) {
        cur.text = cur.text.join('\n').trim();
        cues.push(cur);
      }
      cur = null;
    }
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].trim();
      if (ln.indexOf('-->') !== -1) {
        flush();
        var parts = ln.split('-->');
        cur = { start: toSeconds(parts[0]), end: toSeconds(parts[1]), text: [] };
      } else if (ln === '') {
        flush();
      } else if (cur && !/^WEBVTT/i.test(ln) && !/^Kind:|^Language:/i.test(ln)) {
        cur.text.push(ln);
      }
    }
    flush();
    return cues;
  }
  function attachSubtitles(video, vtt) {
    var el = $('pvSub');
    if (el) { el.classList.add('hidden'); el.textContent = ''; }
    var old = video.querySelector('track'); if (old) old.remove();
    var cues = parseVtt(vtt);
    if (!cues.length) return;
    var last = -1;
    function tick() {
      var t = video.currentTime, idx = -1;
      for (var i = 0; i < cues.length; i++) {
        if (t >= cues[i].start && t <= cues[i].end) { idx = i; break; }
      }
      if (idx !== last) {
        last = idx;
        if (idx >= 0 && el) { el.textContent = cues[idx].text; el.classList.remove('hidden'); }
        else if (el) { el.classList.add('hidden'); el.textContent = ''; }
      }
    }
    video.addEventListener('timeupdate', tick);
  }
  function setupVideo(video, url) {
    var isHls = /\.m3u8([?#]|$)/i.test(url);
    if (isHls) {
      if (window.Hls) {
        if (video._hls) { try { video._hls.destroy(); } catch (e) {} }
        video.pause(); video.removeAttribute('src'); video.load();
        var hls = new Hls({ enableWorker: true, lowLatencyMode: false });
        hls.on(Hls.Events.ERROR, function (evt, data) {
          if (data && data.fatal) {
            if (data.type === 'networkError') { hls.startLoad(); }
            else if (data.type === 'mediaError') { hls.recoverMediaError(); }
            else { setPlayerMsg('HLS gagal dimuat (' + (data.details || data.type || '') + '). Coba ganti kualitas.'); }
          }
        });
        fetch(proxyUrl(url)).then(function (r) {
          if (!r.ok) throw new Error('Playlist ' + r.status);
          return r.text();
        }).then(function (text) {
          var base = new URL(url);
          var rewritten = rewritePlaylist(text, base);
          var blob = new Blob([rewritten], { type: 'application/vnd.apple.mpegurl' });
          video._hls = hls;
          hls.loadSource(URL.createObjectURL(blob));
          hls.attachMedia(video);
          video.play().catch(function () {});
        }).catch(function (e) {
          setPlayerMsg('Gagal ngemot playlist video (' + (e && e.message ? e.message : e) + ').');
        });
      } else if (video.canPlayType && video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = proxyUrl(url); video.play().catch(function () {});
      } else {
        setPlayerMsg('Browser ora ndukung HLS.');
      }
    } else {
      if (video._hls) { try { video._hls.destroy(); } catch (e) {} video._hls = null; }
      video.src = proxyUrl(url);
      video.play().catch(function () {});
    }
  }
  function cleanupVideo(video) {
    if (video._hls) { try { video._hls.destroy(); } catch (e) {} video._hls = null; }
    video.pause();
    try { video.removeAttribute('src'); } catch (e) {}
    try { video.load(); } catch (e) {}
  }
  function setLoader(msg) { var el = $('pvLoader'); if (el) { el.classList.remove('hidden'); el.innerHTML = '<span class="spinner"></span><span>' + esc(msg) + '</span>'; } }
  function hideLoader() { var el = $('pvLoader'); if (el) el.classList.add('hidden'); }
  function setPlayerMsg(msg) {
    var el = $('pvMsg');
    if (el) {
      if (msg) { el.textContent = msg; el.classList.remove('hidden'); }
      else { el.textContent = ''; el.classList.add('hidden'); }
    }
  }
  function watchPlay(v) {
    var armed = false, t = null;
    function arm() {
      if (armed) return; armed = true;
      t = setTimeout(function () {
        if (v.readyState < 2 && !v.error) setPlayerMsg('Video buffering suwe (ora ana data). Coba ganti kualitas utawa muat ulang.');
      }, 12000);
    }
    function disarm() { armed = false; if (t) { clearTimeout(t); t = null; } }
    v.addEventListener('playing', disarm);
    v.addEventListener('canplay', disarm);
    v.addEventListener('error', disarm);
    arm();
  }
  function ensureMeloloDecrypt(cb) { cb(!!(window.MeloloDecrypt && window.MeloloDecrypt.decrypt)); }

  /* ---------- token playback (b64url->json) ---------- */
  function b64urlToJson(s) {
    try {
      var b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) { return null; }
  }

  /* ---------- Auto-next ---------- */
  function showAutoNext(ctx, sec, frac) {
    var box = $('pvAuto'); if (!box) return;
    box.classList.remove('hidden');
    var nm = $('pvAutoName'), cnt = $('pvAutoCount'), bar = $('pvAutoBar');
    if (nm) nm.textContent = 'Episode ' + (ctx.ep + 1);
    if (cnt) cnt.textContent = sec + ' dtk';
    if (bar) bar.style.width = Math.round(frac * 100) + '%';
  }
  function hideAutoNext() { var box = $('pvAuto'); if (box) box.classList.add('hidden'); }
  function cancelAutoNext(video) { if (video && video._autoCtx) video._autoCtx.enabled = false; hideAutoNext(); }
  function advanceAutoNext(ctx) {
    if (!ctx || !ctx.enabled || ctx.fired) return;
    ctx.fired = true;
    if (ctx.ep >= ctx.eps) { hideAutoNext(); return; }
    location.hash = '#/play/' + encodeSlug(ctx.slug) + '/' + (ctx.ep + 1);
  }
  function armAutoNext(video, slug, ep, eps) {
    video._autoCtx = { slug: slug, ep: ep, eps: eps || 0, enabled: true, fired: false, shownSec: -1 };
    if (video._autoBound) return;
    video._autoBound = true;
    video.addEventListener('timeupdate', function () {
      var ctx = video._autoCtx; if (!ctx || !ctx.enabled || ctx.fired) return;
      var d = video.duration, t = video.currentTime;
      if (!isFinite(d) || d <= 0) return;
      var remain = d - t;
      if (remain > 12) { hideAutoNext(); ctx.shownSec = -1; return; }
      if (remain <= 12 && remain > 0) {
        var sec = Math.ceil(remain);
        if (sec !== ctx.shownSec) { ctx.shownSec = sec; showAutoNext(ctx, sec, remain / 12); }
      }
      if (remain <= 0.4) advanceAutoNext(ctx);
    });
    video.addEventListener('ended', function () { advanceAutoNext(video._autoCtx); });
  }

  /* ---------- simpan riwayat nonton ---------- */
  function trackHistory(v, slug, ep) {
    var lastSave = 0;
    v.addEventListener('timeupdate', function () {
      var now = Date.now();
      if (now - lastSave < 5000) return;
      lastSave = now;
      var pos = v.currentTime, dur = v.duration;
      if (!isFinite(pos) || !isFinite(dur) || dur <= 0) return;
      pushHistory({ slug: slug, ep: ep, pos: pos, dur: dur, ts: now });
    });
    v.addEventListener('pause', function () {
      var pos = v.currentTime, dur = v.duration;
      if (!isFinite(pos) || !isFinite(dur) || dur <= 0) return;
      pushHistory({ slug: slug, ep: ep, pos: pos, dur: dur, ts: Date.now() });
    });
  }

  /* ---------- load playback (proxy + melolo decrypt) ---------- */
  var playCache = {};
  function getCachedPlay(slug, ep) {
    var c = playCache[slug + ':' + ep];
    return (c && (Date.now() - c.ts) < 45000) ? c.payload : null;
  }
  function setCachedPlay(slug, ep, payload) { playCache[slug + ':' + ep] = { ts: Date.now(), payload: payload }; }

  function startVideo(payload) {
    var video = $('pvVid'), qSel = $('pvQuality');
    var urls = (payload.data && payload.data.detail && payload.data.detail.videoUrls) || [];
    if (!urls.length) { failMsg('Video kosong.'); return; }
    hideLoader();
    qSel.innerHTML = '';
    urls.forEach(function (u, i) {
      var o = document.createElement('option'); o.value = i;
      o.textContent = (u.quality || 'auto') + 'p (' + (u.url.indexOf('.m3u8') !== -1 ? 'HLS' : 'MP4') + ')';
      qSel.appendChild(o);
    });
    qSel.disabled = urls.length < 2;
    function playUrl(u) {
      var key = u.key || u.decryptKey;
      if (u.kid && key) {
        setLoader('Ndekripsi video… (bisa sawetara detik)');
        ensureMeloloDecrypt(function (ok) {
          if (!ok) { failMsg('Ora bisa muat dekripsi video (melolo-decrypt.js).'); return; }
          window.MeloloDecrypt.decrypt(u.url, key, function (stage, lineMsg) {
            if (stage === 'done') hideLoader();
            else if (stage === 'fetch') setLoader('Ngunduh video… ' + lineMsg);
            else setLoader('Ndekripsi video… ' + lineMsg);
          }).then(function (blob) {
            hideLoader();
            cleanupVideo(video);
            video.src = URL.createObjectURL(blob);
            video.load();
            attachSubtitles(video, payload.subtitle);
            watchPlay(video);
            video.play().catch(function () {});
          }).catch(function (e) {
            failMsg('Gagal ndekripsi video: ' + (e && e.message ? e.message : e));
          });
        });
        return;
      }
      hideLoader();
      attachSubtitles(video, payload.subtitle);
      setupVideo(video, u.url);
      watchPlay(video);
    }
    qSel.onchange = function () { playUrl(urls[parseInt(qSel.value, 10)]); };
    playUrl(urls[0]);
    setPlayerMsg('');
  }
  function failMsg(t) { hideLoader(); setPlayerMsg(t); }

  function playDirectNarto(video, url, isMp4) {
    cleanupVideo(video);
    if (isMp4 || !/\.m3u8([?#]|$)/i.test(url)) {
      video.src = url;
      video.load();
      video.play().catch(function () {});
      return;
    }
    if (window.Hls) {
      var hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hls.on(Hls.Events.ERROR, function (evt, data) {
        if (data && data.fatal) {
          if (data.type === 'networkError') { hls.startLoad(); }
          else if (data.type === 'mediaError') { hls.recoverMediaError(); }
          else { setPlayerMsg('HLS gagal dimuat (' + (data.details || data.type || '') + ').'); }
        }
      });
      video._hls = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      video.play().catch(function () {});
    } else if (video.canPlayType && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.play().catch(function () {});
    } else {
      setPlayerMsg('Browser ora ndukung HLS.');
    }
  }

  function loadNartoPlayback(slug, ep, attempt) {
    attempt = attempt || 0;
    var video = $('pvVid'), qSel = $('pvQuality');
    function fail(t, retryable) {
      hideLoader();
      if (retryable && attempt < 2) {
        setPlayerMsg('Gagal njupuk video (' + t + '). Nyoba maneh…');
        setTimeout(function () { loadNartoPlayback(slug, ep, attempt + 1); }, 2500);
        return;
      }
      setPlayerMsg(t);
    }
    fetch('/proxy/narto-playback?slug=' + encodeURIComponent(slug) + '&ep=' + ep)
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (j) {
        if (!j || j.success === false) { fail((j && j.error) || 'Server narto ngasilake kesalahan.', true); return; }
        if (!j.url) { fail('Stream URL kosong.', true); return; }
        hideLoader();
        qSel.innerHTML = '';
        var o = document.createElement('option'); o.value = '0'; o.textContent = j.isMp4 ? 'MP4 · Full' : 'HLS (otomatis)';
        qSel.appendChild(o); qSel.disabled = true;
        if (j.subtitleUrl) {
          fetch(j.subtitleUrl).then(function (r) { return r.text(); }).then(function (vtt) {
            attachSubtitles(video, vtt);
          }).catch(function () {});
        }
        playDirectNarto(video, j.url, !!j.isMp4);
        watchPlay(video);
        setPlayerMsg('');
      })
      .catch(function () { fail('Ora bisa nyambung menyang server narto.', true); });
  }

  function loadPlayback(slug, ep, attempt) {
    attempt = attempt || 0;
    var movie = findMovie(slug);
    if (movie && movie.providerCode === 'nt') { loadNartoPlayback(slug, ep, attempt); return; }
    var cached = getCachedPlay(slug, ep);
    if (cached) { startVideo(cached); return; }
    function fail(t, retryable) {
      hideLoader();
      if (retryable && attempt < 2) {
        setPlayerMsg('Gagal njupuk video (' + t + '). Nyoba maneh…');
        setTimeout(function () { loadPlayback(slug, ep, attempt + 1); }, 2500);
        return;
      }
      setPlayerMsg(t);
    }
    fetch('/proxy/playback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movieKey: slug, episode: ep })
    }).then(function (r) {
      return r.json().catch(function () { return null; });
    }).then(function (j) {
      if (!j) { fail('Respons server dudu JSON.', true); return; }
      if (j.success === false) { fail(j.error || 'Server playback ngasilake kesalahan.', true); return; }
      var tok = j && j.token;
      var payload = (j && j.payload) || (tok ? b64urlToJson(tok) : null);
      if (!payload) {
        fail('Gagal verifikasi video saka sumber. Priksa internet & log server ([proxy playback]).', true);
        return;
      }
      if (payload.kind !== 'ok') {
        var KIND_MSG = {
          login_required: 'Episode iki ora kasedhiya gratis ing sumber (butuh login Dracinema). Coba judul liya.',
          transient: 'Server lagi sibuk. Coba maneh sawetara detik.'
        };
        fail(KIND_MSG[payload.kind] || ('Gagal mbukak video (status: ' + payload.kind + ').'));
        return;
      }
      var urls = (payload.data && payload.data.detail && payload.data.detail.videoUrls) || [];
      if (!urls.length) { fail('Video kosong.'); return; }
      setCachedPlay(slug, ep, payload);
      startVideo(payload);
    }).catch(function () {
      fail('Ora bisa nyambung menyang server. Priksa `node server.js` banjur buka http://localhost:8000.', true);
    });
  }

  /* ---------- iklan pre-roll ---------- */
  function startPreroll(frameEl, onDone) {
    var cfg = AD.preroll || {};
    if (!cfg.enabled || !adEnabled()) { onDone(); return; }
    var overlay = document.createElement('div');
    overlay.className = 'ad-overlay';
    overlay.innerHTML = '<div class="ad-stage"></div>'
      + '<div class="ad-countdown">Iklan dimulai…</div>'
      + '<button type="button" class="btn btn-ghost btn-sm ad-skip hidden">Skip ▶</button>';
    var stage = overlay.querySelector('.ad-stage');
    var countEl = overlay.querySelector('.ad-countdown');
    var skip = overlay.querySelector('.ad-skip');
    stage.innerHTML = adSlotHTML(cfg, 'preroll');
    var dur = Math.max(1, parseInt(cfg.duration, 10) || 5);
    var left = dur;
    countEl.textContent = 'Iklan · ' + left + ' dtk';
    var timer = setInterval(function () {
      left--;
      if (left <= 0) {
        clearInterval(timer);
        skip.classList.remove('hidden');
        countEl.textContent = 'Iklan selesai — klik Skip utawa langsung nonton.';
      } else {
        countEl.textContent = 'Iklan · ' + left + ' dtk';
      }
    }, 1000);
    function finish() { clearInterval(timer); if (overlay.parentNode) overlay.remove(); onDone(); }
    skip.addEventListener('click', finish);
    overlay.addEventListener('click', function (e) {
      if (e.target.closest('.ad-creative') && !e.target.closest('a')) {
        toast('Demo iklan — hubungkan slot iklan asli di data/ads.js.');
      }
    });
    frameEl.appendChild(overlay);
  }

  /* ---------- Player ---------- */
  function renderPlay(slug, ep) {
    var d = findMovie(slug);
    var eps = d ? d.eps : 0;
    var title = d ? d.title : slug;
    var res = resumeFor(slug);
    var h = '<div class="wrap">';
    h += '<div class="crumb"><a href="#/">Beranda</a><span>›</span><a href="#/movie/' + encodeSlug(slug) + '">' + esc(title) + '</a><span>›</span><span>Episode ' + ep + '</span></div>';
    h += '<div class="player-card">';
    h += '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">';
    h += '<h1 class="detail-title" style="font-size:1.25rem">' + esc(title) + '</h1>';
    h += '<div class="detail-meta"><span class="badge brand">' + esc(d ? d.provider : '') + '</span><span class="badge gold">🎁 Gratis · Episode ' + ep + ' / ' + (eps || '?') + '</span></div>';
    h += '</div>';
    h += '<div class="video-frame" id="pvFrame">';
    h += '<video id="pvVid" class="video" playsinline preload="metadata"></video>';
    h += '<div id="pvWater" class="pv-water"><div class="wm-band wm-top" id="pvWmTop"></div><div class="wm-band wm-bottom" id="pvWmBot"></div></div>';
    h += '<div id="pvSub" class="sub-overlay hidden"></div>';
    h += '<div id="pvLoader" class="loader"><span class="spinner"></span><span>Muat video…</span></div>';
    h += '<p id="pvMsg" class="player-msg hidden"></p>';
    h += '<div id="pvAuto" class="auto-next hidden"><div class="auto-next-box">';
    h += '<div class="auto-next-info"><span class="auto-next-label">Selanjutnya otomatis</span> <span class="auto-next-name" id="pvAutoName"></span></div>';
    h += '<div class="auto-next-track"><i id="pvAutoBar"></i></div>';
    h += '<div class="auto-next-row"><span class="auto-next-count" id="pvAutoCount"></span><button type="button" id="pvAutoCancel" class="btn btn-ghost btn-sm">Batal</button></div>';
    h += '</div></div>';
    h += '</div>';
    h += '<div class="player-controls">';
    h += '<label class="badge" style="cursor:pointer"><input type="checkbox" id="pvAutoToggle" checked> Auto-next</label>';
    h += '<button type="button" class="btn btn-ghost btn-sm" id="pvPlay">▶</button>';
    h += '<input type="range" id="pvSeek" class="player-seek" min="0" max="1000" value="0" aria-label="Seek">';
    h += '<span class="badge player-time" id="pvTime">0:00 / 0:00</span>';
    h += '<span class="badge">Kualitas:</span><select id="pvQuality" class="sel"></select>';
    h += '<button type="button" class="btn btn-ghost btn-sm" id="pvFs">⛶ Layar penuh</button>';
    h += (ep > 1 ? '<a class="btn btn-ghost btn-sm" href="#/play/' + encodeSlug(slug) + '/' + (ep - 1) + '">‹ Sebelumnya</a>' : '');
    h += (ep < eps ? '<a class="btn btn-primary btn-sm" href="#/play/' + encodeSlug(slug) + '/' + (ep + 1) + '">Berikutnya ›</a>' : '');
    h += '</div>';
    h += '<p class="muted" style="font-size:.82rem;margin-top:10px">Gratis — tanpa langganan. Cukup nonton iklan singkat sebelum episode diputar.</p>';
    h += '</div>';
    h += '</div>';
    APP.innerHTML = h;

    var videoEl = $('pvVid');
    videoEl.addEventListener('error', function () {
      var msgEl = $('pvMsg');
      if (msgEl && !msgEl.textContent) msgEl.textContent = 'Video gagal diputar (kode ' + (videoEl.error ? videoEl.error.code : '') + '). Coba pilih kualitas liya utawa muat ulang.';
    });
    armAutoNext(videoEl, slug, Number(ep), eps || 0);
    var cancelBtn = $('pvAutoCancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function () { cancelAutoNext(videoEl); });
    var tog = $('pvAutoToggle');
    if (tog) tog.addEventListener('change', function () { if (videoEl._autoCtx) videoEl._autoCtx.enabled = tog.checked; });
    var playBtn = $('pvPlay'), seek = $('pvSeek'), timeEl = $('pvTime');
    function fmtT(s) {
      s = Math.floor(s || 0);
      if (!isFinite(s)) return '0:00';
      var m = Math.floor(s / 60), ss = s % 60;
      return m + ':' + (ss < 10 ? '0' : '') + ss;
    }
    function syncPlayerUi() {
      if (!videoEl) return;
      var d = videoEl.duration || 0, t = videoEl.currentTime || 0;
      if (seek) {
        var max = Math.max(1000, Math.round(d * 1000));
        seek.max = max;
        seek.value = Math.min(Math.round(t * 1000), max);
      }
      if (timeEl) timeEl.textContent = fmtT(t) + ' / ' + fmtT(d);
      if (playBtn) playBtn.textContent = videoEl.paused ? '▶' : '⏸';
    }
    videoEl.addEventListener('timeupdate', syncPlayerUi);
    videoEl.addEventListener('play', syncPlayerUi);
    videoEl.addEventListener('pause', syncPlayerUi);
    videoEl.addEventListener('loadedmetadata', syncPlayerUi);
    videoEl.addEventListener('ended', syncPlayerUi);
    if (playBtn) playBtn.addEventListener('click', function () {
      if (videoEl.paused) videoEl.play().catch(function () {}); else videoEl.pause();
    });
    if (seek) seek.addEventListener('input', function () {
      var d = videoEl.duration || 0;
      if (d > 0) videoEl.currentTime = (parseInt(seek.value, 10) / 1000) * d;
    });
    if (!window._hhFsBound) {
      window._hhFsBound = true;
      document.addEventListener('fullscreenchange', function () {
        var fe = document.fullscreenElement;
        var fr = $('pvFrame');
        if (fe && fe.id === 'pvVid' && fr) {
          document.exitFullscreen().catch(function () {});
          setTimeout(function () {
            if (!document.fullscreenElement && fr.requestFullscreen) fr.requestFullscreen().catch(function () {});
          }, 150);
        }
      });
    }
    var fsBtn = $('pvFs');
    function setupWmAlign() {
      var fr = $('pvFrame'), v = $('pvVid'), topEl = $('pvWmTop'), botEl = $('pvWmBot');
      if (!fr || !v || !topEl || !botEl) return;
      var inFs = document.fullscreenElement || document.webkitFullscreenElement;
      if (!inFs) {
        topEl.style.height = ''; topEl.style.top = ''; topEl.style.display = '';
        botEl.style.height = ''; botEl.style.top = ''; botEl.style.display = '';
        return;
      }
      var frr = fr.getBoundingClientRect(), vr = v.getBoundingClientRect();
      if (vr.width === 0 || vr.height === 0) return;
      // Mobil portrait (layar tegak): blur dihapus supaya video katon cetha
      if (frr.height > frr.width) {
        topEl.style.display = 'none';
        botEl.style.display = 'none';
        return;
      }
      var minH = Math.round(window.innerHeight * 0.13);
      var topH = Math.max(minH, Math.round(vr.top - frr.top + vr.height * 0.5));
      var botTop = Math.max(0, Math.round(vr.bottom - frr.top - vr.height * 0.16));
      var botH = Math.max(minH, Math.round(frr.height - botTop));
      topEl.style.height = topH + 'px'; topEl.style.top = '0px';
      botEl.style.top = botTop + 'px'; botEl.style.height = botH + 'px';
    }
    if (!window._hhWmBound) {
      window._hhWmBound = true;
      document.addEventListener('fullscreenchange', setupWmAlign);
      window.addEventListener('resize', setupWmAlign);
    }
    if (fsBtn) fsBtn.addEventListener('click', function () {
      var fr = $('pvFrame');
      if (!fr) return;
      if (document.fullscreenElement) { document.exitFullscreen().catch(function () {}); return; }
      if (fr.requestFullscreen) {
        fr.requestFullscreen().then(function () { setTimeout(setupWmAlign, 250); }).catch(function () {
          var v = $('pvVid');
          if (v && v.requestFullscreen) v.requestFullscreen().catch(function () {});
        });
      } else if (fr.webkitRequestFullscreen) {
        fr.webkitRequestFullscreen();
        setTimeout(setupWmAlign, 250);
      }
    });
    trackHistory(videoEl, slug, Number(ep));
    var frame = $('pvFrame');
    startPreroll(frame, function () { loadPlayback(slug, Number(ep)); });
    window.scrollTo(0, 0);
  }

  /* ---------- Riwayat ---------- */
  function renderHistory() {
    var list = continueItems().filter(function (h) { return findMovie(h.slug); });
    if (!list.length) {
      APP.innerHTML = '<div class="wrap"><div class="empty"><div style="font-size:3rem">🍿</div><h2>Durung ana riwayat</h2><p class="muted">Mulai nonton drama favoritmu, riwayat bakal muncul ing kene.</p><a class="btn btn-primary" href="#/browse">Jelajah Drama</a></div></div>';
      return;
    }
    var h = '<div class="wrap"><h1 class="page-title">Riwayat Nonton</h1><div style="display:flex;justify-content:flex-end;margin-bottom:16px"><button class="btn btn-ghost btn-sm" id="clearHist">Hapus Semua</button></div><div class="row"><div class="row-viewport">' + list.map(continueCardHTML).join('') + '</div></div></div>';
    APP.innerHTML = h;
    var clr = $('clearHist');
    if (clr) clr.addEventListener('click', function () { saveHistory([]); renderHistory(); toast('Riwayat dibersihkan.'); });
  }

  /* ---------- Router & boot ---------- */
  function route() {
    updateNavActive();
    var h = location.hash || '#/';
    var m = h.match(/^#\/movie\/([^/]+)$/);
    if (m) { renderDetail(decodeURIComponent(m[1])); return; }
    m = h.match(/^#\/play\/([^/]+)\/(\d+)$/);
    if (m) { renderPlay(decodeURIComponent(m[1]), parseInt(m[2], 10)); return; }
    m = h.match(/^#\/browse/);
    if (m) { renderBrowse(); return; }
    m = h.match(/^#\/history/);
    if (m) { renderHistory(); return; }
    renderHome();
  }
  window.addEventListener('hashchange', route);
  renderShell();
  route();
})();
