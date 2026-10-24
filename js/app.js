/* 万物 · 核心：路由、星空、详情弹窗、搜索、工具函数 */
window.BIO = window.BIO || {};
(function () {
  const B = BIO;
  B.views = B.views || {};
  B.data = B.data || {};

  /* ---------- 常量 ---------- */
  B.STATUS = {
    LC: { t: '无危', c: '#4ade80' },
    NT: { t: '近危', c: '#bef264' },
    VU: { t: '易危', c: '#facc15' },
    EN: { t: '濒危', c: '#fb923c' },
    CR: { t: '极危', c: '#ff4d6d' },
    EW: { t: '野外灭绝', c: '#c084fc' },
    EX: { t: '已灭绝', c: '#9ca3af' },
    FX: { t: '功能性灭绝', c: '#a1a1aa' },
    DD: { t: '数据缺乏', c: '#7dd3fc' },
    NE: { t: '未评估', c: '#64748b' }
  };
  B.THREATENED = new Set(['VU', 'EN', 'CR', 'EW']);
  B.CATS = {
    mammal: { t: '哺乳类', c: '#ffc24a' },
    bird: { t: '鸟类', c: '#59d8ff' },
    reptile: { t: '爬行类', c: '#ff7a45' },
    amphibian: { t: '两栖类', c: '#c6ff4a' },
    fish: { t: '鱼类', c: '#5b8cff' },
    invert: { t: '无脊椎动物', c: '#ff5fa2' },
    plant: { t: '植物与藻类', c: '#3dff9a' },
    fungi: { t: '真菌', c: '#e8c26a' },
    micro: { t: '微生物', c: '#c58bff' }
  };
  B.REGIONS = {
    all: { t: '全球', rot: null },
    asia: { t: '亚洲', rot: [-100, -32] },
    europe: { t: '欧洲', rot: [-15, -50] },
    africa: { t: '非洲', rot: [-20, 0] },
    namerica: { t: '北美洲', rot: [100, -42] },
    samerica: { t: '南美洲', rot: [62, 16] },
    oceania: { t: '大洋洲', rot: [-150, 28] },
    antarctica: { t: '南极洲', rot: [10, 70] },
    ocean: { t: '海洋', rot: [160, 0] }
  };
  B.VIEW_META = {
    home: { t: '首页', c: '#5ef2ff' },
    map: { t: '地球', c: '#3cf0c8' },
    time: { t: '时间', c: '#ffb547' },
    tree: { t: '生命树', c: '#b78bff' },
    ocean: { t: '深海', c: '#4fb8ff' },
    scale: { t: '尺度', c: '#ff5fa2' },
    redlist: { t: '红色名录', c: '#ff4d6d' },
    all: { t: '万物名录', c: '#6dffb0' }
  };

  /* ---------- 工具 ---------- */
  B.$ = (s, r = document) => r.querySelector(s);
  B.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  B.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  B.h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  B.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // 滚轮统一成像素，并限制单次幅度：不同鼠标 / 触控板一格的数值差很多，有的一格就是几百
  B.wheel = e => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    return B.clamp(d * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1), -100, 100);
  };
  B.lerp = (a, b, t) => a + (b - a) * t;
  // 物种图标：有 emoji 用 emoji，否则用名称首字做发光字符
  B.glyph = (o, cls = '') => o.i ? `<span class="${cls}">${o.i}</span>` : `<span class="${cls} g">${B.esc((o.g || o.n || '?').slice(0, 1))}</span>`;

  // 距今时间（百万年）→ 中文
  B.fmtAgo = function (ma) {
    if (ma >= 100) return `${+(ma / 100).toFixed(ma >= 1000 ? 1 : 2)} 亿年前`;
    if (ma >= 1) return `${+(ma * 100).toFixed(0)} 万年前`;
    if (ma >= 0.01) return `${+(ma * 100).toFixed(1)} 万年前`;
    const year = Math.round(B.NOW_YEAR - ma * 1e6);
    if (year <= 0) return `公元前 ${1 - year} 年`;
    return `公元 ${year} 年`;
  };
  B.NOW_YEAR = new Date().getFullYear();
  B.yearToMa = y => Math.max((B.NOW_YEAR + 0.5 - y) / 1e6, 1e-7);

  // 长度（米）→ 中文
  B.fmtLen = function (m) {
    const u = [[1e3, '公里'], [1, '米'], [1e-2, '厘米'], [1e-3, '毫米'], [1e-6, '微米'], [1e-9, '纳米']];
    for (const [v, n] of u) {
      if (m >= v * 0.9999) {
        const x = m / v;
        return `${x >= 100 ? Math.round(x).toLocaleString('zh-CN') : +x.toPrecision(x >= 10 ? 3 : 2)} ${n}`;
      }
    }
    return `${+(m / 1e-9).toPrecision(2)} 纳米`;
  };

  /* ---------- 提示框 ---------- */
  const tipEl = document.getElementById('tooltip');
  B.tip = (html, x, y) => { tipEl.innerHTML = html; tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px'; tipEl.classList.add('show'); };
  B.untip = () => tipEl.classList.remove('show');

  B.flash = () => { const f = document.getElementById('flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); };

  /* ---------- 星空背景（切换视角时跃迁） ---------- */
  const sf = { c: document.getElementById('starfield'), stars: [], speed: 0.35, target: 0.35, color: [94, 242, 255] };
  sf.ctx = sf.c.getContext('2d');
  function sfResize() {
    const d = 1;  // 星点本来就只有 1–2 像素，高分屏上用 1 倍分辨率看不出区别，填充量少 3/4
    sf.w = innerWidth; sf.h = innerHeight; sf.d = d;
    sf.c.width = sf.w * d; sf.c.height = sf.h * d;
    sf.ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  function sfInit() {
    sfResize();
    const n = Math.round(Math.min(700, (innerWidth * innerHeight) / 2600));
    sf.stars = Array.from({ length: n }, () => ({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: Math.random(), pz: 0, t: Math.random() }));
  }
  function hexToRgb(h) { h = h.trim().replace('#', ''); if (h.length === 3) h = h.split('').map(x => x + x).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  B.warp = (amount = 22) => { sf.speed = amount; };
  let sfTick = 0;
  function sfFrame() {
    requestAnimationFrame(sfFrame);
    // 平稳漂移时隔帧绘制（30 fps 足够）；切换视角跃迁时全速
    if (sf.speed < 1 && Math.abs(sf.target - sf.speed) < 0.05 && (sfTick++ & 1)) return;
    if (B.current === 'ocean' && sf.speed < 1) return;  // 深海视角整屏被海水盖住，星空看不见
    const { ctx, w, h } = sf;
    sf.speed += (sf.target - sf.speed) * 0.045;
    const sp = sf.speed * 0.0016;
    ctx.fillStyle = sf.speed > 2 ? 'rgba(2,4,10,0.35)' : '#02040a';
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, f = Math.max(w, h) * 0.6;
    const [r, g, b] = sf.color;
    for (const s of sf.stars) {
      s.pz = s.z;
      s.z -= sp;
      if (s.z <= 0.02) { s.x = (Math.random() - 0.5) * 2; s.y = (Math.random() - 0.5) * 2; s.z = 1; s.pz = 1; }
      const x = cx + (s.x / s.z) * f * 0.5, y = cy + (s.y / s.z) * f * 0.5;
      if (x < -20 || x > w + 20 || y < -20 || y > h + 20) { s.z = 1; s.pz = 1; continue; }
      const a = Math.min(1, (1 - s.z) * 1.4);
      const tw = 0.75 + 0.25 * Math.sin((s.t += 0.02));
      if (sf.speed > 2) {
        const px = cx + (s.x / s.pz) * f * 0.5, py = cy + (s.y / s.pz) * f * 0.5;
        ctx.strokeStyle = `rgba(${r},${g},${b},${a})`;
        ctx.lineWidth = (1 - s.z) * 2;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
      } else {
        const size = (1 - s.z) * 1.8 + 0.2;
        const mix = s.t % 3 < 1;
        ctx.fillStyle = mix ? `rgba(${r},${g},${b},${a * tw})` : `rgba(230,240,255,${a * tw * 0.9})`;
        ctx.fillRect(x, y, size, size);
      }
    }
  }

  /* ---------- 路由 ---------- */
  const inited = {};
  B.current = null;
  function route() {
    const name = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'home';
    const view = B.VIEW_META[name] ? name : 'home';
    if (view === B.current) return;
    const prev = B.current;
    if (prev && B.views[prev] && B.views[prev].leave) B.views[prev].leave();
    B.current = view;
    document.body.dataset.view = view;
    B.$$('.view').forEach(v => v.classList.toggle('active', v.dataset.view === view));
    B.$$('.nav-links a').forEach(a => a.classList.toggle('on', a.dataset.link === view));
    sf.color = hexToRgb(B.VIEW_META[view].c);
    if (prev) { B.warp(26); B.fx && B.fx.transition(B.VIEW_META[view].c); }
    B.untip();
    const el = document.getElementById('view-' + view);
    const mod = B.views[view];
    if (mod) {
      if (!inited[view]) { inited[view] = true; mod.init && mod.init(el); }
      mod.enter && mod.enter();
    }
    document.title = (view === 'home' ? '' : B.VIEW_META[view].t + ' · ') + '万物 · 地球生命全景图鉴';
  }
  B.go = (view, then) => {
    if (B.current === view) { then && then(); return; }
    location.hash = '#/' + view;
    if (then) setTimeout(then, 450);
  };

  /* ---------- 详情弹窗 ---------- */
  const modal = document.getElementById('modal');
  B.openDetail = function (o) {
    const color = o.color || B.VIEW_META[B.current || 'home'].c;
    modal.style.setProperty('--mc', color);
    B.$('#m-glyph').innerHTML = o.i ? o.i : `<span class="gl">${B.esc((o.g || o.title).slice(0, 1))}</span>`;
    const img = B.$('#m-img'); img.classList.remove('ok'); img.removeAttribute('src'); img.parentElement.classList.remove('has-img');
    B.$('#m-credit').textContent = '';
    B.$('#m-tags').innerHTML = (o.tags || []).map(t => `<span class="tag ${t.solid ? 'solid' : ''}" style="--tc:${t.c || 'var(--line2)'}">${B.esc(t.t)}</span>`).join('');
    B.$('#m-title').textContent = o.title;
    B.$('#m-latin').innerHTML = (o.latin ? B.esc(o.latin) : '') + (o.en ? `<span>${B.esc(o.en)}</span>` : '');
    B.$('#m-stats').innerHTML = (o.stats || []).filter(s => s && s[1]).map(([k, v]) => `<div><small>${B.esc(k)}</small><b>${B.esc(v)}</b></div>`).join('');
    B.$('#m-stats').style.display = (o.stats || []).filter(s => s && s[1]).length ? '' : 'none';
    B.$('#m-desc').textContent = o.desc || '';
    const fact = B.$('#m-fact');
    fact.style.display = o.fact ? '' : 'none';
    fact.querySelector('span').textContent = o.fact || '';
    const acts = B.$('#m-actions'); acts.innerHTML = '';
    (o.actions || []).forEach(a => {
      if (a.href) { acts.insertAdjacentHTML('beforeend', `<a href="${B.esc(a.href)}" target="_blank" rel="noopener">${B.esc(a.label)} ↗</a>`); return; }
      const b = document.createElement('button'); b.textContent = a.label;
      b.onclick = () => { B.closeDetail(); a.fn(); };
      acts.appendChild(b);
    });
    const q = encodeURIComponent(o.title), lq = o.latin ? encodeURIComponent(o.latin.split(/ · | \/ /)[0].replace(/\s+spp?\.?$/i, '')) : '';
    acts.insertAdjacentHTML('beforeend', `<a href="https://zh.wikipedia.org/wiki/${q}" target="_blank" rel="noopener">维基百科 ↗</a><a href="https://baike.baidu.com/item/${q}" target="_blank" rel="noopener">百度百科 ↗</a>`
      + (lq ? `<a href="https://www.inaturalist.org/taxa/search?q=${lq}" target="_blank" rel="noopener">iNaturalist 实拍 ↗</a><a href="https://www.gbif.org/species/search?q=${lq}" target="_blank" rel="noopener">GBIF 分布记录 ↗</a>` : ''));
    modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
    const token = (B._mtoken = (B._mtoken || 0) + 1);
    const credit = B.$('#m-credit');
    credit.innerHTML = '<span class="m-loading">正在从原始来源查找照片…</span>';
    (o.photoResult !== undefined ? Promise.resolve(o.photoResult) : B.photo.get(o.photo || { l: o.latin, e: o.wiki || o.en }, true)).then(r => {
      if (token !== B._mtoken) return;
      if (!r) { credit.innerHTML = '<span class="m-loading done">暂未找到可公开引用的照片</span>'; return; }
      img.onload = () => {
        if (token !== B._mtoken) return;
        img.classList.add('ok'); img.parentElement.classList.add('has-img');
        credit.innerHTML = `<a href="${B.esc(r.page)}" target="_blank" rel="noopener">${({ inaturalist: 'iNaturalist', commons: 'Wikimedia Commons' })[r.source] || 'Wikipedia'} · ${B.esc(r.title)} ↗</a>`;
        B.photo.credit(r).then(c => {
          if (!c || token !== B._mtoken) return;
          credit.innerHTML = `<a href="${B.esc(c.link)}" target="_blank" rel="noopener" title="查看原图、作者与授权">📷 ${B.esc(c.text)}<em>${B.esc(c.site)} ↗</em></a>`;
        });
      };
      img.onerror = () => { if (img.src !== r.src) img.src = r.src; };
      img.src = r.big;
    });
  };
  /* iNaturalist 物种详情（任何生物） */
  const ICON = { Plantae: ['植物', '#3dff9a'], Fungi: ['真菌', '#e8c26a'], Insecta: ['昆虫', '#ff5fa2'], Aves: ['鸟类', '#59d8ff'], Mammalia: ['哺乳类', '#ffc24a'], Reptilia: ['爬行类', '#ff7a45'], Amphibia: ['两栖类', '#c6ff4a'], Actinopterygii: ['鱼类', '#5b8cff'], Mollusca: ['软体动物', '#ff8fd1'], Arachnida: ['蛛形纲', '#ff5f7e'], Animalia: ['其他动物', '#ff5fa2'], Protozoa: ['原生生物', '#c58bff'], Chromista: ['色藻', '#c58bff'] };
  const RANKS = { species: '种', genus: '属', family: '科', order: '目', class: '纲', phylum: '门', kingdom: '界', subspecies: '亚种', variety: '变种' };
  B.openTaxon = function (t) {
    const ph = t.default_photo, ic = ICON[t.iconic_taxon_name] || ['生物', '#5ef2ff'];
    const name = t.preferred_common_name || t.name;
    const pr = ph ? { src: ph.medium_url, big: (ph.medium_url || '').replace('/medium.', '/large.'), credit: ph.attribution, license: (ph.license_code || '').toUpperCase(), page: `https://www.inaturalist.org/taxa/${t.id}`, photoPage: `https://www.inaturalist.org/photos/${ph.id}`, title: t.name, source: 'inaturalist' } : null;
    B.openDetail({ photoResult: pr, g: name, color: ic[1], title: name, latin: t.name,
      tags: [{ t: ic[0], c: ic[1] }, { t: `分类等级 · ${RANKS[t.rank] || t.rank}` }, { t: 'iNaturalist 实时数据', c: '#74ac00', solid: true }],
      stats: [['全球观测记录', `${(t.observations_count || 0).toLocaleString('zh-CN')} 次`]],
      desc: '正在从 iNaturalist 读取简介…',
      actions: [{ label: '在万物名录中定位', fn: () => B.go('all', () => B.views.all.openId(t.id)) }, { label: '在 iNaturalist 查看观测地图', href: `https://www.inaturalist.org/taxa/${t.id}` }] });
    const token = B._mtoken;
    fetch(`https://api.inaturalist.org/v1/taxa/${t.id}?locale=zh-CN`).then(r => r.json()).then(j => {
      const x = j.results && j.results[0];
      if (!x || token !== B._mtoken) return;
      const sum = (x.wikipedia_summary || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      B.$('#m-desc').textContent = sum || '暂无简介。iNaturalist 的数据来自全世界的公民科学家与研究者，点击下方链接可查看它的观测地图与更多照片。';
      const path = (x.ancestors || []).filter(a => ['kingdom', 'phylum', 'class', 'order', 'family'].includes(a.rank)).map(a => a.preferred_common_name || a.name).join(' › ');
      const cs = x.conservation_status;
      const extra = [['分类路径', path], ['保护状态', cs ? `${cs.status_name || cs.status}${cs.authority ? '（' + cs.authority + '）' : ''}` : null]];
      B.$('#m-stats').insertAdjacentHTML('beforeend', extra.filter(s => s[1]).map(([k, v]) => `<div><small>${B.esc(k)}</small><b>${B.esc(v)}</b></div>`).join(''));
    }).catch(() => { if (token === B._mtoken) B.$('#m-desc').textContent = '无法连接 iNaturalist 读取简介。'; });
  };
  B.closeDetail = () => { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); B._mtoken++; };
  modal.addEventListener('click', e => { if (e.target.closest('[data-close]')) B.closeDetail(); });

  /* ---------- 搜索面板 ---------- */
  const pal = document.getElementById('palette'), pq = document.getElementById('palette-q'), plist = document.getElementById('palette-list');
  let palIndex = null, palItems = [], palSel = 0;
  function buildIndex() {
    palIndex = [];
    for (const k of Object.keys(B.views)) {
      const m = B.views[k];
      if (m.index) m.index().forEach(e => palIndex.push(Object.assign({ view: k }, e, { key: [e.title, e.en, e.latin, e.sub, e.kw].filter(Boolean).join(' ').toLowerCase() })));
    }
  }
  function renderPal() {
    const q = pq.value.trim().toLowerCase();
    let res;
    if (!q) {
      const picks = ['大熊猫', '霸王龙', '蓝鲸', '渡渡鸟', '吸血鬼乌贼', '缓步动物', '真菌', '白鳍豚', '朱鹮 的复兴', '极危', '墨西哥钝口螈', '人类'];
      res = picks.map(p => palIndex.find(e => e.title === p || e.title.startsWith(p))).filter(Boolean);
      plist.innerHTML = '<li class="ph">热门探索</li>';
    } else {
      res = palIndex.map(e => {
        const t = e.title.toLowerCase();
        const s = t === q ? 100 : t.startsWith(q) ? 80 : t.includes(q) ? 60 : e.key.includes(q) ? 30 : 0;
        return [s, e];
      }).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, 40).map(x => x[1]);
      plist.innerHTML = '';
    }
    palItems = res; palSel = 0;
    if (q) searchInat(q);
    if (!res.length) { plist.innerHTML = '<li class="empty">本站名录中没有匹配，正在全球物种库中查找…</li>'; return; }
    res.forEach((e, i) => {
      const vm = B.VIEW_META[e.view] || { t: 'iNat', c: '#74ac00' };
      const li = B.h(`<li data-i="${i}"><span class="pi"><span>${e.i || B.esc(e.title.slice(0, 1))}</span></span><span class="pt"><b>${B.esc(e.title)}</b><small>${B.esc(e.sub || e.latin || '')}</small></span><span class="pv" style="--pc:${vm.c}">${vm.t}</span></li>`);
      li.onmouseenter = () => { palSel = i; markSel(); };
      li.onclick = () => choose(i);
      if (e.ph) B.photo.fill(li.querySelector('.pi'), e.ph);
      plist.appendChild(li);
    });
    markSel();
  }
  /* 全球物种库：iNaturalist 实时搜索（任何生物都能找到） */
  let inatTimer = 0, inatToken = 0;
  function searchInat(q) {
    clearTimeout(inatTimer);
    const token = ++inatToken;
    inatTimer = setTimeout(() => {
      fetch(`https://api.inaturalist.org/v1/taxa/autocomplete?q=${encodeURIComponent(q)}&locale=zh-CN&per_page=10&is_active=true`).then(r => r.json()).then(j => {
        if (token !== inatToken || !pal.classList.contains('open')) return;
        const res = (j.results || []);
        const empty = B.$('li.empty', plist); if (empty) empty.remove();
        if (!res.length) { if (!palItems.length) plist.innerHTML = '<li class="empty">没有找到匹配的生物，换个关键词试试</li>'; return; }
        plist.insertAdjacentHTML('beforeend', '<li class="ph">全球物种库 · iNaturalist 实时（超过 50 万个物种）</li>');
        const RK = { species: '种', genus: '属', family: '科', order: '目', class: '纲', phylum: '门', kingdom: '界', subspecies: '亚种' };
        res.forEach(t => {
          const i = palItems.length;
          palItems.push({ title: t.preferred_common_name || t.name, view: null, go: () => B.openTaxon(t) });
          const ph = t.default_photo;
          const li = B.h(`<li data-i="${i}"><span class="pi">${ph ? `<img class="ph-img" style="opacity:1" src="${B.esc(ph.square_url)}" alt="">` : '<span>🌐</span>'}</span><span class="pt"><b>${B.esc(t.preferred_common_name || t.name)}</b><small>${B.esc(t.name)} · ${RK[t.rank] || t.rank} · ${(t.observations_count || 0).toLocaleString('zh-CN')} 次观测</small></span><span class="pv" style="--pc:#74ac00">iNat</span></li>`);
          li.onmouseenter = () => { palSel = i; markSel(); };
          li.onclick = () => choose(i);
          plist.appendChild(li);
        });
        if (!B.$('li.sel', plist)) markSel();
      }).catch(() => {});
    }, 320);
  }
  function markSel() { B.$$('li[data-i]', plist).forEach(li => li.classList.toggle('sel', +li.dataset.i === palSel)); const s = B.$('li.sel', plist); s && s.scrollIntoView({ block: 'nearest' }); }
  function choose(i) { const e = palItems[i]; if (!e) return; closePal(); if (!e.view) e.go(); else B.go(e.view, () => e.go()); }
  function openPal() { if (!palIndex) buildIndex(); pal.classList.add('open'); pq.value = ''; renderPal(); setTimeout(() => pq.focus(), 30); }
  function closePal() { pal.classList.remove('open'); pq.blur(); }
  B.openSearch = openPal;
  pq.addEventListener('input', renderPal);
  pq.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { palSel = Math.min(palItems.length - 1, palSel + 1); markSel(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { palSel = Math.max(0, palSel - 1); markSel(); e.preventDefault(); }
    else if (e.key === 'Enter') { choose(palSel); }
  });
  pal.addEventListener('click', e => { if (e.target.closest('[data-close]')) closePal(); });
  document.getElementById('open-palette').onclick = openPal;

  /* ---------- 键盘 ---------- */
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.classList.contains('open') ? closePal() : openPal(); return; }
    const qrOpen = document.getElementById('qr').classList.contains('open');
    if (e.key === 'Escape') { if (qrOpen) { B.closeQR(); return; } if (pal.classList.contains('open')) { closePal(); return; } if (modal.classList.contains('open')) { B.closeDetail(); return; } }
    if (/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName) || pal.classList.contains('open') || modal.classList.contains('open') || qrOpen) return;
    const map = { '1': 'map', '2': 'time', '3': 'tree', '4': 'ocean', '5': 'scale', '6': 'redlist', '7': 'all', '0': 'home' };
    if (map[e.key] && !e.metaKey && !e.ctrlKey && !e.altKey) location.hash = '#/' + map[e.key];
    const m = B.views[B.current]; m && m.key && m.key(e);
  });

  /* ---------- 启动 ---------- */
  B.boot = function () {
    window.BIO_BOOTED = true;
    sfInit(); requestAnimationFrame(sfFrame);
    addEventListener('resize', () => { sfResize(); });
    addEventListener('hashchange', route);
    const pct = document.getElementById('loader-pct');
    let p = 0; const t0 = performance.now();
    const t = setInterval(() => {
      p = Math.min(100, Math.max(p + 4, (performance.now() - t0) / 9));
      pct.textContent = Math.round(p);
      if (p >= 100) {
        clearInterval(t);
        document.getElementById('loader').classList.add('done');
        route();
        B.warp(30);
      }
    }, 60);
  };
})();
