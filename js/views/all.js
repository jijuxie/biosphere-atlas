/* 万物视角：全部生物。实时浏览 iNaturalist 全球分类库——从“生命”根节点一路下钻到任意一个物种 */
(function () {
  const B = BIO;
  const V = {};
  const API = 'https://api.inaturalist.org/v1';
  const ROOT = { id: 48460, name: 'Life', preferred_common_name: '生命', rank: 'stateofmatter' };
  const RANKS = { stateofmatter: '根', kingdom: '界', subkingdom: '亚界', phylum: '门', subphylum: '亚门', superclass: '总纲', class: '纲', subclass: '亚纲', infraclass: '下纲', superorder: '总目', order: '目', suborder: '亚目', infraorder: '下目', parvorder: '小目', superfamily: '总科', epifamily: '领科', family: '科', subfamily: '亚科', supertribe: '总族', tribe: '族', subtribe: '亚族', genus: '属', genushybrid: '杂交属', subgenus: '亚属', section: '组', subsection: '亚组', complex: '复合种', species: '种', hybrid: '杂交种', subspecies: '亚种', variety: '变种', form: '型', infrahybrid: '种下杂交' };
  const LEAF = new Set(['species', 'hybrid', 'subspecies', 'variety', 'form', 'infrahybrid']);
  const COLOR = { Animalia: '#ff5fa2', Plantae: '#3dff9a', Fungi: '#e8c26a', Chromista: '#c58bff', Protozoa: '#a17bff', Bacteria: '#5ef2ff', Archaea: '#ffb547', Viruses: '#ff4d6d' };
  // 八个界的快捷入口（iNaturalist 分类号）
  const KINGS = [
    { id: 1, name: 'Animalia', zh: '动物', i: '🦋' }, { id: 47126, name: 'Plantae', zh: '植物', i: '🌿' }, { id: 47170, name: 'Fungi', zh: '真菌', i: '🍄' },
    { id: 48222, name: 'Chromista', zh: '色藻', i: '🌊' }, { id: 47686, name: 'Protozoa', zh: '原生动物', i: '🔬' }, { id: 67333, name: 'Bacteria', zh: '细菌', i: '🦠' },
    { id: 151817, name: 'Archaea', zh: '古菌', i: '♨️' }, { id: 131236, name: 'Viruses', zh: '病毒', i: '🧬' }
  ];
  // 分类阶梯：界门纲目科属种
  const LADDER = [[70, '界'], [60, '门'], [50, '纲'], [40, '目'], [30, '科'], [20, '属'], [10, '种']];
  const PER = 60;
  let root, crumbEl, headEl, gridEl, moreEl, sortEl, kingEl, path = [ROOT], page = 1, total = 0, token = 0, order = 'observations_count';
  const countCache = new Map();

  const nm = t => t.preferred_common_name || t.name;
  const get = url => fetch(url, { signal: AbortSignal.timeout(20000) }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  const fmt = n => n.toLocaleString('zh-CN');

  // 计数请求排队，最多 3 个同时进行：一屏几十张卡片同时请求会触发 iNaturalist 限流（约每分钟 60 次）
  const queue = []; let active = 0;
  function limited(fn) { return new Promise((res, rej) => { queue.push([fn, res, rej]); pump(); }); }
  function pump() { while (active < 3 && queue.length) { const [fn, res, rej] = queue.shift(); active++; fn().then(res, rej).finally(() => { active--; pump(); }); } }

  // 某个类群下的物种总数（只统计“种”这一级、仍被承认的分类单元）
  function speciesCount(id) {
    if (!countCache.has(id)) countCache.set(id, limited(() => get(`${API}/taxa?taxon_id=${id}&rank=species&is_active=true&per_page=0`)).then(j => j.total_results).catch(() => { countCache.delete(id); return null; }));
    return countCache.get(id);
  }

  const colorOf = t => COLOR[t.name] || COLOR[(path[1] || {}).name] || '#5ef2ff';
  const photoOf = t => t.default_photo && (t.default_photo.medium_url || t.default_photo.square_url);

  function crumbs() {
    crumbEl.innerHTML = path.map((t, i) => `<button data-i="${i}" class="${i === path.length - 1 ? 'on' : ''}"><small>${RANKS[t.rank] || t.rank}</small>${B.esc(nm(t))}</button>`).join('<i></i>');
    const k = path[1] && path[1].name;
    B.$$('button', kingEl).forEach(b => b.classList.toggle('on', b.dataset.k === k));
  }

  // 当前类群的头图：照片做模糊背景，圆形主图，分类阶梯，iNaturalist 的中文简介
  function head(cur, tk) {
    const ph = photoOf(cur), lv = cur.rank_level || 100, isRoot = cur.id === ROOT.id;
    const ladder = LADDER.map(([l, z]) => `<span class="${lv <= l ? 'lit' : ''} ${lv <= l && lv > l - 10 ? 'cur' : ''}"><i></i>${z}</span>`).join('');
    headEl.innerHTML = `<div class="al-hbg" ${ph ? `style="background-image:url('${B.esc(ph)}')"` : ''}></div>
      <div class="al-hpic ${ph ? '' : 'none'}">${ph ? `<img src="${B.esc(ph)}" alt="">` : `<b>${isRoot ? '生' : B.esc(nm(cur).slice(0, 1))}</b>`}<em>${RANKS[cur.rank] || cur.rank}</em></div>
      <div class="al-hmain">
        <div class="al-rank">${isRoot ? 'ROOT · 所有生命' : `${RANKS[cur.rank] || cur.rank} · ${String(cur.rank).toUpperCase()}`}</div>
        <h3>${B.esc(nm(cur))}<small>${B.esc(cur.name)}</small></h3>
        <div class="al-ladder">${ladder}</div>
        <p class="al-sum">${isRoot ? '地球上的一切生命——从你肠道里的细菌到 100 米高的红杉——都在这棵分类树上。点下面任意一个类群，开始下钻。' : ''}</p>
      </div>
      <div class="al-cnt"><b data-sc>…</b><span>个已命名物种</span></div>
      <div class="al-ops">${path.length > 1 ? '<button data-up>↑ 上一级</button>' : ''}<button data-rand class="hot">🎲 随机遇见一个物种</button>${!isRoot ? '<button data-info>ⓘ 完整介绍</button>' : ''}</div>`;
    const img = B.$('.al-hpic img', headEl); if (img) img.onload = () => img.classList.add('in');
    if (isRoot) return;
    // 补全照片与简介（从面包屑或界入口进来时可能没有）
    const fill = d => {
      if (tk !== token) return;
      if (!ph && photoOf(d)) { cur.default_photo = d.default_photo; head(cur, tk); speciesCount(cur.id).then(n => { if (tk === token) B.$('[data-sc]', headEl).textContent = n == null ? '—' : fmt(n); }); return; }
      // iNaturalist 给的中文简介常是繁体，改从中文维基百科取简体版；取不到再用它
      const put = txt => { const el = B.$('.al-sum', headEl); if (tk === token && el && txt) { el.textContent = txt; el.classList.add('in'); } };
      const m = (d.wikipedia_url || '').match(/zh\.wikipedia\.org\/wiki\/(.+)$/), title = m ? decodeURIComponent(m[1]) : d.name;
      if (cur._sum != null) return put(cur._sum);
      get(`https://zh.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exsentences=3&redirects=1&variant=zh-cn&format=json&origin=*&titles=${encodeURIComponent(title)}`)
        .then(j => Object.values((j.query || {}).pages || {})[0].extract || '').catch(() => '')
        .then(txt => { cur._sum = txt.trim() || (d.wikipedia_summary || '').replace(/<[^>]+>/g, '').trim(); put(cur._sum); });
    };
    if (cur._d) fill(cur._d);
    else get(`${API}/taxa/${cur.id}?locale=zh-CN`).then(j => { cur._d = j.results && j.results[0]; cur._d && fill(cur._d); }).catch(() => {});
  }

  function open(t) {
    if (LEAF.has(t.rank)) { B.openTaxon(t); return; }
    path.push(t); load();
  }

  function load() {
    const cur = path[path.length - 1], tk = ++token;
    page = 1; total = 0;
    crumbs();
    const kc = COLOR[(path[1] || {}).name] || '#5ef2ff';
    root.style.setProperty('--ac', kc);
    head(cur, tk);
    speciesCount(cur.id).then(n => { if (tk !== token) return; const el = B.$('[data-sc]', headEl); n == null ? (el.textContent = '—') : B.live.countUp(el, n, 900); });
    gridEl.innerHTML = Array.from({ length: 12 }, () => '<div class="al-card al-skel"><span class="al-img"></span><span class="al-txt"><b></b><i></i></span></div>').join('');
    moreEl.hidden = true;
    fetchPage(tk);
    B.$('.al-scroll', root).scrollTop = 0;
  }

  function fetchPage(tk) {
    const cur = path[path.length - 1];
    get(`${API}/taxa?parent_id=${cur.id}&is_active=true&locale=zh-CN&per_page=${PER}&page=${page}&order_by=${order}&order=${order === 'name' ? 'asc' : 'desc'}`).then(j => {
      if (tk !== token) return;
      if (page === 1) { gridEl.innerHTML = ''; nCard = 0; }
      total = j.total_results || 0;
      if (!total) gridEl.innerHTML = '<p class="al-msg">这一级之下没有更细的分类了。</p>';
      (j.results || []).forEach(card);
      const shown = B.$$('.al-card', gridEl).length;
      moreEl.hidden = shown >= total;
      moreEl.textContent = `再显示 ${Math.min(PER, total - shown)} 个（已显示 ${fmt(shown)} / ${fmt(total)}）`;
      const te = B.$('[data-total]', root); if (te) te.textContent = total ? `共 ${fmt(total)} 个` : '';
    }).catch(() => { if (tk === token) gridEl.innerHTML = '<p class="al-msg">无法连接 iNaturalist。这个视角需要联网，请检查网络后重试。</p>'; });
  }

  let nCard = 0;
  function card(t) {
    const ph = photoOf(t), leaf = LEAF.has(t.rank), kc = colorOf(t);
    const el = B.h(`<button class="al-card ${leaf ? 'leaf' : ''} ${t.extinct ? 'ext' : ''}" style="--kc:${kc};--d:${Math.min(nCard++ % PER, 24) * 28}ms">
      <span class="al-img">${ph ? `<img loading="lazy" decoding="async" src="${B.esc(ph)}" alt="">` : `<span class="g">${B.esc(nm(t).slice(0, 1))}</span>`}</span>
      <span class="al-badge">${RANKS[t.rank] || t.rank}${t.extinct ? ' · 已灭绝' : ''}</span>
      <span class="al-num">${leaf ? `◉ ${B.live.fmt(t.observations_count || 0)} 次观测` : '<span data-n>…</span> 种'}</span>
      <span class="al-txt"><b>${B.esc(nm(t))}</b><i>${B.esc(t.name)}</i><em>${leaf ? '查看物种 ›' : '进入下一级 ›'}</em></span></button>`);
    const img = B.$('img', el); if (img) { img.onload = () => img.classList.add('in'); img.onerror = () => el.classList.add('noimg'); }
    el.onclick = () => open(t);
    if (!leaf) {
      const n = B.$('[data-n]', el);
      // 只在卡片进入视口时才去数物种，避免一次发出几十个请求
      const io = new IntersectionObserver(es => {
        if (!es[0].isIntersecting) return; io.disconnect();
        speciesCount(t.id).then(c => { n.textContent = c == null ? '?' : fmt(c); });
      });
      io.observe(el);
    }
    gridEl.appendChild(el);
  }

  // 随机：在当前类群的所有物种里随机抽一个
  function random() {
    const cur = path[path.length - 1];
    speciesCount(cur.id).then(n => {
      if (!n) return;
      const i = 1 + Math.floor(Math.random() * Math.min(n, 10000));
      return get(`${API}/taxa?taxon_id=${cur.id}&rank=species&is_active=true&locale=zh-CN&per_page=1&page=${i}&order_by=observations_count&order=desc`).then(j => { const t = j.results && j.results[0]; t && B.openTaxon(t); });
    }).catch(() => {});
  }

  V.init = function (el) {
    root = el;
    el.innerHTML = `<div class="al-scroll"><div class="al-aurora"><i></i><i></i><i></i></div><div class="al-wrap">
      <header class="al-hero">
        <div class="al-live"><span class="pulse-dot"></span>LIVE · iNaturalist 全球分类库</div>
        <h2 class="al-title"><small>EVERY LIVING THING</small>万物名录</h2>
        <p class="section-sub">动物、植物、真菌、色藻、原生生物、细菌、古菌与病毒——从“生命”出发逐级下钻，可以找到人类已命名的任何一种生物。</p>
        <div class="al-kings">${KINGS.map(k => `<button data-k="${k.name}" style="--kc:${COLOR[k.name]}"><span>${k.i}</span><b>${k.zh}</b><i>${k.name}</i></button>`).join('')}</div>
      </header>
      <nav class="al-crumbs"></nav>
      <div class="al-head"></div>
      <div class="al-bar"><span><b>下一级类群</b><em data-total></em></span><div class="al-seg" role="group" aria-label="排序"><button data-o="observations_count" class="on">按观测热度</button><button data-o="name">按学名</button></div><select hidden aria-hidden="true"><option value="observations_count">按观测次数</option><option value="name">按学名</option></select></div>
      <div class="al-grid"></div>
      <button class="al-more" hidden></button>
      <p class="al-src">数据与照片：iNaturalist（照片版权归各自作者）。中文名来自 iNaturalist 社区，部分类群只有学名。</p>
    </div></div>`;
    kingEl = B.$('.al-kings', el);
    kingEl.onclick = e => { const b = e.target.closest('button'); if (!b) return; const k = KINGS.find(x => x.name === b.dataset.k); path = [ROOT, { id: k.id, name: k.name, preferred_common_name: k.zh, rank: 'kingdom', rank_level: 70 }]; load(); B.$('.al-crumbs', el).scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    B.$('.al-seg', el).onclick = e => { const b = e.target.closest('button'); if (!b || b.classList.contains('on')) return; B.$$('.al-seg button', el).forEach(x => x.classList.toggle('on', x === b)); order = b.dataset.o; load(); };
    crumbEl = B.$('.al-crumbs', el); headEl = B.$('.al-head', el); gridEl = B.$('.al-grid', el); moreEl = B.$('.al-more', el); sortEl = B.$('.al-bar select', el);
    crumbEl.onclick = e => { const b = e.target.closest('button'); if (!b) return; path = path.slice(0, +b.dataset.i + 1); load(); };
    headEl.onclick = e => {
      if (e.target.closest('[data-up]')) { path.pop(); load(); }
      else if (e.target.closest('[data-rand]')) random();
      else if (e.target.closest('[data-info]')) B.openTaxon(path[path.length - 1]);
    };
    moreEl.onclick = () => { page++; fetchPage(token); };
    sortEl.onchange = () => { order = sortEl.value; load(); };
    load();
  };
  V.key = function (e) { if (e.key === 'Backspace' && path.length > 1) { path.pop(); load(); } };
  // 供搜索面板直达：打开某个类群
  V.openId = function (id) {
    get(`${API}/taxa/${id}?locale=zh-CN`).then(j => {
      const t = j.results[0];
      path = [ROOT].concat((t.ancestors || []).filter(a => a.id !== ROOT.id)).concat(LEAF.has(t.rank) ? [] : [t]);
      load();
      if (LEAF.has(t.rank)) B.openTaxon(t);
    });
  };
  V.index = () => [{ title: '万物名录', sub: '全部生物 · iNaturalist 分类库', kw: 'all life 全部 所有 生物 细菌 病毒 古菌 原生生物', i: '🌐', go: () => {} }];

  V.RANKS = RANKS; V.LEAF = LEAF;
  B.views.all = V;
})();
