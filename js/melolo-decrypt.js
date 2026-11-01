const MeloloDecrypt = (() => {
  const hasSubtle = !!(typeof crypto !== 'undefined' && crypto.subtle);

  function readU32(buf, off) {
    return (buf[off] << 24 | buf[off+1] << 16 | buf[off+2] << 8 | buf[off+3]) >>> 0;
  }
  function readU64(buf, off) {
    return readU32(buf, off) * 0x100000000 + readU32(buf, off + 4);
  }
  function writeTag(buf, off, tag) {
    for (let i = 0; i < 4; i++) buf[off + i] = tag.charCodeAt(i);
  }
  function readTag(buf, off) {
    return String.fromCharCode(buf[off], buf[off+1], buf[off+2], buf[off+3]);
  }
  function iterBoxes(buf, start, end) {
    const boxes = [];
    let off = start;
    while (off + 8 <= end) {
      const size = readU32(buf, off);
      if (size < 8 || off + size > end) break;
      boxes.push({ offset: off, size, tag: readTag(buf, off + 4), bodyOff: off + 8 });
      off += size;
    }
    return boxes;
  }
  function findBox(buf, start, end, tag) {
    for (const b of iterBoxes(buf, start, end)) if (b.tag === tag) return b;
    return null;
  }
  function walkPath(buf, start, end, ...tags) {
    let s = start, e = end, found = null;
    for (const tag of tags) {
      found = null;
      for (const b of iterBoxes(buf, s, e)) {
        if (b.tag === tag) { found = b; s = b.bodyOff; e = b.offset + b.size; break; }
      }
      if (!found) return null;
    }
    return found;
  }

  function parseSampleTable(buf, stblStart, stblEnd) {
    const find = (tag) => findBox(buf, stblStart, stblEnd, tag);
    const stsz = find('stsz'), stsc = find('stsc'), stco = find('stco'), co64 = find('co64'), senc = find('senc');
    if (!stsz || !stsc || (!stco && !co64)) return null;

    const defaultSz = readU32(buf, stsz.bodyOff + 4);
    const n = readU32(buf, stsz.bodyOff + 8);
    const sizes = new Array(n);
    if (defaultSz === 0) {
      for (let i = 0; i < n; i++) sizes[i] = readU32(buf, stsz.bodyOff + 12 + i * 4);
    } else { sizes.fill(defaultSz); }

    let chunkOffs;
    if (stco) {
      const cnt = readU32(buf, stco.bodyOff + 4); chunkOffs = new Array(cnt);
      for (let i = 0; i < cnt; i++) chunkOffs[i] = readU32(buf, stco.bodyOff + 8 + i * 4);
    } else {
      const cnt = readU32(buf, co64.bodyOff + 4); chunkOffs = new Array(cnt);
      for (let i = 0; i < cnt; i++) chunkOffs[i] = readU64(buf, co64.bodyOff + 8 + i * 8);
    }

    const ne = readU32(buf, stsc.bodyOff + 4);
    const entries = [];
    for (let i = 0; i < ne; i++) {
      entries.push({ firstChunk: readU32(buf, stsc.bodyOff + 8 + i * 12), spc: readU32(buf, stsc.bodyOff + 12 + i * 12) });
    }

    const sampleOffs = []; let si = 0;
    for (let ci = 0; ci < chunkOffs.length && si < n; ci++) {
      let spc = 1;
      for (const e of entries) { if (ci + 1 >= e.firstChunk) spc = e.spc; else break; }
      let cur = chunkOffs[ci];
      for (let k = 0; k < spc && si < n; k++) { sampleOffs.push(cur); cur += sizes[si]; si++; }
    }

    let ivs = [];
    if (senc) {
      const flags = (buf[senc.bodyOff + 1] << 16) | (buf[senc.bodyOff + 2] << 8) | buf[senc.bodyOff + 3];
      const cnt = readU32(buf, senc.bodyOff + 4);
      let off = senc.bodyOff + 8;
      for (let i = 0; i < cnt; i++) {
        ivs.push(new Uint8Array(buf.buffer, buf.byteOffset + off, 8));
        off += 8;
        if (flags & 0x02) { off += 2 + ((buf[off] << 8) | buf[off + 1]) * 6; }
      }
    }
    return { sampleOffs, sizes, ivs };
  }

  function parseAllTracks(buf, moov) {
    const tracks = [];
    for (const trak of iterBoxes(buf, moov.bodyOff, moov.offset + moov.size)) {
      if (trak.tag !== 'trak') continue;
      const mdia = walkPath(buf, trak.bodyOff, trak.offset + trak.size, 'mdia');
      if (!mdia) continue;
      const hdlr = walkPath(buf, mdia.bodyOff, mdia.offset + mdia.size, 'hdlr');
      if (!hdlr) continue;
      const handler = readTag(buf, hdlr.offset + 16);
      if (handler !== 'vide' && handler !== 'soun') continue;
      const stbl = walkPath(buf, mdia.bodyOff, mdia.offset + mdia.size, 'minf', 'stbl');
      if (!stbl) continue;
      const track = parseSampleTable(buf, stbl.bodyOff, stbl.offset + stbl.size);
      if (track && track.ivs.length > 0) tracks.push(track);
    }
    return tracks;
  }

  const keyArrayCache = new WeakMap();
  function getKeyArray(keyBytes) {
    let arr = keyArrayCache.get(keyBytes);
    if (!arr) { arr = Array.from(keyBytes); keyArrayCache.set(keyBytes, arr); }
    return arr;
  }

  function decryptBatchSoft(buf, track, keyBytes, from, to) {
    const keyArr = getKeyArray(keyBytes);
    const counter = new Uint8Array(16);
    for (let i = from; i < to; i++) {
      counter.fill(0);
      counter.set(track.ivs[i], 0);
      const aesCtr = new aesjs.ModeOfOperation.ctr(keyArr, new aesjs.Counter(counter));
      const off = track.sampleOffs[i];
      const sz = track.sizes[i];
      const sub = new Uint8Array(buf.buffer, buf.byteOffset + off, sz);
      const dec = aesCtr.decrypt(sub);
      buf.set(dec, off);
    }
  }

  function decryptBatchNative(buf, track, cryptoKey, from, to) {
    const promises = new Array(to - from);
    for (let i = from; i < to; i++) {
      const counter = new Uint8Array(16);
      counter.set(track.ivs[i], 0);
      const off = track.sampleOffs[i];
      const sz = track.sizes[i];
      promises[i - from] = crypto.subtle.decrypt(
        { name: 'AES-CTR', counter, length: 64 }, cryptoKey,
        buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + sz)
      ).then(dec => { buf.set(new Uint8Array(dec), off); });
    }
    return Promise.all(promises);
  }

  function neutralizeDRM(buf, moovStart, moovEnd) {
    const rename = { 'encv':'hvc1','enca':'mp4a','sinf':'free','schm':'free','schi':'free',
      'senc':'free','saio':'free','saiz':'free','tenc':'free','frma':'free','pssh':'free' };
    for (let i = moovStart + 4; i + 4 <= moovEnd; i++) {
      const tag = readTag(buf, i);
      if (tag in rename) {
        const sz = readU32(buf, i - 4);
        if (sz >= 8 && sz <= moovEnd - i + 4) writeTag(buf, i, rename[tag]);
      }
    }
    let off = 0;
    while (off + 8 <= buf.length) {
      const sz = readU32(buf, off);
      if (sz < 8 || off + sz > buf.length) break;
      const tag = readTag(buf, off + 4);
      if (tag === 'pssh') writeTag(buf, off + 4, 'free');
      off += sz;
    }
  }

  async function decrypt(cdnURL, keyHex, onProgress) {
    const log = onProgress || (() => {});
    const t0 = Date.now();

    const keyBytes = new Uint8Array(keyHex.match(/.{2}/g).map(h => parseInt(h, 16)));

    let cryptoKey = null;
    if (hasSubtle) {
      try {
        cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CTR' }, false, ['decrypt']);
      } catch(e) {}
    }

    const useNative = !!cryptoKey;
    if (!useNative && typeof aesjs === 'undefined') {
      throw new Error('Browser ora ndhukung dekripsi (aesjs/subtle ora kasedhiya)');
    }
    log('fetch', useNative ? 'Connecting... (hardware AES)' : 'Connecting... (software AES)');

    const mediaURL = (typeof location !== 'undefined' && /^https?:$/.test(location.protocol))
      ? '/proxy/media?url=' + encodeURIComponent(cdnURL)
      : cdnURL;
    const resp = await fetch(mediaURL);
    if (!resp.ok) throw new Error(`CDN ${resp.status}`);
    const total = parseInt(resp.headers.get('Content-Length') || '0');
    const reader = resp.body.getReader();

    let buf = total > 0 ? new Uint8Array(total) : null;
    const fallbackChunks = total > 0 ? null : [];
    let received = 0;

    let moovParsed = false, moovBox = null, tracks = null;
    const decUp = [];
    const inFlight = [];
    let lastOverlap = 0;
    const OVERLAP_BATCH = useNative ? 50 : 30;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (buf) { buf.set(value, received); } else { fallbackChunks.push(value); }
      received += value.length;

      const pct = total > 0 ? Math.round(received / total * 100) : 0;
      const mb = (received / 1048576).toFixed(1);

      if (!moovParsed && buf && received > 512) {
        const moov = walkPath(buf, 0, received, 'moov');
        if (moov && moov.offset + moov.size <= received) {
          moovParsed = true;
          moovBox = moov;
          tracks = parseAllTracks(buf, moov);
          tracks.forEach(() => decUp.push(0));
        }
      }

      if (moovParsed && tracks && Date.now() - lastOverlap > 30) {
        for (let ti = 0; ti < tracks.length; ti++) {
          const t = tracks[ti];
          const cnt = Math.min(t.sampleOffs.length, t.ivs.length);
          let avail = decUp[ti];
          while (avail < cnt && t.sampleOffs[avail] + t.sizes[avail] <= received) avail++;
          if (avail - decUp[ti] >= OVERLAP_BATCH) {
            if (useNative) {
              inFlight.push(decryptBatchNative(buf, t, cryptoKey, decUp[ti], avail));
            } else {
              decryptBatchSoft(buf, t, keyBytes, decUp[ti], avail);
            }
            decUp[ti] = avail;
            lastOverlap = Date.now();
          }
        }
        log('fetch', `${pct}% (${mb}MB) decrypt...`);
      } else {
        log('fetch', `${pct}% (${mb}MB)`);
      }
    }

    if (!buf) {
      buf = new Uint8Array(received);
      let pos = 0;
      for (const c of fallbackChunks) { buf.set(c, pos); pos += c.length; }
    }
    log('fetch', `${(received / 1048576).toFixed(1)} MB OK`);

    if (!moovParsed) {
      log('decrypt', 'Parsing...');
      const moov = walkPath(buf, 0, buf.length, 'moov');
      if (!moov) throw new Error('No moov');
      moovBox = moov;
      tracks = parseAllTracks(buf, moov);
      tracks.forEach(() => decUp.push(0));
    }

    if (!tracks || tracks.length === 0) throw new Error('No encrypted tracks');

    let totalSamples = 0, doneSamples = 0;
    for (let ti = 0; ti < tracks.length; ti++) {
      const t = tracks[ti];
      const cnt = Math.min(t.sampleOffs.length, t.ivs.length);
      totalSamples += cnt;
      doneSamples += decUp[ti];
      const BATCH = useNative ? 500 : 200;
      for (let start = decUp[ti]; start < cnt; start += BATCH) {
        const end = Math.min(start + BATCH, cnt);
        if (useNative) {
          inFlight.push(decryptBatchNative(buf, t, cryptoKey, start, end));
        } else {
          decryptBatchSoft(buf, t, keyBytes, start, end);
        }
      }
    }

    if (doneSamples > 0) {
      log('decrypt', `${Math.round(doneSamples / totalSamples * 100)}% overlap, finishing...`);
    } else {
      log('decrypt', `Decrypting ${totalSamples} samples...`);
    }

    if (inFlight.length > 0) await Promise.all(inFlight);

    log('neutralize', 'Finalizing...');
    const moovRef = moovBox || walkPath(buf, 0, buf.length, 'moov');
    if (moovRef) {
      neutralizeDRM(buf, moovRef.offset, moovRef.offset + moovRef.size);
    }

    const took = ((Date.now() - t0) / 1000).toFixed(1);
    log('done', `Ready! ${(buf.length / 1048576).toFixed(1)}MB in ${took}s`);
    return new Blob([buf], { type: 'video/mp4' });
  }

  async function play(videoEl, opts) {
    const { apiBase, bookId, episode, quality = '720p', onProgress } = opts;
    const log = onProgress || (() => {});
    log('api', 'Loading...');
    const epResp = await fetch(`${apiBase}/api/melolo/episode?id=${bookId}&ep=${episode}`);
    const epData = await epResp.json();
    if (!epData.qualityList || !epData.qualityList.length) throw new Error('No qualities');
    let chosen = epData.qualityList.find(q => q.label === quality)
      || epData.qualityList.find(q => q.isDefault) || epData.qualityList[0];
    if (!chosen.url || !chosen.kid) throw new Error('Missing URL/KID');
    log('key', 'Key...');
    const keyData = await fetch(`${apiBase}/api/melolo/key?vid=${encodeURIComponent(chosen.kid)}`).then(r=>r.json());
    if (!keyData.key) throw new Error('No key');
    const blob = await decrypt(chosen.url, keyData.key, onProgress);
    if (videoEl.src && videoEl.src.startsWith('blob:')) URL.revokeObjectURL(videoEl.src);
    videoEl.src = URL.createObjectURL(blob);
    videoEl.load();
    videoEl.play().catch(() => {});
  }

  return { decrypt, play, hasSubtle };
})();
if (typeof module !== 'undefined') module.exports = MeloloDecrypt;
if (typeof window !== 'undefined') window.MeloloDecrypt = MeloloDecrypt;
