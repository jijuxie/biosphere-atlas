/* 首页：3D 粒子变形标题、物种星球、数字滚动、七种视角卡片、24 小时生命时钟 */
(function () {
  const B = BIO;
  const V = {};
  let scroller, heroOn = true, has3d = false;

  /* ---------- 3D 粒子标题 ---------- */
  function heroSetup(el) {
    const canvas = B.$('#hero-canvas', el), hero = B.$('.hero', el);
    const sub = B.$('#hero-sub', el), idxEl = B.$('#hero-idx', el), dots = B.$('#hero-dots', el);
    const SEQ = B.hero3d ? B.hero3d.SEQ : [];
    dots.innerHTML = SEQ.map((s, i) => `<button type="button" aria-label="${B.esc(s.s || s.k)}" data-i="${i}"><i></i></button>`).join('');
    has3d = B.hero3d && B.hero3d.init(canvas, {
      host: hero,
      onChange: (st, i) => {
        B.fx.scramble(sub, st.sub, 700);
        idxEl.textContent = `${String(i + 1).padStart(2, '0')} / ${SEQ.length}`;
        B.$$('button', dots).forEach((d, k) => { d.classList.toggle('on', k === i); d.classList.toggle('done', k < i); });
        hero.style.setProperty('--hc', (st.pal && st.pal[0]) || ({ earth: '#3cf0c8', helix: '#a17bff', tree: '#6dffb0' })[st.k] || '#5ef2ff');
      }
    });
    if (!has3d) { hero.classList.add('no3d'); return; }
    B.$$('button', dots).forEach(d => d.onclick = e => { e.stopPropagation(); B.hero3d.go(+d.dataset.i, 'burst'); });
    hero.addEventListener('click', e => {
      if (e.target.closest('a, button')) return;
      B.fx.burst(e.clientX, e.clientY, { count: 120, power: 14, ringSize: 260 });
      B.hero3d.next(['burst', 'vortex', 'implode', 'wave', 'rain'][(Math.random() * 5) | 0]);
    });
    addEventListener('resize', () => { if (B.current === 'home') B.hero3d.resize(); });
    // 滚出首屏后暂停渲染，节省性能
    scroller.addEventListener('scroll', () => {
      const on = scroller.scrollTop < innerHeight * 0.9;
      if (on !== heroOn) { heroOn = on; on && B.current === 'home' ? B.hero3d.start() : B.hero3d.stop(); }
    }, { passive: true });
  }

  /* ---------- 物种星球：真实照片组成的 3D 球体 ---------- */
  function orbSetup(el) {
    const stage = B.$('.orb-stage', el), cap = B.$('.orb-cap', el);
    if (!stage) return;
    const pool = B.data.species.filter((s, i) => i % 2 === 0 || /plant|fungi|micro|invert/.test(s.c)).slice(0, 96);
    const n = pool.length, ga = Math.PI * (3 - Math.sqrt(5));
    const tiles = pool.map((s, i) => {
      const y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(1 - y * y), th = ga * i;
      const t = B.h(`<button type="button" class="orb-tile" style="--cc:${B.CATS[s.c].c}"><span>${s.i || ''}</span></button>`);
      t.onclick = () => B.openDetail(B.views.map.detail(s));
      t.onmouseenter = () => { cap.innerHTML = `<b>${s.i || ''} ${B.esc(s.n)}</b><i>${B.esc(s.l)}</i>`; cap.classList.add('on'); hover = true; };
      t.onmouseleave = () => { cap.classList.remove('on'); hover = false; };
      stage.appendChild(t);
      B.photo.fill(t, s);
      return { el: t, x: Math.cos(th) * r, y, z: Math.sin(th) * r };
    });
    let ry = 0, rx = -0.25, vy = 0.004, vx = 0, drag = null, hover = false, visible = false, raf = 0;
    const R = () => Math.min(stage.clientWidth, 640) * 0.42;
    function frame() {
      if (B.current !== 'home') { raf = 0; return; }
      raf = requestAnimationFrame(frame);
      if (!drag) { ry += hover ? vy * 0.15 : vy; rx += vx; vx *= 0.94; vy += (0.004 - vy) * 0.02; rx += (-0.25 - rx) * 0.01; }
      const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx), rad = R();
      for (const t of tiles) {
        const x1 = t.x * cy + t.z * sy, z1 = -t.x * sy + t.z * cy;
        const y2 = t.y * cx - z1 * sx, z2 = t.y * sx + z1 * cx;
        const k = (z2 + 1.6) / 2.6;
        t.el.style.transform = `translate3d(${x1 * rad}px, ${y2 * rad}px, ${z2 * rad}px) scale(${0.55 + k * 0.6})`;
        t.el.style.opacity = 0.18 + k * 0.82;
        t.el.style.zIndex = Math.round(k * 100);
        t.el.style.filter = z2 < -0.2 ? 'grayscale(.7) blur(1px)' : '';
      }
    }
    stage.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, ry, rx }; stage.setPointerCapture(e.pointerId); });
    stage.addEventListener('pointermove', e => { if (!drag) return; const ny = drag.ry + (e.clientX - drag.x) * 0.004, nx = B.clamp(drag.rx + (e.clientY - drag.y) * 0.004, -1.2, 1.2); vy = ny - ry; vx = nx - rx; ry = ny; rx = nx; });
    stage.addEventListener('pointerup', () => { drag = null; });
    new IntersectionObserver(es => es.forEach(e => {
      visible = e.isIntersecting;
      if (visible && B.current === 'home' && !raf) raf = requestAnimationFrame(frame);
      if (!visible) { cancelAnimationFrame(raf); raf = 0; }
    }), { root: scroller }).observe(stage);
    V._orbKick = () => { if (visible && !raf) raf = requestAnimationFrame(frame); };
  }

  /* ---------- 数字滚动 ---------- */
  function counters() {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      const el = e.target, to = +el.dataset.count, fmt = el.dataset.fmt, suf = el.dataset.suffix || '';
      const t0 = performance.now(), dur = 1800;
      (function tick(now) {
        const k = Math.min(1, (now - t0) / dur), v = to * (1 - Math.pow(1 - k, 4));
        el.textContent = fmt === 'wan' ? `${(v / 1e4).toFixed(v >= 1e6 ? 0 : 1)} 万` : Math.round(v) + suf;
        if (k < 1) requestAnimationFrame(tick);
      })(t0);
    }), { root: scroller, threshold: 0.4 });
    B.$$('[data-count]').forEach(el => io.observe(el));
  }

  /* ---------- 七种视角：卡片倾斜与光效（卡片里的动态场景见 lenses.js） ---------- */
  function portals(el) {
    B.$$('.lens', el).forEach(p => {
      p.addEventListener('pointermove', e => {
        const r = p.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        p.style.setProperty('--mx', x * 100 + '%'); p.style.setProperty('--my', y * 100 + '%');
        p.style.transform = `rotateY(${(x - 0.5) * 6}deg) rotateX(${(0.5 - y) * 5}deg) translateZ(6px)`;
      });
      p.addEventListener('pointerenter', e => B.fx.burst(e.clientX, e.clientY, { count: 26, power: 4, life: 40, size: 1.6, colors: [getComputedStyle(p).getPropertyValue('--c1'), getComputedStyle(p).getPropertyValue('--c2'), '#ffffff'], ring: false }));
      p.addEventListener('pointerleave', () => { p.style.transform = ''; });
    });
    B.lenses && B.lenses.init(el, scroller);
  }

  /* ---------- 24 小时生命时钟 ---------- */
  const EARTH = 4540, DAY = 86400;
  const EVENTS = [
    { t: 4540, n: '地球形成', d: '一团炽热的岩浆球，月球在一次大碰撞中诞生。' },
    { t: 3800, n: '生命出现', d: '最早的单细胞生命在海洋中出现——在这一天的凌晨。' },
    { t: 3480, n: '叠层石', d: '微生物席堆积成层，留下了最古老的生命化石之一。' },
    { t: 2400, n: '大氧化事件', d: '蓝细菌释放的氧气改变了大气，许多厌氧生物因此灭绝。' },
    { t: 1800, n: '真核生物', d: '拥有细胞核和线粒体的复杂细胞登场。' },
    { t: 700, n: '雪球地球', d: '地球几乎被冰雪完全覆盖。' },
    { t: 538.8, n: '寒武纪大爆发', d: '现代动物的主要门类在极短时间内集体登场——此时已是晚上 9 点多。' },
    { t: 470, n: '植物登陆', d: '绿色第一次覆盖大地。' },
    { t: 365, n: '四足动物登陆', d: '我们的祖先从水中爬上陆地。' },
    { t: 251.9, n: '二叠纪末大灭绝', d: '史上最惨烈的大灭绝，绝大多数海洋物种消失。' },
    { t: 233, n: '恐龙出现', d: '恐龙登场，统治地球约 1.6 亿年。' },
    { t: 130, n: '开花植物', d: '花朵第一次绽放在地球上。' },
    { t: 66, n: '恐龙灭绝', d: '小行星撞击地球，非鸟恐龙退场——此时已是 23:39。' },
    { t: 2.8, n: '人属出现', d: '最早的人属成员在东非出现——离午夜还不到 1 分钟。' },
    { t: 0.3, n: '智人出现', d: '在午夜前约 6 秒，智人才在非洲出现。' },
    { t: 0.04, n: '尼安德特人消失', d: '我们最后一个近亲人种退出舞台，此后地球上只剩下智人一种人类。' },
    { t: 0.0117, n: '农业出现', d: '冰期结束，人类开始种植与驯养——在午夜前约 0.2 秒。' },
    { t: 0.00026, n: '工业革命', d: '在午夜前约 0.005 秒，人类开始大规模改变地球。' }
  ];
  const toSec = t => (EARTH - t) / EARTH * DAY;
  const fmtClock = s => {
    s = Math.min(DAY - 0.0001, s);
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60, p2 = n => String(n).padStart(2, '0');
    const left = DAY - s;
    return `${p2(h)}:${p2(m)}:${p2(Math.floor(ss))}${left < 1 ? '.' + String(Math.floor((ss % 1) * 1000)).padStart(3, '0') : ''}`;
  };
  const pctText = s => { const p = s / DAY * 100; return p < 99 ? p.toFixed(1) + '%' : p < 99.999 ? p.toFixed(3) + '%' : p.toFixed(6) + '%'; };
  const periodOf = t => B.data.periods.find(p => t <= p.a && t >= p.b) || B.data.periods[0];

  function clock() {
    const svg = d3.select('#life-clock'), R = 232, LATE = 21 * 3600;
    const deg = s => s / DAY * 360;
    const pol = (s, r) => { const a = (s / DAY) * Math.PI * 2 - Math.PI / 2; return [Math.cos(a) * r, Math.sin(a) * r]; };
    const defs = svg.append('defs');
    const lg = defs.append('linearGradient').attr('id', 'clk-g').attr('x1', 0).attr('x2', 1).attr('y1', 0).attr('y2', 1);
    lg.append('stop').attr('offset', 0).attr('stop-color', '#5ef2ff'); lg.append('stop').attr('offset', 1).attr('stop-color', '#a17bff');
    const rg = defs.append('radialGradient').attr('id', 'clk-face');
    rg.append('stop').attr('offset', 0).attr('stop-color', '#16234a').attr('stop-opacity', 0.9);
    rg.append('stop').attr('offset', 0.7).attr('stop-color', '#0a1128').attr('stop-opacity', 0.75);
    rg.append('stop').attr('offset', 1).attr('stop-color', '#02040a').attr('stop-opacity', 0);
    const sw = defs.append('linearGradient').attr('id', 'clk-sweep').attr('x1', 1).attr('x2', 0).attr('y1', 0).attr('y2', 0);
    sw.append('stop').attr('offset', 0).attr('stop-color', '#5ef2ff').attr('stop-opacity', 0.32); sw.append('stop').attr('offset', 1).attr('stop-color', '#5ef2ff').attr('stop-opacity', 0);
    const glow = defs.append('filter').attr('id', 'clk-glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
    glow.append('feGaussianBlur').attr('stdDeviation', 4).attr('result', 'b');
    const mg = glow.append('feMerge'); mg.append('feMergeNode').attr('in', 'b'); mg.append('feMergeNode').attr('in', 'SourceGraphic');

    svg.append('circle').attr('r', R + 70).attr('fill', 'url(#clk-face)');
    const r = (() => { let s = 9; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const stars = svg.append('g').attr('class', 'clk-stars');
    for (let i = 0; i < 70; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (R - 40); stars.append('circle').attr('cx', Math.cos(a) * d).attr('cy', Math.sin(a) * d).attr('r', r() * 1.1 + 0.3).style('--d', (r() * 4).toFixed(2) + 's'); }
    svg.append('circle').attr('r', R + 34).attr('fill', 'none').attr('stroke', 'rgba(150,180,255,.12)');
    svg.append('circle').attr('r', R - 24).attr('fill', 'rgba(4,8,20,.55)').attr('stroke', 'rgba(150,180,255,.12)');
    // 10 分钟一格的细刻度、整点粗刻度
    for (let m = 0; m < 144; m++) {
      const s = m * 600, big = m % 6 === 0, [x1, y1] = pol(s, R + 26), [x2, y2] = pol(s, R + (big ? 34 : 30));
      svg.append('line').attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2).attr('stroke', big ? 'rgba(170,200,255,.55)' : 'rgba(150,180,255,.18)').attr('stroke-width', big ? 1.4 : 1);
    }
    for (let h = 0; h < 24; h += 3) {
      const [x, y] = pol(h * 3600, R - 46);
      svg.append('text').attr('class', 'clk-hr').attr('x', x).attr('y', y).text(String(h).padStart(2, '0'));
    }
    // 地质年代环
    B.data.periods.forEach(p => {
      const a0 = toSec(Math.min(p.a, EARTH)) / DAY * Math.PI * 2, a1 = toSec(p.b) / DAY * Math.PI * 2;
      svg.append('path').attr('class', 'clk-per').attr('d', d3.arc()({ innerRadius: R - 15, outerRadius: R - 1, startAngle: a0, endAngle: Math.max(a1, a0 + 0.004), padAngle: 0.004 }))
        .attr('fill', p.c).append('title').text(`${p.n} · ${p.e}`);
    });
    // “最后 3 小时”括弧
    const br = R + 52;
    svg.append('path').attr('d', d3.arc()({ innerRadius: br, outerRadius: br + 1.5, startAngle: LATE / DAY * Math.PI * 2, endAngle: Math.PI * 2 - 0.004 })).attr('fill', '#ff8fb1').attr('opacity', 0.7);
    [LATE, DAY - 1].forEach(s => { const [x1, y1] = pol(s, br - 5), [x2, y2] = pol(s, br + 6); svg.append('line').attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2).attr('stroke', '#ff8fb1').attr('stroke-width', 1.5); });
    const [bx, by] = pol(22.5 * 3600, br + 18);
    svg.append('text').attr('class', 'clk-late').attr('x', bx).attr('y', by).attr('text-anchor', 'end').text('最后 3 小时 · 动植物的全部历史');

    // 已经走过的进度弧 + 扫光 + 指针
    const prog = svg.append('path').attr('fill', 'url(#clk-g)').attr('filter', 'url(#clk-glow)');
    const progArc = d3.arc().innerRadius(R + 6).outerRadius(R + 10).cornerRadius(2).startAngle(0);
    const hand = svg.append('g').attr('class', 'clk-hand');
    const wedge = d3.arc().innerRadius(0).outerRadius(R - 24);
    for (let i = 0; i < 12; i++) hand.append('path').attr('d', wedge({ startAngle: -(i + 1) * 0.045, endAngle: -i * 0.045 })).attr('fill', '#5ef2ff').attr('opacity', 0.16 * (1 - i / 12) ** 2);
    hand.append('line').attr('x1', 0).attr('y1', 22).attr('x2', 0).attr('y2', -(R - 30)).attr('stroke', 'url(#clk-g)').attr('stroke-width', 2.4).attr('stroke-linecap', 'round').attr('filter', 'url(#clk-glow)');
    hand.append('circle').attr('cy', -(R - 30)).attr('r', 3.5).attr('fill', '#fff');
    svg.append('circle').attr('r', 7).attr('fill', '#02040a').attr('stroke', '#5ef2ff').attr('stroke-width', 2);
    svg.append('text').attr('class', 'clk-c1').attr('y', 74).text('45.4 亿年 = 24 小时');
    svg.append('text').attr('class', 'clk-c2').attr('y', 96).text('1 秒 ≈ 5.3 万年 · 1 分钟 ≈ 315 万年');

    // 事件点：21:00 之前在表盘外标注名字；之后太密集，只画点，名字放到下方的“放大”条里
    const evG = svg.append('g');
    const evEls = EVENTS.map((e, i) => {
      const s = toSec(e.t), [x, y] = pol(s, R + 8), late = s >= LATE && e.t !== EARTH;
      const g = evG.append('g').attr('class', 'clk-ev' + (late ? ' late' : '') + (e.t < 3 ? ' human' : ''));
      g.append('circle').attr('class', 'clk-ping').attr('cx', x).attr('cy', y).attr('r', 6);
      g.append('circle').attr('class', 'clk-dot').attr('cx', x).attr('cy', y).attr('r', late ? 3 : 4.5);
      if (!late) {
        const [lx, ly] = pol(s, R + 58), dx = lx / (R + 58);
        const anchor = e.t === EARTH ? 'middle' : dx > 0.25 ? 'start' : dx < -0.25 ? 'end' : 'middle';
        g.append('text').attr('class', 'clk-lab').attr('x', lx).attr('y', e.t === EARTH ? ly - 8 : ly).attr('text-anchor', anchor).attr('dominant-baseline', 'middle').text(e.n);
      }
      g.on('mouseenter', () => show(i)).on('click', () => show(i));
      return g;
    });

    // “放大最后时刻”：最后 3 小时 / 1 分钟 / 1 秒
    const strips = [
      { n: '最后 3 小时', a: DAY - 3 * 3600, u: '≈ 5.7 亿年', ticks: 6, lab: s => fmtClock(s).slice(0, 5) },
      { n: '最后 1 分钟', a: DAY - 60, u: '≈ 315 万年', ticks: 6, lab: s => fmtClock(s).slice(0, 8) },
      { n: '最后 1 秒', a: DAY - 1, u: '≈ 5.3 万年', ticks: 5, lab: s => s >= DAY ? '24:00' : '−' + (DAY - s).toFixed(1).replace(/\.0$/, '') + ' 秒' }
    ];
    const stripBox = B.$('.clk-strips');
    stripBox.innerHTML = strips.map((st, k) => {
      const span = DAY - st.a;
      const evs = EVENTS.map((e, i) => ({ e, i, s: toSec(e.t) })).filter(o => o.s >= st.a && (k === 2 || DAY - o.s > span * 0.02));
      const ticks = d3.range(st.ticks + 1).map(j => { const s = st.a + span * j / st.ticks; return `<span class="cs-tick" style="left:${j / st.ticks * 100}%"><em>${j === st.ticks ? '24:00' : st.lab(s)}</em></span>`; }).join('');
      const marks = evs.map((o, j) => `<button type="button" class="cs-ev ${j % 2 ? 'dn' : 'up'} ${o.e.t < 3 ? 'human' : ''}" data-i="${o.i}" style="left:${(o.s - st.a) / span * 100}%"><i></i><span><b>${fmtClock(o.s).slice(0, k === 2 ? 12 : 8)}</b>${B.esc(o.e.n)}</span></button>`).join('');
      return `<div class="cs"><div class="cs-l"><b>${st.n}</b><span>${st.u}</span></div><div class="cs-track"><div class="cs-bar"></div>${ticks}${marks}</div></div>`;
    }).join('');
    stripBox.addEventListener('mouseover', e => { const b = e.target.closest('.cs-ev'); if (b) { stop(); show(+b.dataset.i); } });
    stripBox.addEventListener('click', e => { const b = e.target.closest('.cs-ev'); if (b) { stop(); show(+b.dataset.i); } });

    const info = B.$('#clock-info');
    const q = sel => info.querySelector(sel);
    let curDeg = 0, cur = 0;
    function show(i) {
      cur = (i + EVENTS.length) % EVENTS.length;
      const e = EVENTS[cur], s = toSec(e.t), p = periodOf(e.t);
      q('.ci-time').textContent = fmtClock(s);
      q('.ci-title').textContent = e.n;
      q('.ci-desc').textContent = e.d;
      q('.clk-ago').textContent = `距今约 ${B.fmtAgo(e.t)}`;
      const era = q('.clk-era'); era.textContent = p.n; era.style.setProperty('--ec', p.c);
      q('.clk-prog i').style.width = (s / DAY * 100) + '%';
      q('.clk-pct b').textContent = pctText(s);
      info.style.setProperty('--ec', p.c);
      info.classList.remove('flip'); void info.offsetWidth; info.classList.add('flip');
      evEls.forEach((g, k) => g.classed('on', k === cur).classed('past', toSec(EVENTS[k].t) <= s));
      B.$$('.cs-ev', stripBox).forEach(b => b.classList.toggle('on', +b.dataset.i === cur));
      // 指针只向前转：回到开头时多转一圈
      let to = deg(s); if (to < curDeg - 0.01) to += 360;
      const from = curDeg;
      hand.interrupt().transition().duration(900).ease(d3.easeCubicInOut).attrTween('transform', () => t => `rotate(${from + (to - from) * t})`)
        .on('end', () => { hand.attr('transform', `rotate(${to % 360})`); });
      prog.interrupt().transition().duration(900).ease(d3.easeCubicInOut).attrTween('d', () => t => { const a = (from + (to - from) * t) % 360; return progArc({ endAngle: Math.max(0.001, a / 180 * Math.PI) }); });
      curDeg = to % 360;
    }
    let playing = true;
    const play = B.$('[data-play]', info);
    function stop() { playing = false; play.textContent = '自动播放'; play.classList.remove('on'); }
    function start() { playing = true; play.textContent = '暂停'; play.classList.add('on'); }
    play.classList.add('on');
    play.onclick = () => playing ? stop() : (start(), show(cur + 1));
    B.$$('[data-d]', info).forEach(b => b.onclick = () => { stop(); show(cur + +b.dataset.d); });
    let hoverClock = false;
    const wrap = B.$('.clk');
    wrap.addEventListener('pointerenter', () => { hoverClock = true; });
    wrap.addEventListener('pointerleave', () => { hoverClock = false; });
    show(0);
    V._clockTimer = setInterval(() => { if (B.current === 'home' && playing && !hoverClock && document.visibilityState === 'visible') show(cur + 1); }, 3600);
  }

  V.init = function (el) {
    scroller = B.$('.home-scroll', el);
    heroSetup(el);
    B.$('.hero-cta .btn-ghost', el).addEventListener('click', e => { e.preventDefault(); B.$('#portals').scrollIntoView({ behavior: 'smooth' }); });
    counters(); portals(el); clock(); orbSetup(el);
    B.fx.reveal(el, scroller);
  };
  V.enter = function () { if (has3d && heroOn) B.hero3d.start(); V._orbKick && V._orbKick(); B.lenses && B.lenses.kick(); };
  V.leave = function () { if (has3d) B.hero3d.stop(); };
  B.views.home = V;
})();
