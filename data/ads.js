/* ===== Konfigurasi Iklan — Hore-Hore Dracin =====
 * Mode:
 *   "demo"    -> placeholder iklan bawaan (tanpa jaringan iklan).
 *   "adsense" -> pakai slot Google AdSense (isi `adsense.client` + slot).
 *   "custom"  -> tulis HTML iklan sendiri di `preroll.html` / `banner.html`.
 *
 * Adsterra — Native Display/Banner (di tengah player):
 *   1. Embed sudah terisi; kalau mau ganti, tempel kode baru ke `adsterra.embed`
 *      (script + <div id="container-...">).
 *   2. Pastikan `adsterra.enabled: true` dan `mode: "custom"`.
 *   3. Countdown 6 detik + tombol Skip tetap jalan otomatis.
 * Adsterra — Social Bar (global, mengambang di pinggir layar):
 *   Tempel src script dari dashboard ke `socialbar.code`.
 *
 * Model: gratis, tanpa langganan — penonton cukup "nonton iklan".
 */
window.AD_CONFIG = {
  mode: "custom",
  brand: "Hore-Hore Dracin",

  /* Iklan pre-roll: muncul sebelum video diputar (di tengah player) */
  preroll: {
    enabled: true,
    duration: 6,        // countdown (detik) sebelum tombol skip aktif
    everyEpisode: true, // true = muncul di tiap episode
    html: ""            // cadangan bila mode "custom" tanpa adsterra.embed
  },

  /* Iklan banner (statis) — dipasang di bawah tiap halaman (di atas footer) */
  banner: {
    enabled: true,
    position: "above-footer",  // above-footer = di bawah tiap halaman
    html: '<script>'
      + '  atOptions = {'
      + "    'key' : '6ade322ac92f833f4f0f1990f56abdc5',"
      + "    'format' : 'iframe',"
      + "    'height' : 90,"
      + "    'width' : 728,"
      + "    'params' : {}"
      + '  };'
      + '</script>'
      + '<script src="https://bancadeltempoidea.org/22/6ade322ac92f833f4f0f1990f56abdc5"></script>'
  },

  /* Iklan mid-roll (opsional, default mati) */
  midroll: {
    enabled: false,
    everyMinutes: 12
  },

  /* Adsterra — Native Display / Banner (tengah player saat pre-roll) */
  adsterra: {
    enabled: true,
    position: "preroll",   // preroll = di tengah player, countdown 6 dtk + skip
    embed: '<script async="async" data-cfasync="false" src="https://pl32138513.profitableratecpmnetwork.com/13e30382a67261557cb9ddb056786d7d/invoke.js"></script>'
      + '<div id="container-13e30382a67261557cb9ddb056786d7d"></div>'
  },

  /* Adsterra — Social Bar (mengambang, global) */
  socialbar: {
    enabled: true,
    code: "https://bancadeltempoidea.org/14/5e26d6f7bb6d0f1bc2e45b3b86cfd41e"
  },

  /* Google AdSense (isi saat mode = "adsense") */
  adsense: {
    client: "",          // contoh: ca-pub-XXXXXXXXXXXXXXXX
    slots: {}            // { preroll: '1234567890', banner: '1234567891' }
  }
};
