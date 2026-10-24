/* 尺度视角：从 17 纳米的病毒到 2300 公里的大堡礁，13 个数量级无缝缩放 */
(function () {
  const B = BIO;
  const V = {};
  let root, stage, grid, gctx, hudVal, hudExp, ruler, rulerTxt, slider, note, playBtn, base;
  // z / zt 是“第几个生物”的位置（0 = 最小的生物，1 = 下一个……），每个生物分到相同的缩放行程；
  // lz 才是真正的尺度（10^lz 米 = 画面宽度），在相邻两个生物之间插值。
  // 之前直接按尺度匀速缩放，大小相近的生物（霸王龙 12.3 米 → 鲸鲨 12.6 米）一闪而过，相差悬殊的又要滚很久
  let VW = 0, VH = 0, z = 0, zt = 0, lz = 0, zMin = -0.5, zMax = 0, playing = false, playDir = 1, running = false, raf = 0;
  let items = [], focus = null, panel, lastKey = '', moving = false, bgTick = 0;
  // 每个生物只按固定的 360 像素排版一次，缩放时只改 GPU 的 transform: scale()，
  // 不再每帧改宽高和字号（原来巨大的 emoji 和带模糊阴影的照片每帧都要重新绘制）
  const BASE = 360;

  function prepare() {
    const data = B.data.scale.slice().sort((a, b) => a.s - b.s);
    let x = 0;
    items = data.map((d, i) => {
      if (i > 0) x += data[i - 1].s * 0.5 + d.s * 0.5 + d.s * 0.7;
      return { d, x, zf: Math.log10(d.s * 4.6), el: null, lab: null };
    });
    zMin = -0.5; zMax = items.length - 1 + 0.15;
  }
  // 生物序号位置 → 真实尺度（两端各留一点余量继续缩放）
  function logZoom(u) {
    const n = items.length - 1;
    if (u <= 0) return items[0].zf + u * 0.6;
    if (u >= n) return items[n].zf + (u - n);
    const i = Math.floor(u);
    return items[i].zf + (items[i + 1].zf - items[i].zf) * (u - i);
  }
  function camera(zz) {
    if (zz <= items[0].zf) return items[0].x;
    for (let i = 0; i < items.length - 1; i++) {
      const a = items[i], b = items[i + 1];
      if (zz <= b.zf) { const k = (zz - a.zf) / (b.zf - a.zf); const e = k * k * (3 - 2 * k); return a.x + (b.x - a.x) * e; }
    }
    return items[items.length - 1].x;
  }

  function buildDom() {
    stage.querySelectorAll('.sc-item,.sc-label').forEach(n => n.remove());
    items.forEach((it, i) => {
      const d = it.d;
      it.el = B.h(`<div class="sc-item">${d.i ? `<span class="sg">${d.i}</span>` : `<span class="sg g" style="--gc:${d.gc || '#ff5fa2'}">${B.esc(d.n[0])}</span>`}<span class="sph"></span></div>`);
      it.lab = B.h(`<div class="sc-label"><b>${B.esc(d.n)}</b><small>${B.fmtLen(d.s)}</small></div>`);
      it.el.onclick = () => B.openDetail(detail(d));
      it.el.addEventListener('pointerenter', () => { it.hover = true; });
      it.el.addEventListener('pointerleave', () => { it.hover = false; });
      stage.appendChild(it.el); stage.appendChild(it.lab);
      it.sg = it.el.firstChild;
      it.sph = it.el.querySelector('.sph');
      B.photo.fill(it.sph, d);
      it.alt = i % 2;
      it.el.style.display = it.lab.style.display = 'none'; it.on = false;
    });
  }

  function detail(d) {
    const r = d.s / 1.7;
    const rel = r >= 1 ? `约为人类身高的 ${r >= 100 ? Math.round(r).toLocaleString('zh-CN') : +r.toPrecision(2)} 倍` : `人类身高的 ${(1 / r) >= 1e6 ? (1 / r).toExponential(1).replace('e+', '×10^') : Math.round(1 / r).toLocaleString('zh-CN')} 分之一`;
    return {
      i: d.i, g: d.n, color: d.gc || '#ff5fa2', title: d.n, latin: d.l, en: d.e, photo: d,
      tags: [{ t: '尺度', c: '#ff5fa2' }, { t: d.w }, { t: `10^${Math.floor(Math.log10(d.s))} 米量级`, c: '#ffd166' }],
      stats: [[d.w, B.fmtLen(d.s)], ['与人类相比', d.n === '人类' ? '就是你' : rel]],
      desc: d.d, fact: d.f,
      actions: B.current === 'scale' ? [] : [{ label: '在尺度中查看', fn: () => B.go('scale', () => V.zoomTo(d.n)) }]
    };
  }

  // 用上标字符写指数（10⁻⁶），不会被误读成“100.9”这样的普通数字
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const sup = e => String(e).split('').map(c => SUP[c]).join('');
  const band = e => e <= -7 ? '纳米级' : e <= -4 ? '微米级' : e === -3 ? '毫米级' : e === -2 ? '厘米级' : e === -1 ? '分米级' : e === 0 ? '米级' : e === 1 ? '十米级' : e === 2 ? '百米级' : e <= 5 ? '千米级' : '千公里级';

  function niceLen(w) {
    const p = Math.pow(10, Math.floor(Math.log10(w)));
    for (const m of [5, 2, 1]) if (m * p <= w) return m * p;
    return p;
  }

  function drawBg(span, ppm, cx, baseY, dz) {
    gctx.clearRect(0, 0, VW, VH);
    // 缩放隧道：星尘随数量级变化向外 / 向内飞散
    gctx.globalCompositeOperation = 'lighter';
    const cxs = VW / 2, cys = VH * 0.42, maxR = Math.hypot(VW, VH) * 0.6, sg = Math.sign(-dz || 1);
    for (const s of tunnel) {
      s.lr -= dz * 1.6; s.lr += 0.0012;
      if (s.lr > 1) s.lr -= 1; if (s.lr < 0) s.lr += 1;
      const rr = Math.pow(s.lr, 2.2) * maxR, ca = Math.cos(s.a), sa = Math.sin(s.a), x = cxs + ca * rr, y = cys + sa * rr * 0.7;
      gctx.globalAlpha = Math.min(1, s.lr * 2) * (0.35 + Math.min(0.65, Math.abs(dz) * 40));
      gctx.strokeStyle = s.c; gctx.lineWidth = 0.6 + s.lr * 1.6;
      const tail = (Math.min(60, Math.abs(dz) * 900 * s.lr) + 1.2) * sg;
      gctx.beginPath(); gctx.moveTo(x, y); gctx.lineTo(x + ca * tail, y + sa * tail * 0.7); gctx.stroke();
    }
    gctx.globalAlpha = 1;
    gctx.globalCompositeOperation = 'source-over';
    // 刻度网格：同样式的线合成一条路径一次画完
    const unit = niceLen(span * 0.22);
    const k0 = Math.floor((cx - span) / unit), k1 = Math.ceil((cx + span) / unit);
    if (k1 - k0 < 400) {
      gctx.strokeStyle = 'rgba(255,95,162,.07)'; gctx.beginPath();
      for (let k = k0; k <= k1; k++) { const x = (k * unit - cx) * ppm + VW / 2; gctx.moveTo(x, 0); gctx.lineTo(x, VH); }
      gctx.stroke();
      if (k1 - k0 < 120) {
        const fine = unit / 5;
        gctx.strokeStyle = 'rgba(255,255,255,.03)'; gctx.beginPath();
        for (let k = Math.floor((cx - span) / fine); k <= Math.ceil((cx + span) / fine); k++) { const x = (k * fine - cx) * ppm + VW / 2; gctx.moveTo(x, baseY - 40); gctx.lineTo(x, baseY + 40); }
        gctx.stroke();
      }
    }
    for (let k = 0; k < 6; k++) { gctx.strokeStyle = `rgba(150,180,255,${0.05 - k * 0.008})`; gctx.beginPath(); gctx.moveTo(0, baseY - k * unit * ppm); gctx.lineTo(VW, baseY - k * unit * ppm); gctx.stroke(); }
  }

  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (playing) {
      zt += 0.016 * playDir;  // 约 1 秒一个生物
      if (zt >= zMax) { zt = zMax; playDir = -1; }
      if (zt <= zMin) { zt = zMin; playDir = 1; }
    }
    zt = B.clamp(zt, zMin, zMax);
    z += (zt - z) * 0.1;
    lz = logZoom(z);
    const span = Math.pow(10, lz), ppm = VW / span, cx = camera(lz), baseY = VH * 0.66;
    // 网格与隧道背景：静止时隔帧绘制
    const dz = lz - (V._lz == null ? lz : V._lz); V._lz = lz;
    if (playing || Math.abs(zt - z) > 1e-4 || !(bgTick++ & 1)) drawBg(span, ppm, cx, baseY, dz);
    // 缩放进行中把物体提升为 GPU 图层；停下后撤掉，让浏览器按最终大小重新清晰绘制
    const nowMoving = playing || Math.abs(zt - z) > 1e-4;
    if (nowMoving !== moving) { moving = nowMoving; root.classList.toggle('zooming', moving); }
    // 没在缩放、窗口也没变时，物体和读数都不用动
    const key = z.toFixed(5) + '|' + VW + '|' + VH;
    if (key === lastKey) return;
    lastKey = key;
    base.style.top = baseY + 'px';
    // 物体
    let best = null;
    for (const it of items) {
      const px = it.d.s * ppm;
      const sx = (it.x - cx) * ppm + VW / 2;
      const visible = px > 2 && px < VH * 1.15 && sx + px > -50 && sx - px < VW + 50;
      if (!visible) { if (it.on) { it.el.style.display = 'none'; it.lab.style.display = 'none'; it.on = false; } continue; }
      if (!it.on) { it.el.style.display = ''; it.lab.style.display = ''; it.on = true; }
      const fadeIn = B.clamp((px - 2) / 14, 0, 1), fadeOut = B.clamp((VH * 1.15 - px) / (VH * 0.5), 0, 1);
      const op = Math.min(fadeIn, fadeOut);
      it.el.style.opacity = op;
      if (px > 300) B.photo.upgrade(it.sph);
      // 底边中点固定在 (sx, baseY)，按 px / BASE 缩放
      it.el.style.transform = `translate3d(${(sx - BASE / 2).toFixed(1)}px,${(baseY - BASE).toFixed(1)}px,0) scale(${(px / BASE).toFixed(5)})`;
      const showLab = px > 22 && op > 0.3;
      it.lab.style.opacity = showLab ? Math.min(1, op) : 0;
      it.lab.style.transform = `translate3d(${sx.toFixed(1)}px,${baseY + 16 + it.alt * 40}px,0) translateX(-50%)`;
    }
    best = items[B.clamp(Math.round(z), 0, items.length - 1)];
    if (best !== focus) {
      focus = best; showNote();
      if (focus && focus.on && V._ready) { const r = focus.el.getBoundingClientRect(); B.fx.burst(r.left + r.width / 2, r.top + r.height / 2, { colors: [focus.d.gc || '#ff5fa2', '#ffd166', '#ffffff'], count: 46, power: 6, life: 50, ringSize: Math.min(260, r.width * 0.8 + 40) }); }
      V._ready = true;
    }
    // HUD
    // 当前位置的尺寸：正好对准某个生物时就是它的大小（人类 → 1.7 米），在两个生物之间平滑过渡
    const here = span / 4.6;
    hudVal.textContent = B.fmtLen(here);
    const e = Math.floor(Math.log10(here));
    if (e !== hudExp._e) { hudExp._e = e; hudExp.textContent = `数量级 10${sup(e)} 米 · ${band(e)}`; }
    const rl = niceLen(span * 0.18);
    ruler.style.width = rl * ppm + 'px';
    rulerTxt.textContent = B.fmtLen(rl);
    if (document.activeElement !== slider) slider.value = z;
    updateCta();
    if (panel.isOpen() && Math.round(lz * 2) !== sizeKey && Math.abs(zt - z) < 0.02) showSizes();
  }
  function showNote() {
    if (!focus) return;
    const d = focus.d;
    note.innerHTML = `<b><small>NOW FOCUSING</small>${d.i || ''} ${B.esc(d.n)}</b><span style="font-family:var(--mono);color:var(--accent)">${B.esc(d.w)} · ${B.fmtLen(d.s)}</span><br>${B.esc(d.d)}`;
  }

  V.zoomTo = function (name) {
    const it = items.find(i => i.d.n === name); if (!it) return;
    playing = false; playBtn.innerHTML = playIcon(false);
    zt = items.indexOf(it);
  };
  const playIcon = p => p ? '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>';

  /* ---------- 全部生物：Wikidata 中记录了体长 / 身高 / 直径的所有分类单元（js/data/sizes.js） ---------- */
  let sizeKey = null, scCta, ctaKey = null;
  // 入口按钮上的数字随缩放实时变化（本地数据，瞬间算出）
  function updateCta() {
    const k = Math.round(lz * 4);
    if (k === ctaKey) return;
    ctaKey = k;
    const s0 = Math.pow(10, lz) / 4.6, a = s0 / 2.5, b = s0 * 2.5;
    scCta.set({ title: `大小 ${B.fmtLen(a)} – ${B.fmtLen(b)} 的生物`, n: B.data.sizes.reduce((n, o) => n + (o[2] >= a && o[2] < b), 0) });
  }
  function showSizes() {
    const s0 = Math.pow(10, lz) / 4.6, a = s0 / 2.5, b = s0 * 2.5, PER = 60;
    sizeKey = Math.round(lz * 2);
    const list = B.data.sizes.filter(o => o[2] >= a && o[2] < b).sort((x, y) => (!!y[3] - !!x[3]) || (!!y[0] - !!x[0]) || x[2] - y[2]);
    panel.show({ key: 'size', color: '#ff5fa2', kicker: 'WIKIDATA · 随缩放实时更新', title: '这个尺度的全部生物', sub: `大小（体长 / 身高 / 直径）${B.fmtLen(a)} – ${B.fmtLen(b)}`,
      empty: `在这个尺度上，Wikidata 里还没有记录了尺寸的生物。全部 ${B.data.sizes.length} 种有尺寸记录的生物分布在 ${B.fmtLen(B.data.sizes[0][2])} 到 ${B.fmtLen(B.data.sizes[B.data.sizes.length - 1][2])} 之间，试试缩放到别的尺度。`,
      source: `数据来自 Wikidata 中记录了体长、身高或直径的全部 ${B.data.sizes.length} 种生物（多为成体最大值）；照片来自 Wikimedia Commons。`,
      summary: n => `共有 <b>${B.live.fmt(n)}</b> 种生物的尺寸落在这个范围`,
      load: page => Promise.resolve({ total: list.length, more: page * PER < list.length,
        items: list.slice((page - 1) * PER, page * PER).map(([zh, la, len, img]) => ({ name: zh || la, latin: la, meta: B.fmtLen(len),
          img: img ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(img)}?width=240` : null, ph: img ? null : { l: la },
          open: () => B.live.openName(la, { title: zh, color: '#ff5fa2', tags: [{ t: '尺度', c: '#ff5fa2' }, { t: `10^${Math.floor(Math.log10(len))} 米量级`, c: '#ffd166' }], stats: [['尺寸', B.fmtLen(len)], ['与人类相比', `${+(len / 1.7).toPrecision(2)} 倍`]] }) })) }) });
  }

  const tunnel = Array.from({ length: 180 }, (_, i) => ({ a: Math.random() * 6.283, lr: Math.random(), c: ['rgb(255,95,162)', 'rgb(255,209,102)', 'rgb(200,220,255)'][i % 3] }));
  function resize() {
    VW = root.clientWidth; VH = root.clientHeight;
    const dpr = 1;  // 背景只有细线和光痕，1 倍分辨率足够
    grid.width = VW * dpr; grid.height = VH * dpr; gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  V.init = function (el) {
    root = el;
    el.innerHTML = `<div class="scale-stage"><canvas class="scale-grid"></canvas><div class="scale-base"></div></div>
      <div class="scale-hud"><div class="lbl">05 · THE SCALE OF LIFE</div><div class="val-k">当前位置的宽度</div><div class="val">1.7 米</div><div class="exp"></div></div>
      <div class="scale-note glass"></div>
      <div class="scale-ruler"><div class="rl"></div><span></span></div>
      <div class="scale-ctrl glass">
        <button type="button" data-a="out" title="缩小（看更大的生物）" aria-label="放大视野">−</button>
        <span class="ends">17 纳米</span>
        <input type="range" step="0.01" aria-label="尺度">
        <span class="ends">2,300 公里</span>
        <button type="button" data-a="in" title="放大（看更小的生物）" aria-label="缩小视野">+</button>
        <button type="button" data-a="play" title="自动漫游"></button>
      </div>`;
    stage = B.$('.scale-stage', el); grid = B.$('.scale-grid', el); gctx = grid.getContext('2d'); base = B.$('.scale-base', el);
    hudVal = B.$('.scale-hud .val', el); hudExp = B.$('.scale-hud .exp', el);
    ruler = B.$('.scale-ruler .rl', el); rulerTxt = B.$('.scale-ruler span', el);
    slider = B.$('input[type=range]', el); note = B.$('.scale-note', el); playBtn = B.$('[data-a=play]', el);
    prepare(); buildDom(); resize();
    panel = B.live.panel(el);
    scCta = B.live.cta({ kicker: 'WIKIDATA · 同样大小的生物', title: '这个尺度的全部生物', unit: '种', color: '#ff5fa2', cls: 'cta-float' });
    scCta.onclick = showSizes;
    el.appendChild(scCta);
    slider.min = zMin; slider.max = zMax;
    z = zt = items.findIndex(i => i.d.n === '人类'); lz = logZoom(z);
    slider.oninput = () => { zt = +slider.value; playing = false; playBtn.innerHTML = playIcon(false); };
    playBtn.innerHTML = playIcon(false);
    playBtn.onclick = () => { playing = !playing; if (playing && zt >= zMax - 0.05) playDir = -1; if (playing && zt <= zMin + 0.05) playDir = 1; playBtn.innerHTML = playIcon(playing); };
    // 按钮一次一个生物，滚轮约 4 格一个，拖动约 130 像素一个
    B.$('[data-a=in]', el).onclick = () => { zt = Math.round(zt) - 1; };
    B.$('[data-a=out]', el).onclick = () => { zt = Math.round(zt) + 1; };
    stage.addEventListener('wheel', e => { e.preventDefault(); zt += B.wheel(e) * 0.0025; playing = false; playBtn.innerHTML = playIcon(false); }, { passive: false });
    let drag = null;
    stage.addEventListener('pointerdown', e => { if (e.target.closest('.sc-item')) return; drag = { x: e.clientX, z: zt }; stage.setPointerCapture(e.pointerId); });
    stage.addEventListener('pointermove', e => { if (drag) { zt = drag.z - (e.clientX - drag.x) * 0.0075; playing = false; } });
    stage.addEventListener('pointerup', () => { drag = null; });
    addEventListener('resize', () => { if (B.current === 'scale') resize(); });
  };
  V.enter = function () { resize(); if (!running) { running = true; raf = requestAnimationFrame(frame); } };
  V.leave = function () { running = false; cancelAnimationFrame(raf); playing = false; if (playBtn) playBtn.innerHTML = playIcon(false); };
  V.key = function (e) {
    if (e.key === 'Escape' && panel.isOpen()) { panel.hide(); return; }
    if (e.key === 'ArrowLeft' || e.key === '-') zt = Math.round(zt) - 1;
    if (e.key === 'ArrowRight' || e.key === '=' || e.key === '+') zt = Math.round(zt) + 1;
    if (e.key === ' ') { e.preventDefault(); playBtn.click(); }
  };
  V.index = () => B.data.scale.map(d => ({ title: d.n, en: d.e, latin: d.l, sub: `尺度 · ${d.w} ${B.fmtLen(d.s)}`, i: d.i, ph: d, kw: '大小 尺寸', go: () => { V.zoomTo(d.n); } }));
  B.views.scale = V;
})();
