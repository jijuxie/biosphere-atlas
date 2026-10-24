/* 生命树视角：径向系统发育树，路径高亮、缩放聚焦与沿枝流动的“生命之光” */
(function () {
  const B = BIO;
  const V = {};
  let root, cv, ctx, sel, zoom, hier, nodes, links, info, W, H, R, fx, fctx, dpr = 1;
  let locked = null, running = false, raf = 0, sparks = [], drawn = false, panel;
  const KEY = new Set(['陆生植物', '被子植物', '真菌', '动物', '节肢动物', '昆虫', '软体动物', '脊索动物', '四足动物', '哺乳动物', '鸟类', '恐龙', '灵长目', '原口动物', '后口动物']);
  const GROUP_NODE = { bac: '细菌', arc: '古菌', pro: 'SAR 超类群', pla: '泛植物', fun: '真菌', inv: '动物', ver: '脊索动物' };

  // 末端类群挂上代表物种（js/data/treeSpecies.js），让每条分支都走到“种”
  function attachSpecies() {
    const add = B.data.treeSpecies || {};
    (function walk(d) {
      if (d.children) return d.children.forEach(walk);
      const sp = add[d.n];
      if (sp && sp.length) d.children = sp.map(t => ({ n: t.preferred_common_name || t.name, l: t.name, inat: t, x: t.extinct,
        d: `${d.n}中观测记录最多的物种之一 · 全球 ${B.live.fmt(t.observations_count)} 次观测（iNaturalist）` }));
    })(B.data.tree);
  }
  function prepare() {
    hier = d3.hierarchy(B.data.tree);
    hier.each(d => { d.color = d.data.c || (d.parent ? d.parent.color : '#ffffff'); });
    hier.sort((a, b) => d3.ascending(a.height, b.height));
  }

  /* ---------- 画布渲染：树只在变化时重画（缩放、高亮、动画），光点单独一层 ----------
     之前是 SVG：约 300 个节点、300 条曲线和 470 个带描边的文字，每次缩放都要整张重新栅格化 */
  const SANS = getComputedStyle(document.documentElement).getPropertyValue('--sans') || 'sans-serif';
  const SERIF = getComputedStyle(document.documentElement).getPropertyValue('--serif') || 'serif';
  let tr = d3.zoomIdentity, dirty = true, hlSet = null, dimOn = false, hover = null, animStart = 0, animUntil = 0;
  const nodeR = d => d.depth === 0 ? 9 : d.children ? 3.5 + Math.min(4, d.leaves().length / 12) : (d.data.you ? 6 : 3);
  const leafText = d => `${d.data.i ? d.data.i + ' ' : ''}${d.data.n}${d.data.x ? ' †' : ''}`;
  const polar = (a, r) => [Math.cos(a - Math.PI / 2) * r, Math.sin(a - Math.PI / 2) * r];
  const lr = d3.linkRadial().angle(d => d.x).radius(d => d.y);

  function build() {
    W = root.clientWidth; H = root.clientHeight;
    // 叶子越多半径越大，保证每片叶子沿圆周至少有 15 个单位的空间
    R = Math.max(500, hier.leaves().length * 15 / (2 * Math.PI) + 100);
    d3.cluster().size([2 * Math.PI, R - 100]).separation((a, b) => a.parent === b.parent ? 1 : 1.5)(hier);
    nodes = hier.descendants(); links = hier.links();
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    for (const c of [cv, fx]) { c.width = W * dpr; c.height = H * dpr; }
    // 预先量好叶子标签长度（用于鼠标命中标签）
    ctx.font = `12.5px ${SANS}`;
    nodes.forEach(d => { d.r = nodeR(d); d.p = polar(d.x, d.y); if (!d.children) d.tw = ctx.measureText(leafText(d)).width; });
    if (!zoom) {
      // 滚轮缩放比 d3 默认慢一半（触控板双指捏合 ctrlKey 也放慢）
      zoom = d3.zoom().scaleExtent([0.4, 12]).wheelDelta(e => -B.wheel(e) * 0.001 * (e.ctrlKey ? 5 : 1)).on('zoom', e => { tr = e.transform; dirty = true; });
      sel.call(zoom).on('dblclick.zoom', null);
    }
    sel.call(zoom.transform, homeTransform());
    sparks = d3.range(70).map(() => ({ link: null, t: Math.random(), r: 1.6 + Math.random() * 1.6 }));
    dirty = true;
  }

  function render(now) {
    const k = tr.k, c = ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    c.setTransform(dpr * k, 0, 0, dpr * k, dpr * tr.x, dpr * tr.y);
    // 屏幕可见范围（树坐标），画面外的节点和文字直接跳过
    const x0 = -tr.x / k - 40, y0 = -tr.y / k - 40, x1 = (W - tr.x) / k + 40, y1 = (H - tr.y) / k + 40;
    const vis = p => p[0] > x0 && p[0] < x1 && p[1] > y0 && p[1] < y1;
    const t = now - animStart, growing = t < animUntil;
    const nodeA = d => { let a = growing ? B.clamp((t - d.depth * 140 - 300) / 500, 0, 1) : 1; if (d._born) a = Math.min(a, B.clamp((now - d._born) / 900, 0, 1)); return a; };
    // 年代环
    c.lineWidth = 1 / k; c.strokeStyle = 'rgba(150,180,255,.13)'; c.setLineDash([2, 6]);
    [0.25, 0.5, 0.75, 1].forEach(f => { c.beginPath(); c.arc(0, 0, (R - 100) * f, 0, 6.283); c.stroke(); });
    c.setLineDash([]);
    // 枝条：先画普通 / 变暗的，再画高亮路径，让高亮压在最上面
    lr.context(c);
    for (const pass of [0, 1]) {
      for (const l of links) {
        const on = !!(hlSet && hlSet.has(l.target));
        if ((pass === 1) !== on) continue;
        let a = on ? 1 : dimOn ? 0.08 : 0.45, tgt = l.target;
        if (growing) { const p = B.clamp((t - l.source.depth * 140) / 700, 0, 1); if (!p) continue; tgt = { x: l.target.x, y: l.source.y + (l.target.y - l.source.y) * d3.easeCubicOut(p) }; }
        if (l.target._born) a *= B.clamp((now - l.target._born) / 900, 0, 1);
        c.globalAlpha = a; c.strokeStyle = l.target.color; c.lineWidth = on ? 2.6 : 1.2;
        c.beginPath(); lr({ source: l.source, target: tgt }); c.stroke();
      }
    }
    // 节点
    c.strokeStyle = '#02040a'; c.lineWidth = 1.5;
    for (const d of nodes) {
      if (!vis(d.p)) continue;
      const a = nodeA(d); if (!a) continue;
      c.globalAlpha = a;
      c.fillStyle = d.depth === 0 ? '#fff' : d.color;
      c.beginPath(); c.arc(d.p[0], d.p[1], d.r * (hover === d ? 1.5 : 1), 0, 6.283); c.fill(); c.stroke();
    }
    // 叶子标签：沿半径方向；字在屏幕上小于 6 像素就不画（看不清，而且是最费时的部分）
    const leafLab = 12.5 * k >= 6;
    c.lineJoin = 'round'; c.textBaseline = 'middle';
    c.font = `12.5px ${SANS}`;
    for (const d of nodes) {
      if (d.children) continue;
      const on = !!(hlSet && hlSet.has(d));
      if (!leafLab && !on && hover !== d) continue;
      if (!vis(d.p)) continue;
      const a = nodeA(d); if (!a) continue;
      c.globalAlpha = a * (dimOn && !on ? 0.18 : 1);
      c.save();
      c.rotate(d.x - Math.PI / 2); c.translate(d.y, 0);
      const flip = d.x >= Math.PI;
      if (flip) c.rotate(Math.PI);
      c.textAlign = flip ? 'end' : 'start';
      const tx = flip ? -8 : 8, s = leafText(d);
      c.lineWidth = 3; c.strokeStyle = '#02040a'; c.strokeText(s, tx, 0);
      c.fillStyle = on || hover === d ? '#fff' : '#cfdaf3'; c.fillText(s, tx, 0);
      c.restore();
    }
    // 内部节点标签：水平放置，只显示关键类群和高亮路径上的
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    for (const d of nodes) {
      if (!d.children) continue;
      const on = !!(hlSet && hlSet.has(d)), key = d.depth <= 2 || KEY.has(d.data.n);
      if (!on && !key && hover !== d) continue;
      if (!vis(d.p)) continue;
      const a = nodeA(d); if (!a) continue;
      c.globalAlpha = a * (dimOn && !on ? 0.18 : 1);
      c.font = d.depth === 0 ? `15px ${SERIF}` : `600 ${d.depth <= 1 ? 15 : 13}px ${SANS}`;
      const y = d.p[1] + (d.depth === 0 ? 26 : -8);
      c.lineWidth = 3; c.strokeStyle = '#02040a'; c.strokeText(d.data.n, d.p[0], y);
      c.fillStyle = '#fff'; c.fillText(d.data.n, d.p[0], y);
    }
    c.globalAlpha = 1;
    // 入场动画或新节点淡入还没结束时，下一帧继续重画；否则静止不动、不再重画
    dirty = growing || nodes.some(d => d._born && now - d._born < 900);
  }

  // 鼠标命中：节点圆点，或叶子沿半径方向的文字
  function hit(cx, cy) {
    const r = cv.getBoundingClientRect(), [x, y] = tr.invert([cx - r.left, cy - r.top]);
    const tol = 6 / tr.k;
    let best = null, bd = Infinity;
    for (const d of nodes) {
      const dd = Math.hypot(d.p[0] - x, d.p[1] - y);
      if (dd < d.r + tol && dd < bd) { bd = dd; best = d; }
    }
    if (best || 12.5 * tr.k < 6) return best;
    const rad = Math.hypot(x, y);
    let ang = Math.atan2(y, x) + Math.PI / 2; if (ang < 0) ang += 2 * Math.PI;
    for (const d of nodes) {
      if (d.children) continue;
      let da = Math.abs(ang - d.x); if (da > Math.PI) da = 2 * Math.PI - da;
      if (da * d.y < 7 && rad > d.y && rad < d.y + d.tw + 12) return d;
    }
    return null;
  }
  function bindPointer() {
    cv.addEventListener('pointermove', e => {
      if (e.buttons) return;
      const d = hit(e.clientX, e.clientY);
      cv.style.cursor = d ? 'pointer' : '';
      if (d === hover) return;
      hover = d; dirty = true;
      highlight(d || locked);
      if (!locked) showInfo(d || hier);
    });
    cv.addEventListener('pointerleave', () => { if (!hover) return; hover = null; dirty = true; highlight(locked); if (!locked) showInfo(hier); });
    cv.addEventListener('click', e => {
      const d = hit(e.clientX, e.clientY);
      if (!d) { locked = null; highlight(null); showInfo(hier); return; }
      locked = d; highlight(d); showInfo(d);
      B.fx.burst(e.clientX, e.clientY, { color: d.depth ? d.color : '#ffffff', count: 70, power: 8, ringSize: 140 });
      if (d.children) focusNode(d);
    });
  }
  function homeTransform() {
    const mobile = innerWidth <= 760;
    const left = mobile ? 0 : 380;
    const k = Math.min((W - left) / (2 * R), (H - 70) / (2 * R)) * (mobile ? 1.15 : 1.06);
    return d3.zoomIdentity.translate(left + (W - left) / 2, (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 64) / 2 + H / 2 - (mobile ? H * 0.1 : 0)).scale(k);
  }
  function focusNode(d) {
    const ang = d.x - Math.PI / 2, x = Math.cos(ang) * d.y, y = Math.sin(ang) * d.y;
    const leaves = d.leaves().length;
    const k = B.clamp(2.6 - Math.log10(leaves + 1) * 0.9, 1, 3.2) * homeTransform().k;
    const mobile = innerWidth <= 760, left = mobile ? 0 : 380;
    sel.transition().duration(1100).ease(d3.easeCubicInOut).call(zoom.transform, d3.zoomIdentity.translate(left + (W - left) / 2 - x * k, H / 2 - y * k).scale(k));
  }

  /* ---------- 高亮与信息 ---------- */
  function highlight(d) {
    hlSet = d ? new Set(d.ancestors()) : null;
    dimOn = !!d; dirty = true;
  }
  function matchDetail(name) {
    const sp = B.data.species.find(s => s.n === name);
    if (sp) return B.views.map.detail(sp);
    return null;
  }
  function showInfo(d) {
    const data = d.data, col = d.depth === 0 ? '#ffffff' : d.color;
    info.style.setProperty('--tc', col);
    const crumbs = d.ancestors().reverse().map(a => `<span>${B.esc(a.data.n)}</span>`).join('');
    const leaves = d.leaves().length;
    info.innerHTML = `<h2><small>03 · TREE OF LIFE</small>生命之树</h2>
      <div class="ti-photo"></div>
      <div class="ti-crumbs">${crumbs}</div>
      <div class="ti-name">${data.i ? data.i + ' ' : ''}${B.esc(data.n)}</div>
      <div class="ti-latin">${B.esc(data.l || '')}</div>
      <p class="ti-desc">${B.esc(data.d || '')}</p>
      <div class="ti-meta"><div><small>演化层级</small><b>第 ${d.depth} 层</b></div><div><small>${data.k ? '已知物种' : '图中分支'}</small><b>${B.esc(data.k || (d.children ? leaves + ' 个' : '末端'))}</b></div></div>
      <button class="ti-open ${d.depth > 0 ? 'show' : ''}" type="button">查看详情 →</button>
      `;
    if (canGrow(data)) {
      const grow = B.live.cta({ kicker: 'LIVE · iNaturalist', color: col, cls: 'cta-block ti-grow',
        title: data._grown ? `列出全部${B.views.all.RANKS[nextRank(data._t)]}` : '长出真实的下级类群', unit: data._grown ? '个' : '' });
      grow.set({ n: data._grown ? data._grown : '展开' });
      grow.onclick = () => data._grown ? listAll(data, col) : growNode(d, grow);
      info.appendChild(grow);
    }
    if (d.depth > 0 && data.l) B.photo.fill(B.$('.ti-photo', info), { wk: data.wk, l: data.l }, { eager: true });
    const btn = B.$('.ti-open', info);
    btn.onclick = () => data.inat ? B.openTaxon(data.inat) : B.openDetail(matchDetail(data.n) || {
      i: data.i, g: data.n, color: col, title: data.n, latin: data.l, en: null, photo: { wk: data.wk, l: data.l },
      tags: [{ t: '生命之树', c: col }, { t: `第 ${d.depth} 层` }].concat(data.x ? [{ t: '已灭绝', c: '#ff4d6d', solid: true }] : []),
      stats: [['演化路径', d.ancestors().reverse().slice(-4).map(a => a.data.n).join(' › ')], ['已知物种', data.k], ['下属分支', d.children ? d.children.map(c => c.data.n).join('、') : null]],
      desc: data.d
    });
  }

  /* ---------- 真实下级类群：从 iNaturalist 接上去，可以一直长到“种” ---------- */
  const GROW_N = 16;
  // 每次直接长到下一个主要等级（界→门→纲→目→科→属→种），跳过亚纲、总目之类的中间等级
  const MAJOR = [[70, 'kingdom'], [60, 'phylum'], [50, 'class'], [40, 'order'], [30, 'family'], [20, 'genus'], [10, 'species']];
  const nextRank = t => (MAJOR.find(m => m[0] < (t.rank_level || 100)) || [])[1];
  const rankQuery = (t, per, page) => `https://api.inaturalist.org/v1/taxa?taxon_id=${t.id}&rank=${nextRank(t)}&is_active=true&locale=zh-CN&per_page=${per}&page=${page}&order_by=observations_count&order=desc`;
  const canGrow = data => !!data.l && !(data.inat && B.views.all.LEAF.has(data.inat.rank));
  function resolve(data) {
    if (data.inat) return Promise.resolve(data.inat);
    if (data === B.data.tree) return Promise.resolve({ id: 48460, name: 'Life', rank: 'stateofmatter', rank_level: 100 });
    const q = data.l.split(' · ')[0].replace(/\s+spp?\.?$/i, '');
    return fetch(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(q)}&is_active=true&locale=zh-CN&per_page=10`).then(r => r.json())
      .then(j => (j.results || []).find(t => t.name.toLowerCase() === q.toLowerCase()) || null);
  }
  function growNode(d, btn) {
    const data = d.data;
    btn.disabled = true; btn.set({ title: '正在从 iNaturalist 读取…', n: null });
    resolve(data).then(t => {
      if (!t) throw new Error('none');
      data.inat = data.inat || (t.id === 48460 ? null : t); data._t = t;
      if (!nextRank(t)) return { total_results: 0 };
      return fetch(rankQuery(t, GROW_N, 1)).then(r => r.json());
    }).then(j => {
      const R = B.views.all.RANKS, have = new Set((data.children || []).map(c => (c.l || '').toLowerCase()));
      const add = (j.results || []).filter(c => !have.has(c.name.toLowerCase())).map(c => ({ n: c.preferred_common_name || c.name, l: c.name, inat: c, x: c.extinct, _new: true,
        d: `${R[c.rank] || c.rank} · 全球 ${B.live.fmt(c.observations_count)} 次观测记录（iNaturalist 实时数据）`, k: B.views.all.LEAF.has(c.rank) ? null : undefined }));
      data._grown = j.total_results || 0;
      if (!j.total_results) { btn.set({ title: '这已经是最末一级了', n: '—', unit: '' }); return; }
      if (add.length) data.children = (data.children || []).concat(add);
      const keepT = tr;
      prepare(); build(); drawn = true;
      sel.call(zoom.transform, keepT);
      const now = performance.now();
      nodes.forEach(n => { if (n.data._new) n._born = now; });
      add.forEach(a => delete a._new);
      const nd = nodes.find(n => n.data === data);
      locked = nd; highlight(nd); showInfo(nd); focusNode(nd);
    }).catch(() => { btn.disabled = false; btn.set({ title: 'iNaturalist 中没有对应的类群', n: '—', unit: '' }); });
  }
  function listAll(data, col) {
    const R = B.views.all.RANKS;
    const rk = R[nextRank(data._t)];
    panel.show({ color: col, kicker: 'LIVE · iNaturalist', title: `${data.n}的全部${rk}`, sub: data.l,
      source: '数据与照片来自 iNaturalist 全球分类库，按观测次数排序。点击可查看详情。',
      summary: n => `共 <b>${B.live.fmt(n)}</b> 个${rk}`,
      load: page => fetch(rankQuery(data._t, 60, page)).then(r => r.json()).then(j => ({ total: j.total_results, more: page * 60 < Math.min(j.total_results, 10000),
        items: j.results.map(t => B.live.inatItem(t, `${R[t.rank] || t.rank} · ${B.live.fmt(t.observations_count)} 次观测`)) })) });
  }

  /* ---------- 流动的光点：画在叠加的 canvas 上，不让 SVG 每帧重绘 ---------- */
  function resetSpark(s) {
    const cands = links.filter(l => l.source.depth === 0);
    s.link = cands[Math.floor(Math.random() * cands.length)];
    s.t = 0;
  }
  function stepSparks() {
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, fx.width, fx.height);
    fctx.setTransform(dpr * tr.k, 0, 0, dpr * tr.k, dpr * tr.x, dpr * tr.y);
    fctx.globalCompositeOperation = 'lighter';
    const dim = dimOn;
    for (const s of sparks) {
      if (!s.link) { resetSpark(s); s.t = Math.random(); }
      const L = s.link;
      s.t += 0.012 + 0.004 * Math.random();
      if (s.t >= 1) {
        const next = L.target.children;
        if (next) { const c = next[Math.floor(Math.random() * next.length)]; s.link = { source: L.target, target: c }; s.t = 0; }
        else { resetSpark(s); }
      }
      const a = s.link.source, b = s.link.target;
      const an = a.x + (b.x - a.x) * s.t - Math.PI / 2, r = a.y + (b.y - a.y) * s.t;
      const x = Math.cos(an) * r, y = Math.sin(an) * r;
      fctx.fillStyle = b.color;
      fctx.globalAlpha = dim ? 0.12 : 0.22; fctx.beginPath(); fctx.arc(x, y, s.r * 2.6, 0, 6.283); fctx.fill();
      fctx.globalAlpha = dim ? 0.4 : 0.95; fctx.beginPath(); fctx.arc(x, y, s.r, 0, 6.283); fctx.fill();
    }
    // “你在这里”：智人节点的脉冲光环（画在光点层，不用整棵树每帧重画）
    const you = nodes.find(d => d.data.you);
    if (you) { const ph = (performance.now() % 1600) / 1600; fctx.globalAlpha = (1 - ph) * 0.8; fctx.strokeStyle = '#ffffff'; fctx.lineWidth = 2 / tr.k; fctx.beginPath(); fctx.arc(you.p[0], you.p[1], you.r + ph * 14, 0, 6.283); fctx.stroke(); }
    fctx.globalAlpha = 1;
  }
  function loop(now) { if (!running) return; raf = requestAnimationFrame(loop); if (dirty) render(now); stepSparks(); }

  // 入场：枝条按层级依次生长，节点随后淡入
  function drawIn() {
    if (drawn) return; drawn = true;
    animStart = performance.now(); animUntil = hier.height * 140 + 900; dirty = true;
  }

  /* ---------- 公开 ---------- */
  V.init = function (el) {
    root = el;
    el.innerHTML = `<canvas class="tree-cv"></canvas><canvas class="tree-fx"></canvas>
      <div class="tree-info glass"></div>
      <div class="tree-tools"><button class="glass" data-a="me">🧍 找到我</button><button class="glass" data-a="home">⌖ 复位</button></div>
      <div class="tree-legend glass">${B.data.treeGroups.map(g => `<span data-k="${g.k}" style="--cc:${g.c}"><i></i>${g.t}</span>`).join('')}</div>`;
    cv = B.$('.tree-cv', el); ctx = cv.getContext('2d'); sel = d3.select(cv); info = B.$('.tree-info', el);
    panel = B.live.panel(el);
    fx = B.$('.tree-fx', el); fctx = fx.getContext('2d');
    attachSpecies(); prepare(); build(); bindPointer(); showInfo(hier);
    B.$$('.tree-legend span', el).forEach(s => s.onclick = () => V.focusName(GROUP_NODE[s.dataset.k]));
    B.$('[data-a=home]', el).onclick = () => { locked = null; highlight(null); showInfo(hier); sel.transition().duration(900).call(zoom.transform, homeTransform()); };
    B.$('[data-a=me]', el).onclick = () => V.focusName('智人');
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (B.current === 'tree') { build(); drawn = true; highlight(locked && nodes.find(n => n.data.n === locked.data.n)); } }, 200); });
  };
  V.focusName = function (name) {
    const d = nodes.find(n => n.data.n === name); if (!d) return;
    locked = d; highlight(d); showInfo(d);
    focusNode(d.children ? d : d.parent);
  };
  V.enter = function () { drawIn(); if (!running) { running = true; raf = requestAnimationFrame(loop); } };
  V.leave = function () { running = false; cancelAnimationFrame(raf); };
  V.key = function (e) { if (e.key !== 'Escape') return; if (panel.isOpen()) panel.hide(); else B.$('[data-a=home]', root).click(); };
  V.index = () => {
    const out = [];
    d3.hierarchy(B.data.tree).each(d => {
      const path = d.ancestors().reverse().slice(1, -1).slice(-3).map(a => a.data.n).join(' › ');
      out.push({ title: d.data.n, latin: d.data.l, ph: d.depth ? { wk: d.data.wk, l: d.data.l } : null, sub: `生命树 · ${path || d.data.l}`, i: d.data.i, kw: '类群 分类 演化', go: () => V.focusName(d.data.n) });
    });
    return out;
  };
  B.views.tree = V;
})();
