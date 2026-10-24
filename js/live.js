/* 实时生物抽屉：各视角共用的侧边面板，展示来自 iNaturalist / OBIS / PBDB / Wikidata 的完整物种名单 */
(function () {
  const B = BIO;
  const L = {};
  const fmt = n => (n || 0).toLocaleString('zh-CN');

  // 按学名打开详情：先在 iNaturalist 精确匹配（有中文名、简介和照片），找不到再用通用详情
  L.openName = function (latin, fb = {}) {
    const name = String(latin || '').trim();
    fetch(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(name)}&is_active=true&locale=zh-CN&per_page=10`).then(r => r.json()).then(j => {
      const t = (j.results || []).find(x => x.name.toLowerCase() === name.toLowerCase());
      if (t) return B.openTaxon(t);
      throw 0;
    }).catch(() => B.openDetail(Object.assign({ title: fb.title || name, latin: name, g: fb.title || name, photo: { l: name }, tags: fb.tags, stats: fb.stats, desc: fb.desc || '暂无更多资料。可以通过下方链接在维基百科、iNaturalist 或 GBIF 中继续查阅。' }, fb.color ? { color: fb.color } : {})));
  };

  // 学名 → 中文名：一次 Wikidata 查询批量取回（优先简体）
  const zhCache = new Map();
  L.zhNames = function (names) {
    const need = [...new Set(names)].filter(n => n && !zhCache.has(n) && !/["\\]/.test(n));
    if (!need.length) return Promise.resolve(zhCache);
    const q = `SELECT ?la ?zh WHERE { VALUES ?la { ${need.map(n => JSON.stringify(n)).join(' ')} } ?item wdt:P225 ?la . ?item rdfs:label ?zh FILTER(LANG(?zh) IN ("zh-hans", "zh-cn", "zh")) }`;
    return fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q)).then(r => r.json()).then(j => {
      const rank = { 'zh-hans': 3, 'zh-cn': 2, zh: 1 }, best = {};
      j.results.bindings.forEach(b => { const la = b.la.value, l = b.zh['xml:lang'], v = b.zh.value; if (v !== la && (!best[la] || rank[l] > best[la][0])) best[la] = [rank[l], v]; });
      need.forEach(n => zhCache.set(n, best[n] ? best[n][1] : null));
      return zhCache;
    }).catch(() => zhCache);
  };

  /* ---------- 醒目的“全部生物”入口按钮（各视角共用） ---------- */
  // 数字滚动到新值
  L.countUp = function (el, to, dur = 900) {
    if (!el) return;
    const from = +(el.dataset.v || 0), t0 = performance.now();
    el.dataset.v = to;
    cancelAnimationFrame(el._raf);
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(from + (to - from) * e));
      if (k < 1) el._raf = requestAnimationFrame(step);
    };
    if (document.hidden) el.textContent = fmt(to); else el._raf = requestAnimationFrame(step);
  };
  // o: { title, kicker, unit, color, cls }，返回按钮；用 set({ title, color, n, unit }) 更新
  L.cta = function (o) {
    const b = B.h(`<button type="button" class="cta-live ${o.cls || ''}"><span class="cta-ring" aria-hidden="true"></span><i class="cta-dot" aria-hidden="true"></i>
      <span class="cta-t"><small>${B.esc(o.kicker || 'LIVE · 全部生物')}</small><b></b></span><span class="cta-n"><em>…</em><small></small></span><span class="cta-go" aria-hidden="true">→</span></button>`);
    const tEl = B.$('.cta-t b', b), nEl = B.$('.cta-n em', b), uEl = B.$('.cta-n small', b);
    b.set = function (x) {
      if (x.title != null) tEl.textContent = x.title;
      if (x.color) b.style.setProperty('--cc', x.color);
      if (x.unit != null) uEl.textContent = x.unit;
      if (x.n === null) { nEl.textContent = '…'; nEl.dataset.v = 0; }
      else if (typeof x.n === 'number') L.countUp(nEl, x.n);
      else if (x.n != null) nEl.textContent = x.n;
      if (x.n !== undefined) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
    };
    b.set({ title: o.title, color: o.color, unit: o.unit != null ? o.unit : '种' });
    return b;
  };

  // 在 host 中创建一个抽屉；show() 传入 load(page) => Promise<{ total, items, more }>
  L.panel = function (host) {
    const el = B.h(`<aside class="lv glass" aria-hidden="true">
      <div class="lv-h"><div><small class="lv-k"></small><b class="lv-t"></b><span class="lv-s"></span></div><button type="button" class="lv-x" aria-label="关闭">✕</button></div>
      <div class="lv-sum"></div>
      <div class="lv-grid"></div>
      <button type="button" class="lv-more" hidden>加载更多</button>
      <p class="lv-src"></p></aside>`);
    host.appendChild(el);
    const grid = B.$('.lv-grid', el), more = B.$('.lv-more', el), sum = B.$('.lv-sum', el);
    let cur = null, page = 1, token = 0, shown = 0;
    const api = { el, isOpen: () => el.classList.contains('show'), key: () => cur && cur.key };

    function fetchPage() {
      const tk = token;
      more.disabled = true; more.textContent = '加载中…';
      // 数据源偶尔会卡住不返回：25 秒没结果就显示“重试”，不让面板一直转圈
      Promise.race([cur.load(page), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 25000))]).then(r => {
        if (tk !== token) return;
        if (page === 1) grid.innerHTML = '';
        if (!r.items.length && page === 1) { grid.innerHTML = `<div class="lv-msg">${cur.empty || '这里暂时没有记录。'}</div>`; }
        const latinOnly = [];
        r.items.forEach(it => {
          const card = B.h(`<button type="button" class="lv-card" style="--d:${Math.min(shown % 60, 24) * 25}ms">
            <span class="lv-ph">${it.img ? `<img src="${B.esc(it.img)}" alt="" loading="lazy">` : it.icon ? `<img class="sil" src="${B.esc(it.icon)}" alt="" loading="lazy">` : `<span class="g">${B.esc((it.name || '?').slice(0, 1))}</span>`}</span>
            <b>${B.esc(it.name)}</b>${it.latin && it.latin !== it.name ? `<i>${B.esc(it.latin)}</i>` : ''}<small>${B.esc(it.meta || '')}</small></button>`);
          if (!it.img && it.ph) B.photo.fill(B.$('.lv-ph', card), it.ph);
          if (it.imgFit) card.classList.add('fit');
          card.onclick = it.open;
          grid.appendChild(card); shown++;
          if (it.name === it.latin) latinOnly.push([card, it.latin]);
        });
        if (latinOnly.length) L.zhNames(latinOnly.map(x => x[1])).then(m => {
          if (tk !== token) return;
          latinOnly.forEach(([card, la]) => { const zh = m.get(la); if (zh) { B.$('b', card).textContent = zh; B.$('b', card).insertAdjacentHTML('afterend', `<i>${B.esc(la)}</i>`); } });
        });
        if (r.total != null) {
          sum.innerHTML = cur.summary ? cur.summary(r.total) : `共 <b>${fmt(r.total)}</b> 种`;
          if (page === 1) B.$$('b', sum).forEach(e => { const v = +e.textContent.replace(/,/g, ''); if (v > 0) { e.dataset.v = 0; L.countUp(e, v, 1100); } });
        }
        more.hidden = !r.more; more.disabled = false; more.textContent = '加载更多';
      }).catch(() => { if (tk === token) { if (page === 1) grid.innerHTML = '<div class="lv-msg">无法连接数据源，请检查网络后重试。</div>'; more.disabled = false; more.textContent = '重试'; page = Math.max(1, page); } });
    }
    api.show = function (o) {
      cur = o; page = 1; shown = 0; token++;
      el.style.setProperty('--lc', o.color || 'var(--accent)');
      B.$('.lv-k', el).textContent = o.kicker || 'LIVE';
      B.$('.lv-t', el).textContent = o.title;
      B.$('.lv-s', el).textContent = o.sub || '';
      B.$('.lv-src', el).textContent = o.source || '';
      sum.textContent = '';
      grid.innerHTML = '<div class="lv-skel"></div>'.repeat(12);
      more.hidden = true;
      el.classList.add('show'); el.setAttribute('aria-hidden', 'false');
      host.classList.add('lv-on');
      fetchPage();
    };
    api.hide = function () { token++; cur = null; el.classList.remove('show'); el.setAttribute('aria-hidden', 'true'); host.classList.remove('lv-on'); };
    more.onclick = () => { page++; fetchPage(); };
    B.$('.lv-x', el).onclick = api.hide;
    // 面板内的点击不要冒泡到视图（避免触发视图自己的点击特效或取消选中）
    el.addEventListener('click', e => e.stopPropagation());
    el.addEventListener('pointerdown', e => e.stopPropagation());
    el.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
    return api;
  };

  /* ---------- 数据源 ---------- */
  const INAT = 'https://api.inaturalist.org/v1';
  const inatItem = (t, meta) => ({ name: t.preferred_common_name || t.name, latin: t.name, meta, img: t.default_photo && (t.default_photo.square_url || '').replace('/square.', '/small.'), open: () => B.openTaxon(t) });
  // iNaturalist：按条件统计被观测到的物种（species_counts）
  L.inatCounts = (query, per = 60) => page => fetch(`${INAT}/observations/species_counts?${query}&per_page=${per}&page=${page}&locale=zh-CN`).then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(j => ({ total: j.total_results, items: (j.results || []).filter(r => r.taxon).map(r => inatItem(r.taxon, `${fmt(r.count)} 次观测`)), more: page * per < Math.min(j.total_results, 10000) }));
  L.inatItem = inatItem;
  L.fmt = fmt;

  B.live = L;
})();
