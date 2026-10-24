/* 真实照片：按学名匹配，直接引用原始来源（不在本地存储任何图片）
   1. Wikipedia 页面主图（批量查询，每次最多 50 个标题），图片托管在 Wikimedia Commons
   2. 找不到或 Wikipedia 无法访问时，回退到 iNaturalist 物种默认照片（限速，约每秒 1 次）
   结果只缓存在内存里，关闭页面即消失。 */
window.BIO = window.BIO || {};
(function () {
  const B = BIO;
  const P = {};
  const cache = new Map();     // key -> Promise<result|null>
  const done = new Map();      // key -> result|null（同步读取）
  const wikiQ = [], inatQ = [];
  let wikiTimer = 0, wikiBusy = 0, wikiDown = false, inatBusy = false;

  // 只要实拍照片：跳过分布图、示意图、矢量图、图表等
  const NOT_PHOTO = /\.(svg|gif)$|(^|[_\s(-])(distribution|range|map|maps|size|diagram|chart|cladogram|phylogeny|logo|scheme|comparison|silhouette|skeletal|fig|plate)([_\s).,-]|$)|reconstruc|book_of|locomotor|(^|[\s_])(BW|TD|NT)\.|panoply|infobox|stamp_of|digital_clay|paleoart|life_restoration/i;
  // Wikipedia 主图不是实拍时，直接改用 iNaturalist 的实拍照片
  const PREFER_INAT = new Set(['Pantholops hodgsonii', 'Nomascus hainanus']);
  // 主图是绘图、而 Commons 图库里有化石/标本实拍的类群
  const PREFER_COMMONS = new Set(['Argentinosaurus huinculensis']);
  const clean = t => (t || '').split(/ · | \/ /)[0].replace(/\s+spp?\.?$/i, '').trim();
  P.key = it => it.wk || clean(it.l || it.e);
  const cands = it => [it.wk, clean(it.l), it.e].filter((v, i, a) => v && a.indexOf(v) === i);

  P.get = function (it, priority) {
    const key = it && P.key(it);
    if (!key) return Promise.resolve(null);
    if (cache.has(key)) {
      if (priority) { const q = wikiDown ? inatQ : wikiQ, k = q.findIndex(j => j.key === key); if (k > 0) q.unshift(q.splice(k, 1)[0]); }
      return cache.get(key);
    }
    let res;
    const p = new Promise(r => { res = r; });
    p.then(v => done.set(key, v));
    cache.set(key, p);
    const job = { key, it, cands: cands(it), res };
    // 扩充名录自带一张 iNaturalist 观测实拍，直接使用
    if (it.pu) {
      const pid = (it.pu.match(/photos\/(\d+)\//) || [])[1];
      res({ src: it.pu.replace('/square.', '/medium.'), big: it.pu.replace('/square.', '/large.'), credit: it.pc, page: `https://www.inaturalist.org/taxa/${it.ti}`,
        photoPage: pid ? `https://www.inaturalist.org/photos/${pid}` : `https://www.inaturalist.org/taxa/${it.ti}`, title: it.l, source: 'inaturalist' });
      return p;
    }
    if (PREFER_COMMONS.has(key)) searchCommons(key).then(r => r ? res(r) : queueInat(job, priority));
    else if (wikiDown || PREFER_INAT.has(key)) queueInat(job, priority);
    else { priority ? wikiQ.unshift(job) : wikiQ.push(job); scheduleWiki(); }
    return p;
  };
  P.peek = it => it ? done.get(P.key(it)) : undefined;

  /* ---------- Wikipedia 批量查询 ---------- */
  function scheduleWiki() { if (!wikiTimer) wikiTimer = setTimeout(flushWiki, 40); }
  function flushWiki() {
    wikiTimer = 0;
    while (wikiQ.length && wikiBusy < 2) {
      const batch = [], titles = new Set();
      while (wikiQ.length) {
        const j = wikiQ[0];
        if (titles.size + j.cands.length > 50) break;
        wikiQ.shift(); batch.push(j); j.cands.forEach(c => titles.add(c));
      }
      runWiki(batch, [...titles]);
    }
  }
  function runWiki(batch, titles) {
    wikiBusy++;
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 8000);
    const url = 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*&redirects=1'
      + '&prop=pageimages|info&inprop=url&piprop=thumbnail|original|name&pithumbsize=330&pilimit=50&titles=' + encodeURIComponent(titles.join('|'));
    fetch(url, { signal: ctrl.signal }).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(j => {
      const q = j.query || {}, norm = {}, red = {}, pages = {};
      (q.normalized || []).forEach(n => { norm[n.from] = n.to; });
      (q.redirects || []).forEach(n => { red[n.from] = n.to; });
      (q.pages || []).forEach(pg => { pages[pg.title] = pg; });
      const find = t => { let x = norm[t] || t; x = red[x] || x; return pages[x]; };
      batch.forEach(job => {
        for (const c of job.cands) {
          const pg = find(c);
          if (pg && pg.thumbnail && pg.pageimage && !NOT_PHOTO.test(pg.pageimage)) {
            const o = pg.original, th = pg.thumbnail.source;
            const big = o && o.width && o.width <= 1280 && /\.(jpe?g|png|webp)$/i.test(o.source) ? o.source : th.replace(/\/\d+px-/, '/960px-');
            return job.res({ src: th, big, file: pg.pageimage, page: pg.fullurl, title: pg.title, source: 'wikipedia' });
          }
        }
        queueInat(job);
      });
    }).catch(() => {
      wikiDown = true;               // 网络不可达：之后全部改用 iNaturalist
      batch.forEach(job => queueInat(job));
      while (wikiQ.length) queueInat(wikiQ.shift());
    }).finally(() => { clearTimeout(timer); wikiBusy--; if (wikiQ.length) scheduleWiki(); });
  }

  /* ---------- iNaturalist 回退（限速） ---------- */
  function queueInat(job, priority) { priority ? inatQ.unshift(job) : inatQ.push(job); pumpInat(); }
  function pumpInat() {
    if (inatBusy || !inatQ.length) return;
    inatBusy = true;
    const job = inatQ.shift();
    const lat = clean(job.it.l), en = (job.it.e || '').toLowerCase();
    const tryNames = [lat, job.it.e].filter(Boolean);
    (async () => {
      for (const name of tryNames) {
        try {
          const r = await fetch('https://api.inaturalist.org/v1/taxa?per_page=5&q=' + encodeURIComponent(name)).then(x => x.ok ? x.json() : null);
          const hit = r && (r.results || []).find(t => t.default_photo && (
            t.name.toLowerCase() === lat.toLowerCase() ||
            (t.matched_term || '').toLowerCase() === name.toLowerCase() && (!lat || t.name.toLowerCase().startsWith(lat.split(' ')[0].toLowerCase())) ||
            (en && (t.preferred_common_name || '').toLowerCase() === en)));
          if (hit) {
            const d = hit.default_photo;
            return job.res({ src: d.medium_url, big: (d.medium_url || '').replace('/medium.', '/large.'), credit: d.attribution, license: (d.license_code || '').toUpperCase(),
              page: `https://www.inaturalist.org/taxa/${hit.id}`, photoPage: `https://www.inaturalist.org/photos/${d.id}`, title: hit.name, source: 'inaturalist' });
          }
        } catch (e) { /* 网络错误：尝试下一个名字 */ }
        await new Promise(r => setTimeout(r, 1100));
      }
      job.res(wikiDown ? null : await searchCommons(lat || job.it.e));
    })().finally(() => setTimeout(() => { inatBusy = false; pumpInat(); }, 1100));
  }

  /* ---------- 第三来源：在 Wikimedia Commons 图库中按学名搜索实拍照片 ---------- */
  async function searchCommons(name) {
    if (!name) return null;
    try {
      const q = 'action=query&format=json&formatversion=2&origin=*&generator=search&gsrnamespace=6&gsrlimit=12'
        + '&gsrsearch=' + encodeURIComponent(`"${name}" filetype:bitmap`) + '&prop=imageinfo&iiprop=url|mime&iiurlwidth=330';
      const j = await fetch('https://commons.wikimedia.org/w/api.php?' + q).then(x => x.json());
      const pages = ((j.query && j.query.pages) || []).sort((a, b) => a.index - b.index);
      for (const pg of pages) {
        const ii = pg.imageinfo && pg.imageinfo[0], file = pg.title.replace(/^File:/, '');
        if (!ii || !/jpeg|png|webp/.test(ii.mime) || NOT_PHOTO.test(file) || !ii.thumburl) continue;
        return { src: ii.thumburl, big: ii.thumburl.replace(/\/\d+px-/, '/960px-'), file, page: ii.descriptionurl, title: name, source: 'commons' };
      }
    } catch (e) { /* 忽略 */ }
    return null;
  }

  /* ---------- 作者与授权（仅在详情弹窗中按需查询） ---------- */
  const creditCache = new Map();
  P.credit = function (r) {
    if (!r) return Promise.resolve(null);
    if (r.source === 'inaturalist') return Promise.resolve({ text: `${r.credit || '© iNaturalist 用户'}`, link: r.photoPage || r.page, site: 'iNaturalist' });
    if (creditCache.has(r.file)) return creditCache.get(r.file);
    const q = 'action=query&format=json&formatversion=2&origin=*&prop=imageinfo&iiprop=extmetadata|url&titles=' + encodeURIComponent('File:' + r.file);
    const strip = h => (h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const p = fetch('https://commons.wikimedia.org/w/api.php?' + q).then(x => x.json()).then(j => {
      const pg = j.query && j.query.pages && j.query.pages[0], ii = pg && pg.imageinfo && pg.imageinfo[0];
      if (!ii) return { text: 'Wikimedia Commons', link: r.page, site: 'Wikipedia' };
      const m = ii.extmetadata || {};
      const artist = strip(m.Artist && m.Artist.value).slice(0, 60);
      const lic = strip(m.LicenseShortName && m.LicenseShortName.value);
      return { text: [artist, lic].filter(Boolean).join(' · ') || 'Wikimedia Commons', link: ii.descriptionurl || r.page, site: 'Wikimedia Commons' };
    }).catch(() => ({ text: 'Wikimedia Commons', link: r.page, site: 'Wikipedia' }));
    creditCache.set(r.file, p);
    return p;
  };

  /* ---------- 把照片填进一个容器 ---------- */
  P.fill = function (host, it, opts = {}) {
    if (!host || !it) return;
    host.classList.add('ph-host');
    P.get(it, opts.priority).then(r => {
      if (!r || !host.isConnected) return;
      let img = host.querySelector(':scope > img.ph-img');
      if (!img) {
        img = document.createElement('img');
        img.className = 'ph-img'; img.alt = ''; img.decoding = 'async'; img.draggable = false;
        if (!opts.eager) img.loading = 'lazy';
        img.onload = () => host.classList.add('ph-on');
        img.onerror = () => { if (img.src !== r.src) img.src = r.src; else host.classList.remove('ph-on'); };
        host.appendChild(img);
      }
      img.title = r.source === 'inaturalist' ? `照片：${r.credit || 'iNaturalist'}` : '照片：Wikimedia Commons（点击查看作者与授权）';
      img.src = opts.big ? r.big : r.src;
      host._ph = r;
    });
  };
  P.upgrade = function (host) {
    const r = host && host._ph, img = r && host.querySelector(':scope > img.ph-img');
    if (img && !host._big) { host._big = true; img.src = r.big; }
  };
  B.photo = P;
})();
