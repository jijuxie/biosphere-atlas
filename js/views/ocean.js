/* 深海视角：从海面下潜至挑战者深渊，深度仪表、手电筒与海洋雪 */
(function () {
  const B = BIO;
  const V = {};
  let root, sc, col, dark, snow, sctx, hud, tip;
  let VH = 0, VW = 0, running = false, raf = 0, flakes = [], mouse = { x: 0.5, y: 0.5 }, tipShown = false;
  const DEPTH_MAX = 10935;
  const SEG_D = [0, 200, 1000, 4000, 6000, DEPTH_MAX];
  const SEG_Y = [0, 1500, 4100, 7700, 9300, 12000];
  const BIG = { '蓝鲸': 130, '抹香鲸': 110, '大白鲨': 84, '大王乌贼': 88, '格陵兰睡鲨': 76, '皇带鱼': 76, '柯氏喙鲸': 84, '宽吻海豚': 66, '珊瑚礁': 72 };
  let yOfD, dOfY, panel;

  function scales() {
    const s = d3.scaleLinear().domain(SEG_D).range(SEG_Y).clamp(true);
    yOfD = d => VH + s(d);
    dOfY = y => s.invert(Math.max(0, y - VH));
  }
  const zoneAt = d => B.data.zones.find(z => d >= z.a && d < z.b) || B.data.zones[B.data.zones.length - 1];
  const pressure = d => 1 + d / 10.06;
  const temp = d => d <= 100 ? 26 - d * 0.02 : d <= 1000 ? 24 - (d - 100) / 900 * 19 : d <= 4000 ? 5 - (d - 1000) / 3000 * 3 : d <= 6000 ? 2 - (d - 4000) / 2000 * 0.5 : 1.5 + (d - 6000) / 5000;
  const light = d => 100 * Math.exp(-d / 45);

  function build() {
    VH = root.clientHeight; VW = root.clientWidth;
    scales();
    const total = yOfD(DEPTH_MAX) + 640;
    const water0 = VH, waterH = total - VH;
    const stops = [[0, '#2f8fd0'], [60, '#1a62a8'], [200, '#0b3a73'], [600, '#06224a'], [1000, '#041530'], [4000, '#020814'], [6000, '#010409'], [DEPTH_MAX, '#000002']]
      .map(([d, c]) => `${c} ${((yOfD(d) - water0) / waterH * 100).toFixed(2)}%`).join(',');
    const slots = [42, 68, 54, 80, 36, 62];
    const maxX = VW - (VW <= 760 ? 170 : 260);
    const crit = B.data.ocean.slice().sort((a, b) => a.dep - b.dep).map((c, i) => {
      const x = Math.min(maxX, VW * slots[i % slots.length] / 100);
      const fs = BIG[c.n] || 54;
      const z = zoneAt(c.dep);
      const glyph = c.i ? `<span class="cg">${c.i}</span>` : `<span class="cg g">${B.esc(c.n[0])}</span>`;
      return `<div class="critter ${c.g ? 'glow' : ''}" data-n="${B.esc(c.n)}" style="left:${x}px;top:${yOfD(c.dep)}px;--fs:${fs}px;--gc:${c.g || z.c};--dur:${6 + (i % 5)}s;--dl:-${i % 7}s;--dx:${i % 2 ? 14 : -14}px;z-index:${c.g ? 6 : 2}"><span class="cph">${glyph}</span><div class="cl">${B.esc(c.n)}<small>${c.dep.toLocaleString('zh-CN')} 米</small></div></div>`;
    }).join('');
    const zones = B.data.zones.map(z => `
      <div class="zone-line" style="top:${yOfD(z.a)}px"><span>${z.a.toLocaleString('zh-CN')} m</span></div>
      <div class="zone-title" style="top:${yOfD(z.a) + 70}px;--zc:${z.c}"><small>${z.e}</small><h3>${z.n}</h3><p>${z.a.toLocaleString('zh-CN')}–${z.b.toLocaleString('zh-CN')} 米 · ${z.d}</p></div>`).join('');
    const marks = B.data.landmarks.map(l => `<div class="landmark" style="top:${yOfD(l.dep)}px"><div class="lm-t"><b>${l.dep.toLocaleString('zh-CN')} 米</b>${B.esc(l.n)}${l.d ? `<br><span style="opacity:.7">${B.esc(l.d)}</span>` : ''}</div><div class="lm-line"></div></div>`).join('');
    col.style.height = total + 'px';
    col.innerHTML = `
      <div class="ocean-sky">
        <div style="position:absolute;left:68%;top:16%;width:160px;height:160px;border-radius:50%;background:radial-gradient(circle,#fff6d8,#ffd27a 40%,rgba(255,210,122,0) 70%);filter:blur(2px)"></div>
        <h2><small>04 · INTO THE DEEP</small>深海下潜</h2>
        <p>海洋平均深度 3,688 米，而人类探索过的海底不足四分之一。<br>深吸一口气，我们将一路下沉到 10,935 米的地球最深处。</p>
        <div class="dive"><span></span>向下滚动 开始下潜</div>
        <svg class="waves" viewBox="0 0 2880 90" preserveAspectRatio="none"><path d="M0 40 Q 180 10 360 40 T 720 40 T 1080 40 T 1440 40 T 1800 40 T 2160 40 T 2520 40 T 2880 40 V90 H0Z" fill="#3b8fd0" opacity=".55"/><path d="M0 55 Q 240 30 480 55 T 960 55 T 1440 55 T 1920 55 T 2400 55 T 2880 55 V90 H0Z" fill="#2f8fd0"/></svg>
      </div>
      <div class="ocean-water" style="top:${water0}px;height:${waterH}px;background:linear-gradient(${stops})"></div>
      <div class="rays" style="top:${water0}px"></div>
      ${zones}${marks}${crit}
      <div class="ocean-end" style="top:${yOfD(DEPTH_MAX) + 90}px">
        <h3>挑战者深渊</h3>
        <p>马里亚纳海沟最深处，约 10,935 米。这里的水压超过 1,100 个大气压，没有一丝阳光——但依然有生命。到过这里的人，比登上过月球的人还要少。</p>
        <button class="btn btn-primary" type="button">↑ 浮回海面</button>
      </div>`;
    B.$$('.critter', col).forEach(el => { const c = B.data.ocean.find(o => o.n === el.dataset.n); el.onclick = () => B.openDetail(detail(c)); B.photo.fill(el.querySelector('.cph'), c); });
    B.$('.ocean-end button', col).onclick = () => sc.scrollTo({ top: 0, behavior: 'smooth' });
    zoneCta = {};
    B.$$('.zone-title', col).forEach((el, i) => {
      const z = B.data.zones[i], c = B.live.cta({ kicker: 'LIVE · OBIS 海洋生物记录', title: `${z.n}的全部生物`, unit: '个分类单元', color: z.c, cls: 'cta-inline' });
      c.onclick = () => showZone(z);
      el.appendChild(c); zoneCta[z.n] = c;
      if (zoneCount[z.n]) c.set({ n: zoneCount[z.n] });
      else obis(z, 0, 1).then(j => { zoneCount[z.n] = j.total; setCount(z); }).catch(() => c.set({ n: '—' }));
    });
    // HUD 刻度
    const bar = B.$('.dh-bar', hud);
    bar.innerHTML = '<div class="knob"></div>' + B.data.zones.map(z => `<div class="tick" style="top:${(yOfD(z.a) - VH) / (yOfD(DEPTH_MAX) - VH) * 100}%">${z.n}</div>`).join('');
    sizeSnow();
    update();
  }

  function detail(c) {
    const z = zoneAt(c.dep);
    return {
      i: c.i, color: c.g || z.c, title: c.n, latin: c.l, en: c.e, photo: c,
      tags: [{ t: z.n, c: z.c }, { t: c.range }].concat(c.g ? [{ t: '✦ 生物发光', c: c.g, solid: true }] : []),
      stats: [['展示深度', `${c.dep.toLocaleString('zh-CN')} 米`], ['栖息深度', c.range], ['水压', `约 ${Math.round(pressure(c.dep)).toLocaleString('zh-CN')} 个大气压`], ['水温', `约 ${temp(c.dep).toFixed(1)} ℃`]],
      desc: c.d, fact: c.f,
      actions: B.current === 'ocean' ? [] : [{ label: '下潜到这里', fn: () => B.go('ocean', () => V.diveTo(c.dep)) }]
    };
  }

  /* ---------- 全部海洋生物：OBIS 按深度统计的完整名录 ---------- */
  const zoneCount = {}, OBIS_PER = 100;
  let zoneCta = {}, floatCta, floatZone = null;
  function setCount(z) {
    if (zoneCta[z.n]) zoneCta[z.n].set({ n: zoneCount[z.n] });
    if (floatZone === z) floatCta.set({ n: zoneCount[z.n] });
  }
  const obis = (z, skip, size) => fetch(`https://api.obis.org/v3/checklist?startdepth=${z.a}&enddepth=${z.b}&size=${size}&skip=${skip}`).then(r => r.ok ? r.json() : Promise.reject(r.status));
  const SP_RANK = new Set(['Species', 'Subspecies', 'Variety', 'Forma']);
  function showZone(z) {
    panel.show({ key: z.n, color: z.c, kicker: 'LIVE · OBIS 海洋生物多样性信息系统', title: `${z.n}的全部生物`, sub: `${z.a.toLocaleString('zh-CN')}–${z.b.toLocaleString('zh-CN')} 米`,
      source: '数据来自 OBIS 全球海洋物种记录（含细菌、浮游生物、鱼类、无脊椎动物等），按记录数排序；照片来自维基百科 / iNaturalist。',
      summary: n => `OBIS 在这一深度记录到 <b>${B.live.fmt(n)}</b> 个分类单元，下面按记录数列出其中鉴定到“种”的生物`,
      load: page => obis(z, (page - 1) * OBIS_PER, OBIS_PER).then(j => ({ total: j.total, more: page * OBIS_PER < j.total,
        items: j.results.filter(r => SP_RANK.has(r.taxonRank)).map(r => {
          const path = [r.kingdom, r.phylum, r.class].filter(Boolean).join(' › ');
          return { name: r.vernacularName || r.scientificName, latin: r.scientificName, meta: `${B.live.fmt(r.records)} 条记录 · ${r.class || r.phylum || r.kingdom || ''}`, ph: { l: r.scientificName },
            open: () => B.live.openName(r.scientificName, { color: z.c, tags: [{ t: z.n, c: z.c }, { t: 'OBIS 记录' }], stats: [['深度带', `${z.n}（${z.a}–${z.b} 米）`], ['OBIS 记录', `${B.live.fmt(r.records)} 条`], ['分类', path]] }) };
        }) })) });
  }

  function update() {
    const top = sc.scrollTop;
    const d = Math.max(0, dOfY(top + VH * 0.5));
    const z = zoneAt(d);
    B.$('.d', hud).innerHTML = `${Math.round(d).toLocaleString('zh-CN')}<small>米</small>`;
    B.$('.zn', hud).textContent = top + VH * 0.5 < VH ? '海面以上' : `${z.n} · ${z.e.split(' · ')[1] || ''}`;
    const L = light(d);
    B.$('[data-k=p]', hud).textContent = `${pressure(d).toFixed(d < 100 ? 1 : 0)} atm`;
    B.$('[data-k=t]', hud).textContent = `${temp(d).toFixed(1)} ℃`;
    B.$('[data-k=l]', hud).textContent = L >= 0.01 ? `${L.toFixed(L >= 1 ? 0 : 2)} %` : '≈ 0';
    const f = B.clamp((top + VH * 0.5 - VH) / (yOfD(DEPTH_MAX) - VH), 0, 1);
    B.$('.knob', hud).style.top = f * 100 + '%';
    const darkness = B.clamp((d - 150) / 850, 0, 1);
    dark.style.opacity = darkness * 0.97;
    hud.style.setProperty('--accent', z.c);
    if (floatZone !== z) { floatZone = z; floatCta.set({ title: `${z.n}的全部生物`, color: z.c, n: zoneCount[z.n] || null }); }
    if (darkness > 0.6 && !tipShown) { tipShown = true; tip.classList.add('show'); setTimeout(() => tip.classList.remove('show'), 5000); }
    V._depth = d;
  }

  /* ---------- 海洋雪与气泡 ---------- */
  function sizeSnow() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    snow.width = VW * dpr; snow.height = VH * dpr;
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    flakes = d3.range(160).map(() => ({ x: Math.random() * VW, y: Math.random() * VH, r: Math.random() * 1.6 + 0.3, v: Math.random() * 0.4 + 0.15, w: Math.random() * 6.28, glow: 0 }));
    fish = d3.range(70).map(() => ({ x: VW * 0.5 + (Math.random() - 0.5) * 300, y: VH * 0.5 + (Math.random() - 0.5) * 200, vx: Math.random() - 0.5, vy: Math.random() - 0.5, s: 0.7 + Math.random() * 0.6 }));
  }
  let lastTop = 0, fish = [], mpx = -999, mpy = -999;
  // 鱼群：跟随一个缓慢游动的目标，遇到鼠标会四散躲开
  function drawFish(t, alpha) {
    const tx = VW * (0.5 + 0.32 * Math.sin(t / 5200)), ty = VH * (0.45 + 0.18 * Math.sin(t / 3100));
    sctx.fillStyle = `rgba(200,235,255,${0.55 * alpha})`;
    for (const f of fish) {
      f.vx += (tx - f.x) * 0.00012 + (Math.random() - 0.5) * 0.06; f.vy += (ty - f.y) * 0.00012 + (Math.random() - 0.5) * 0.06;
      const dx = f.x - mpx, dy = f.y - mpy, d2 = dx * dx + dy * dy;
      if (d2 < 140 * 140) { const d = Math.sqrt(d2) || 1; f.vx += dx / d * 0.9; f.vy += dy / d * 0.9; }
      const sp = Math.hypot(f.vx, f.vy), mx = 3.2; if (sp > mx) { f.vx *= mx / sp; f.vy *= mx / sp; }
      f.vx *= 0.985; f.vy *= 0.985; f.x += f.vx; f.y += f.vy;
      const a = Math.atan2(f.vy, f.vx), s = 7 * f.s;
      sctx.save(); sctx.translate(f.x, f.y); sctx.rotate(a);
      sctx.beginPath(); sctx.moveTo(s, 0); sctx.quadraticCurveTo(0, -s * 0.45, -s, 0); sctx.quadraticCurveTo(0, s * 0.45, s, 0); sctx.fill();
      sctx.beginPath(); sctx.moveTo(-s * 0.8, 0); sctx.lineTo(-s * 1.4, -s * 0.4); sctx.lineTo(-s * 1.4, s * 0.4); sctx.fill();
      sctx.restore();
    }
  }
  function loop(t) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const top = sc.scrollTop, dy = top - lastTop; lastTop = top;
    const d = V._depth || 0;
    sctx.clearRect(0, 0, VW, VH);
    const bubbles = d < 120 && top > VH * 0.3;
    const fishA = B.clamp(1 - Math.abs(d - 60) / 140, 0, 1) * (top > VH * 0.4 ? 1 : 0);
    if (fishA > 0.02) drawFish(t, fishA);
    const snowA = B.clamp((d - 100) / 600, 0, 1);
    for (const f of flakes) {
      f.w += 0.01;
      if (bubbles) { f.y -= f.v * 3 + dy * 0.3; } else { f.y += f.v - dy * 0.6; }
      f.x += Math.sin(f.w) * 0.25;
      if (f.y > VH + 5) { f.y = -5; f.x = Math.random() * VW; }
      if (f.y < -5) { f.y = VH + 5; f.x = Math.random() * VW; }
      if (bubbles) {
        sctx.strokeStyle = 'rgba(220,245,255,.45)'; sctx.lineWidth = 0.8;
        sctx.beginPath(); sctx.arc(f.x, f.y, f.r * 2.2, 0, 7); sctx.stroke();
      } else if (snowA > 0) {
        // 深处的浮游生物：鼠标靠近时被“惊扰”而发出蓝绿色生物光
        const dx = f.x - mpx, dy = f.y - mpy, near = dx * dx + dy * dy < 130 * 130;
        if (near && d > 300) f.glow = 1; else f.glow *= 0.965;
        if (f.glow > 0.05) {
          sctx.globalCompositeOperation = 'lighter';
          sctx.fillStyle = `rgba(90,255,230,${f.glow})`; sctx.beginPath(); sctx.arc(f.x, f.y, f.r * 2.4, 0, 7); sctx.fill();
          sctx.fillStyle = `rgba(90,255,230,${f.glow * 0.25})`; sctx.beginPath(); sctx.arc(f.x, f.y, f.r * 7, 0, 7); sctx.fill();
          sctx.globalCompositeOperation = 'source-over';
        }
        sctx.fillStyle = `rgba(210,230,255,${0.5 * snowA})`;
        sctx.beginPath(); sctx.arc(f.x, f.y, f.r, 0, 7); sctx.fill();
      }
    }
  }

  V.diveTo = function (dep, instant) {
    sc.scrollTo({ top: yOfD(dep) - VH * 0.5, behavior: instant ? 'auto' : 'smooth' });
  };
  V.init = function (el) {
    root = el;
    el.innerHTML = `<div class="ocean-scroll"><div class="ocean-col"></div></div>
      <div class="darkness"></div>
      <canvas class="snow"></canvas>
      <div class="depth-hud">
        <div class="dh-read glass"><div class="d">0<small>米</small></div><div class="zn">海面</div>
          <dl><dt>水压</dt><dd data-k="p">1 atm</dd><dt>水温</dt><dd data-k="t">26 ℃</dd><dt>光照</dt><dd data-k="l">100 %</dd></dl></div>
        <div class="dh-bar"></div>
      </div>
      <div class="light-tip glass">🔦 黑暗中只有发光生物可见 —— 移动鼠标，用手电筒照亮深海</div>`;
    sc = B.$('.ocean-scroll', el); col = B.$('.ocean-col', el); snow = B.$('.snow', el); sctx = snow.getContext('2d');
    hud = B.$('.depth-hud', el); dark = B.$('.darkness', el); tip = B.$('.light-tip', el);
    sc.addEventListener('scroll', update, { passive: true });
    panel = B.live.panel(el);
    floatCta = B.live.cta({ kicker: 'LIVE · 这一深度', title: '光合带的全部生物', unit: '个分类单元', color: B.data.zones[0].c, cls: 'cta-float' });
    floatCta.onclick = () => showZone(zoneAt(V._depth || 0));
    el.appendChild(floatCta);
    sc.addEventListener('click', e => { if (e.target.closest('.critter, button')) return; const deep = (V._depth || 0) > 300; B.fx.burst(e.clientX, e.clientY, { colors: deep ? ['#5affe6', '#4fb8ff', '#c05bff'] : ['#bfe9ff', '#ffffff', '#4fb8ff'], count: 50, power: 5, life: 70, gravity: deep ? 0 : -0.08, mode: deep ? 'radial' : 'fountain', ringSize: 100 }); });
    sc.addEventListener('pointermove', e => {
      const r = root.getBoundingClientRect();
      mpx = e.clientX - r.left; mpy = e.clientY - r.top;
      dark.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      dark.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
    B.$('.dh-bar', hud).style.pointerEvents = 'auto';
    B.$('.dh-bar', hud).addEventListener('click', e => { const r = e.currentTarget.getBoundingClientRect(); const f = (e.clientY - r.top) / r.height; sc.scrollTo({ top: VH + f * (yOfD(DEPTH_MAX) - VH) - VH * 0.5, behavior: 'smooth' }); });
    build();
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (B.current === 'ocean') { const d = V._depth; build(); V.diveTo(d, true); } }, 200); });
  };
  V.enter = function () { if (root.clientHeight !== VH || root.clientWidth !== VW) build(); if (!running) { running = true; raf = requestAnimationFrame(loop); } };
  V.leave = function () { running = false; cancelAnimationFrame(raf); };
  V.key = function (e) { if (e.key === 'Escape' && panel.isOpen()) { panel.hide(); return; } if (e.key === 'ArrowDown' || e.key === 'PageDown') { sc.scrollBy({ top: VH * 0.6, behavior: 'smooth' }); e.preventDefault(); } if (e.key === 'ArrowUp' || e.key === 'PageUp') { sc.scrollBy({ top: -VH * 0.6, behavior: 'smooth' }); e.preventDefault(); } };
  V.index = () => B.data.ocean.map(c => ({ title: c.n, en: c.e, latin: c.l, sub: `深海 · ${c.dep.toLocaleString('zh-CN')} 米 · ${zoneAt(c.dep).n}`, i: c.i, ph: c, kw: '深海 海洋', go: () => { V.diveTo(c.dep); setTimeout(() => B.openDetail(detail(c)), 1100); } }));
  B.views.ocean = V;
})();
