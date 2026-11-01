/* ===== Konfigurasi Iklan — Hore-Hore Dracin =====
 * Mode:
 *   "demo"    -> placeholder iklan bawaan (tanpa jaringan iklan).
 *   "adsense" -> pakai slot Google AdSense (isi `adsense.client` + slot).
 *   "custom"  -> tulis HTML iklan Anda sendiri di `preroll.html` / `banner.html`.
 * Model: gratis, tanpa langganan — penonton cukup "nonton iklan".
 */
window.AD_CONFIG = {
  mode: "demo",
  brand: "Hore-Hore Dracin",

  /* Iklan pre-roll: muncul sebelum video diputar */
  preroll: {
    enabled: true,
    duration: 6,        // countdown (detik) sebelum tombol skip aktif
    everyEpisode: true, // true = muncul di tiap episode
    html: ""            // dipakai bila mode !== "demo"
  },

  /* Iklan banner (statis) */
  banner: {
    enabled: true,
    position: "below-hero",  // below-hero | above-footer
    html: ""
  },

  /* Iklan mid-roll (opsional, default mati) */
  midroll: {
    enabled: false,
    everyMinutes: 12
  },

  /* Google AdSense (isi saat mode = "adsense") */
  adsense: {
    client: "",          // contoh: ca-pub-XXXXXXXXXXXXXXXX
    slots: {}            // { preroll: '1234567890', banner: '1234567891' }
  }
};
