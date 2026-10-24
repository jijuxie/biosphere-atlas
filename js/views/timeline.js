/* 时间视角：46 亿年横向时间轴，地质年代、五次大灭绝、多样性曲线与已灭绝生物 */
(function () {
  const B = BIO;
  const V = {};
  let root, scroller, track, svg, hudEra, hudAge, mini, miniWin, tl, alertEl;
  let W = 0, H = 0, axisY = 0, total = 0, X0 = 0, X1 = 0;
  let target = 0, raf = 0, running = false, lastCenter = null, built = false;
  let xOf, maOf, panel, eraCta;

  /* ---------- 分段对数时间尺度 ---------- */
  const SEG_MA = () => [4600, 538.8, 251.9, 66, 2.58, 0.0117, 0.0005, B.yearToMa(B.NOW_YEAR)];
  const SEG_PX = [2600, 4200, 3800, 2600, 2400, 1400, 3200];
  function buildScale() {
    const ma = SEG_MA(), u = ma.map(Math.log10);
    const xs = [X0]; SEG_PX.forEach((p, i) => xs.push(xs[i] + p));
    const s = d3.scaleLinear().domain(u).range(xs).clamp(true);
    xOf = m => s(Math.log10(Math.max(m, ma[ma.length - 1])));
    maOf = x => Math.pow(10, s.invert(x));
    X1 = xs[xs.length - 1];
  }
  const tOf = e => e.y ? B.yearToMa(e.y) : e.t;
  const periodAt = m => B.data.periods.find(p => m <= p.a && m >= p.b) || (m > 4600 ? B.data.periods[0] : B.data.periods[B.data.periods.length - 1]);

  /* ---------- 构建 ---------- */
  function build() {
    W = root.clientWidth; H = root.clientHeight;
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 64;
    axisY = Math.round(navH + 120 + (H - navH - 120 - 70) * 0.48);
    X0 = Math.max(W / 2, Math.min(W, 640) + 120);
    buildScale();
    total = X1 + W / 2 + Math.min(W, 680);
    track.style.width = total + 'px';
    track.innerHTML = '';
    svg = d3.select(track).append('svg').attr('class', 'tl-svg').attr('width', total).attr('height', H);
    const defs = svg.append('defs');
    const dg = defs.append('linearGradient').attr('id', 'tl-div').attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
    dg.append('stop').attr('offset', 0).attr('stop-color', '#ffb547').attr('stop-opacity', 0.35);
    dg.append('stop').attr('offset', 1).attr('stop-color', '#ffb547').attr('stop-opacity', 0);
    const mg = defs.append('linearGradient').attr('id', 'tl-mx').attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
    mg.append('stop').attr('offset', 0).attr('stop-color', '#ff4d6d').attr('stop-opacity', 0);
    mg.append('stop').attr('offset', 0.5).attr('stop-color', '#ff4d6d').attr('stop-opacity', 0.9);
    mg.append('stop').attr('offset', 1).attr('stop-color', '#ff4d6d').attr('stop-opacity', 0);
    const glow = defs.append('filter').attr('id', 'tl-glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
    glow.append('feGaussianBlur').attr('stdDeviation', 4).attr('result', 'b');
    const fm = glow.append('feMerge'); fm.append('feMergeNode').attr('in', 'b'); fm.append('feMergeNode').attr('in', 'SourceGraphic');

    // 年代背景色带 + 色条
    const P = B.data.periods;
    P.forEach(p => {
      const x0 = xOf(p.a), x1 = xOf(p.b), w = x1 - x0;
      svg.append('rect').attr('x', x0).attr('y', 0).attr('width', w).attr('height', H).attr('fill', p.c).attr('opacity', 0.035);
      svg.append('line').attr('x1', x0).attr('x2', x0).attr('y1', axisY - 220).attr('y2', axisY + 220).attr('stroke', p.c).attr('stroke-opacity', 0.25).attr('stroke-dasharray', '2 6');
      svg.append('rect').attr('x', x0).attr('y', axisY - 15).attr('width', w).attr('height', 30).attr('fill', p.c).attr('opacity', 0.85);
      if (w > 70) {
        const labelX = x0 + Math.min(w / 2, 90);
        svg.append('text').attr('x', labelX).attr('y', axisY + 5).attr('text-anchor', 'middle').attr('fill', '#02040a').attr('font-size', 13).attr('font-weight', 700).attr('letter-spacing', '.2em').text(p.n);
        if (w > 400) svg.append('text').attr('x', x0 + w - 90).attr('y', axisY + 5).attr('text-anchor', 'middle').attr('fill', '#02040a').attr('font-size', 11).attr('opacity', 0.7).attr('letter-spacing', '.15em').text(p.e.toUpperCase());
      }
    });
    // 刻度
    const ticks = [4500, 4000, 3500, 3000, 2500, 2000, 1500, 1000, 800, 600, 500, 450, 400, 350, 300, 250, 200, 150, 100, 66, 50, 40, 30, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001]
      .concat([1600, 1700, 1800, 1850, 1900, 1950, 1980, 2000, 2010, 2020].map(B.yearToMa));
    const tg = svg.append('g');
    ticks.forEach(m => {
      const x = xOf(m);
      tg.append('line').attr('x1', x).attr('x2', x).attr('y1', axisY - 22).attr('y2', axisY - 16).attr('stroke', 'rgba(200,215,255,.5)');
      tg.append('text').attr('x', x).attr('y', axisY - 27).attr('text-anchor', 'middle').attr('fill', 'rgba(200,215,255,.55)').attr('font-size', 10).attr('font-family', 'SF Mono,Menlo,monospace').text(B.fmtAgo(m).replace(' 年前', '').replace('公元 ', ''));
    });
    // 多样性曲线
    const div = B.data.diversity;
    const maxD = d3.max(div, d => d[1]);
    const yD = d3.scaleLinear().domain([0, maxD]).range([axisY - 40, Math.max(150, axisY - 300)]);
    const area = d3.area().x(d => xOf(d[0])).y0(axisY - 40).y1(d => yD(d[1])).curve(d3.curveMonotoneX);
    const line = d3.line().x(d => xOf(d[0])).y(d => yD(d[1])).curve(d3.curveMonotoneX);
    svg.append('path').datum(div).attr('d', area).attr('fill', 'url(#tl-div)');
    svg.append('path').datum(div).attr('d', line).attr('fill', 'none').attr('stroke', '#ffb547').attr('stroke-opacity', 0.55).attr('stroke-width', 1.4);
    svg.append('text').attr('x', xOf(500)).attr('y', yD(maxD) - 8).attr('fill', 'rgba(255,181,71,.6)').attr('font-size', 11).attr('letter-spacing', '.15em').text('海洋动物属多样性（示意）');

    // 生存时段条
    B.data.extinct.filter(e => e.span).forEach((e, i) => {
      const x0 = xOf(e.span[0]), x1 = xOf(e.span[1]);
      const y = axisY + 19 + i * 5;
      svg.append('rect').attr('x', x0).attr('y', y).attr('width', x1 - x0).attr('height', 3).attr('rx', 1.5).attr('fill', periodAt(e.span[0]).c).attr('opacity', 0.7);
    });
    // 里程碑
    B.data.milestones.forEach((m, i) => {
      const x = xOf(m.t), y = axisY + 34 + (i % 2) * 16;
      svg.append('path').attr('d', `M${x},${axisY - 5}l5,5l-5,5l-5,-5z`).attr('fill', '#fff').attr('opacity', 0.9);
      svg.append('line').attr('x1', x).attr('x2', x).attr('y1', axisY + 15).attr('y2', y - 9).attr('stroke', 'rgba(255,255,255,.3)');
      svg.append('text').attr('x', x).attr('y', y).attr('text-anchor', 'middle').attr('fill', 'rgba(230,240,255,.8)').attr('font-size', 11).text(m.n);
    });
    // 大灭绝
    B.data.massExtinctions.forEach(mx => {
      const x = xOf(mx.t);
      svg.append('rect').attr('x', x - 1.5).attr('y', 0).attr('width', 3).attr('height', H).attr('fill', 'url(#tl-mx)').attr('filter', 'url(#tl-glow)');
      svg.append('circle').attr('cx', x).attr('cy', axisY).attr('r', 9).attr('fill', '#ff4d6d').attr('filter', 'url(#tl-glow)')
        .append('animate').attr('attributeName', 'r').attr('values', '7;13;7').attr('dur', '1.6s').attr('repeatCount', 'indefinite');
      track.appendChild(B.h(`<div class="tl-mx-tag" style="left:${x}px;top:${axisY}px">☄ ${mx.name}</div>`));
    });
    // 现在
    const xNow = xOf(0);
    svg.append('rect').attr('x', xNow - 1).attr('y', 0).attr('width', 2).attr('height', H).attr('fill', 'url(#tl-mx)');
    svg.append('text').attr('x', xNow).attr('y', axisY + 72).attr('text-anchor', 'middle').attr('fill', '#ff4d6d').attr('font-size', 13).attr('font-weight', 700).attr('letter-spacing', '.3em').text('现在');

    placeCards();

    // 开场与结尾
    track.appendChild(B.h(`<div class="tl-intro" style="left:${Math.max(32, X0 - Math.min(W, 640) - 40)}px">
      <h2>四十六亿年<br><em>生命的来与去</em></h2>
      <p>地球上曾经存在过的物种中，超过 99% 已经永远消失。它们大多在五次“大灭绝”中谢幕，也有许多，就消失在我们眼前。</p>
      <div class="hint"><i></i>滚动滚轮 / 拖动 / 方向键 穿越时间</div></div>`));
    track.appendChild(B.h(`<div class="tl-outro" style="left:${xNow + 140}px">
      <h2>第六次大灭绝？</h2>
      <p>科学家估计，当前的物种灭绝速率是自然背景速率的数十到数百倍。与前五次不同，这一次的推手不是火山或小行星，而是我们自己。</p>
      <div class="big"><div><b>4.8 万+</b><span>IUCN 评估的受威胁物种</span></div><div><b>~73%</b><span>1970 年以来监测的野生<br>脊椎动物种群平均下降</span></div></div>
      <p style="font-size:13px;color:var(--mute)">数据：IUCN 红色名录、WWF《地球生命力报告 2024》。但白头海雕、座头鲸、朱鹮与大熊猫的回归也证明——灭绝并非不可逆转。</p></div>`));

    buildMini();
    embersInit();
    built = true;
  }

  function placeCards() {
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 64;
    const CH = 128, CW = innerWidth <= 760 ? 180 : 222;
    const topSpace = axisY - 46 - (navH + 104), botSpace = (H - 70) - (axisY + 70);
    const nT = B.clamp(Math.floor(topSpace / CH), 1, 3), nB = B.clamp(Math.floor(botSpace / CH), 1, 3);
    const lanes = [];
    for (let i = 0; i < Math.max(nT, nB); i++) {
      if (i < nT) lanes.push({ top: axisY - 46 - CH * (i + 1) + 10, up: true, end: -1e9 });
      if (i < nB) lanes.push({ top: axisY + 70 + CH * i, up: false, end: -1e9 });
    }
    const items = B.data.extinct.map(e => ({ e, m: tOf(e), x: xOf(tOf(e)) })).sort((a, b) => a.x - b.x);
    const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) en.target.classList.add('in'); }), { root: scroller, rootMargin: '0px 120px' });
    items.forEach(it => {
      let lane = lanes.find(l => l.end < it.x - 18);
      let left = it.x - 18;
      if (!lane) { lane = lanes.reduce((a, b) => (a.end < b.end ? a : b)); left = lane.end + 10; }
      lane.end = left + CW;
      const e = it.e, pc = e.y ? '#ff4d6d' : periodAt(it.m).c;
      const when = e.y ? `公元 ${e.y} 年${e.s === 'FX' ? ' · 功能性灭绝' : ''}` : e.span ? `${B.fmtAgo(e.span[0])} — ${B.fmtAgo(e.span[1])}` : `约 ${B.fmtAgo(it.m)}`;
      const card = B.h(`<div class="tl-card ${e.y ? 'recent' : ''}" style="left:${left}px;top:${lane.top}px;--pc:${pc}">
        <div class="tc-top"><span class="tc-ic ${e.i ? '' : 'g'}"><span>${e.i || B.esc(e.n.slice(0, 1))}</span></span><div><b>${B.esc(e.n)}</b><time>${when}</time></div></div>
        <p>${B.esc(e.d)}</p>${e.span ? '<div class="tc-span"></div>' : ''}</div>`);
      card.onclick = () => { if (!V._dragMoved) B.openDetail(detail(e)); };
      B.photo.fill(card.querySelector('.tc-ic'), e);
      track.appendChild(card);
      io.observe(card);
      e._x = it.x;
      // 连接线
      const cy = lane.up ? lane.top + 112 : lane.top;
      svg.append('path').attr('d', `M${it.x},${axisY + (lane.up ? -15 : 15)} L${it.x},${(axisY + cy) / 2} L${left + 18},${(axisY + cy) / 2} L${left + 18},${cy}`)
        .attr('fill', 'none').attr('stroke', pc).attr('stroke-opacity', 0.45).attr('stroke-width', 1);
      svg.append('circle').attr('cx', it.x).attr('cy', axisY).attr('r', 4).attr('fill', pc).attr('stroke', '#02040a').attr('stroke-width', 1.5);
    });
  }

  function buildMini() {
    mini.innerHTML = '<div class="bar"></div><div class="win"></div>';
    const bar = B.$('.bar', mini);
    const mw = mini.clientWidth || (W - 48);
    B.data.periods.forEach(p => {
      const w = (xOf(p.b) - xOf(p.a)) / total * 100;
      bar.insertAdjacentHTML('beforeend', `<span style="width:${w}%;background:${p.c}" title="${p.n}"></span>`);
    });
    bar.insertAdjacentHTML('afterbegin', `<span style="width:${X0 / total * 100}%;background:transparent"></span>`);
    B.data.massExtinctions.forEach(mx => mini.insertAdjacentHTML('beforeend', `<i class="mxm" style="left:${xOf(mx.t) / total * 100}%"></i>`));
    [['冥古宙', 4600], ['寒武纪', 538.8], ['三叠纪', 251.9], ['古近纪', 66], ['更新世', 2.58], ['全新世', 0.0117], ['近代', 0.0005]].forEach(([n, m]) =>
      mini.insertAdjacentHTML('beforeend', `<span class="lbl" style="left:${xOf(m) / total * 100}%">${n}</span>`));
    miniWin = B.$('.win', mini);
    miniWin.style.width = Math.max(6, W / total * mw) + 'px';
  }

  /* ---------- 详情 ---------- */
  function detail(e) {
    const m = tOf(e), p = periodAt(m), pc = e.y ? '#ff4d6d' : p.c;
    const when = e.y ? `公元 ${e.y} 年` : e.span ? `${B.fmtAgo(e.span[0])} — ${B.fmtAgo(e.span[1])}` : `约 ${B.fmtAgo(m)}`;
    return {
      i: e.i, g: e.n, color: pc, title: e.n, latin: e.l, en: e.e, photo: e,
      tags: [{ t: e.k }, { t: p.n, c: p.c }, { t: e.s === 'FX' ? '功能性灭绝' : '已灭绝', c: '#ff4d6d', solid: true }],
      stats: [[e.y ? '最后记录' : '生存年代', when], ['体型', e.z], ['地质年代', `${p.n} · ${p.e}`], ['消失原因', e.cause]],
      desc: e.d, fact: e.f,
      actions: B.current === 'time' ? [] : [{ label: '在时间轴上查看', fn: () => B.go('time', () => V.jumpTo(m)) }]
    };
  }

  V.detail = detail;

  /* ---------- 动画循环 ---------- */
  /* 视差余烬：随年代变色、随滚动反向漂移 */
  let embers = [], embersColor = '#ffb547', ec, ectx, lastSL = 0;
  function embersInit() {
    ec = B.$('.tl-embers', root); ectx = ec.getContext('2d');
    const d = Math.min(devicePixelRatio || 1, 1.5); ec.width = W * d; ec.height = H * d; ectx.setTransform(d, 0, 0, d, 0, 0);
    embers = Array.from({ length: 170 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: 0.2 + Math.random() * 0.8, r: Math.random() * 1.8 + 0.4, v: Math.random() * 0.4 + 0.1, ph: Math.random() * 6.28 }));
  }
  function embersDraw(t) {
    if (!ectx) return;
    const sl = scroller.scrollLeft, dv = sl - lastSL; lastSL = sl;
    ectx.clearRect(0, 0, W, H);
    ectx.globalCompositeOperation = 'lighter';
    const n = parseInt(embersColor.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    for (const e of embers) {
      e.x -= dv * e.z * 0.35; e.y -= e.v * e.z; e.x += Math.sin(t / 900 + e.ph) * 0.2;
      if (e.x < -10) e.x += W + 20; if (e.x > W + 10) e.x -= W + 20; if (e.y < -10) { e.y = H + 10; e.x = Math.random() * W; }
      const a = (0.25 + 0.5 * Math.sin(t / 500 + e.ph * 3) ** 2) * e.z;
      ectx.fillStyle = `rgba(${r},${g},${b},${a})`;
      ectx.beginPath(); ectx.arc(e.x, e.y, e.r * e.z * (1 + Math.min(3, Math.abs(dv) * 0.02)), 0, 6.283); ectx.fill();
    }
    ectx.globalCompositeOperation = 'source-over';
  }

  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    embersDraw(now || 0);
    const maxS = total - W;
    target = B.clamp(target, 0, maxS);
    const cur = scroller.scrollLeft;
    const nx = cur + (target - cur) * 0.12;
    if (Math.abs(target - cur) > 0.5) scroller.scrollLeft = nx;
    const center = scroller.scrollLeft + W / 2;
    const m = maOf(B.clamp(center, X0, X1));
    const p = center < X0 ? B.data.periods[0] : periodAt(m);
    if (hudEra._p !== p) {
      hudEra._p = p;
      hudEra.innerHTML = `${p.n}<small>${p.e.toUpperCase()}</small>`;
      tl.style.setProperty('--era', p.c);
      embersColor = p.c;
      if (hudEra._init) { B.fx.burst(W / 2, axisY, { color: p.c, count: 60, power: 9, life: 60, ringSize: 220, mode: 'vortex' }); B.fx.scramble(hudEra.firstChild, p.n, 600); }
      hudEra._init = true;
      eraCount(p);
    }
    hudAge.textContent = center < X0 ? '46 亿年前 · 地球诞生之前' : center > X1 ? `公元 ${B.NOW_YEAR} 年 · 现在` : (m > 0.0005 ? '距今 ' : '') + B.fmtAgo(m);
    if (lastCenter !== null && Math.abs(center - lastCenter) < 600) {
      for (const mx of B.data.massExtinctions) {
        const x = xOf(mx.t);
        if ((lastCenter - x) * (center - x) < 0) { B.flash(); B.fx.burst(W / 2, axisY, { colors: ['#ff2a4a', '#ff4d6d', '#ffb547', '#ffffff'], count: 220, power: 22, life: 90, size: 3, ringSize: Math.max(W, H) * 0.5, gravity: 0.12 }); track.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 420 }); }
      }
    }
    lastCenter = center;
    let near = null;
    for (const mx of B.data.massExtinctions) if (Math.abs(xOf(mx.t) - center) < W * 0.22) near = mx;
    if (near !== alertEl._mx) {
      alertEl._mx = near;
      if (near) alertEl.innerHTML = `<div class="mx-n">MASS EXTINCTION · ${near.n}大灭绝</div><h4>${near.name}</h4><div class="mx-p">${near.p}<small> 物种消失</small></div><p>${near.d}</p>`;
      alertEl.classList.toggle('show', !!near);
    }
    const mw = mini.clientWidth;
    miniWin.style.transform = `translateX(${scroller.scrollLeft / total * mw}px)`;
  }

  /* ---------- 全部化石生物：Paleobiology Database 按地质年代的完整名录 ---------- */
  const PBDB = 'https://paleobiodb.org/data1.2/taxa/list.json?base_name=Life&rank=genus&show=app,class,img&rowcount';
  // 冥古宙没有生命；人类世不是正式年代，用全新世代替
  const pbInterval = p => p.e === 'Hadean' ? null : p.e === 'Anthropocene' ? 'Holocene' : p.e;
  const counts = {};
  const pbdb = (p, offset, limit) => fetch(`${PBDB}&interval=${pbInterval(p)}&order=n_occs.desc&offset=${offset}&limit=${limit}`).then(r => r.ok ? r.json() : Promise.reject(r.status));
  function eraCount(p) {
    eraCta.set({ title: `${p.n}的全部生物`, color: p.c });
    if (!pbInterval(p)) { eraCta.set({ n: '0', unit: '尚无生命' }); return; }
    eraCta.set({ unit: '属' });
    if (counts[p.e] != null) { eraCta.set({ n: counts[p.e] }); return; }
    eraCta.set({ n: null });
    pbdb(p, 0, 1).then(j => { counts[p.e] = j.records_found; if (hudEra._p === p) eraCta.set({ n: j.records_found }); }).catch(() => eraCta.set({ n: '—' }));
  }
  const clean = v => v && !/^NO_/.test(v) ? v : null;
  function showEra(p) {
    const PER = 60;
    panel.show({ key: p.e, color: p.c, kicker: 'LIVE · PALEOBIOLOGY DATABASE', title: `${p.n}的全部生物`, sub: `${B.fmtAgo(p.a)} – ${p.b ? B.fmtAgo(p.b) : '现在'}`,
      empty: p.e === 'Hadean' ? '冥古宙的地球还是一片岩浆与陨石雨，尚未发现任何生命的化石证据。' : '这一时期暂无化石记录。',
      source: '数据来自 Paleobiology Database 全球化石记录，以“属”为单位，按化石产地数排序；剪影来自 PhyloPic，照片来自维基百科 / iNaturalist。',
      summary: n => `化石记录显示，有 <b>${B.live.fmt(n)}</b> 个属的生物生活在${p.n}`,
      load: page => !pbInterval(p) ? Promise.resolve({ total: 0, items: [], more: false }) : pbdb(p, (page - 1) * PER, PER).then(j => ({ total: j.records_found, more: page * PER < j.records_found,
        items: j.records.filter(r => !r.tdf).map(r => {
          const path = [clean(r.phl), clean(r.cll), clean(r.odl), clean(r.fml)].filter(Boolean).join(' › ');
          const span = `${B.fmtAgo(r.fea)} – ${r.lla ? B.fmtAgo(r.lla) : '现在'}`;
          return { name: r.nam, latin: r.nam, meta: `${clean(r.cll) || clean(r.phl) || '分类未定'} · ${r.ext === '1' ? '现存' : '已灭绝'}`, ph: { l: r.nam },
            icon: r.img ? `https://paleobiodb.org/data1.2/taxa/thumb.png?id=${r.img.replace('php:', '')}` : null,
            open: () => B.live.openName(r.nam, { color: p.c, tags: [{ t: p.n, c: p.c }, { t: r.ext === '1' ? '至今仍有后代存活' : '已灭绝', c: r.ext === '1' ? '#4ade80' : '#ff4d6d', solid: true }],
              stats: [['生存年代', span], ['分类', path], ['化石产地', `${B.live.fmt(r.noc)} 处`]],
              desc: `${r.nam} 是一个${r.ext === '1' ? '至今仍有物种存活的' : '已经灭绝的'}生物属，化石记录跨越 ${span}。` }) };
        }) })) });
  }

  V.jumpTo = function (m, instant) {
    target = xOf(m) - W / 2;
    if (instant) { scroller.scrollLeft = target; lastCenter = null; }
  };

  /* ---------- 交互 ---------- */
  function bind() {
    scroller.addEventListener('wheel', e => {
      e.preventDefault();
      target += B.wheel(e) * 0.9;
    }, { passive: false });
    let drag = null;
    scroller.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, s: scroller.scrollLeft }; V._dragMoved = false;
    });
    addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 4) { V._dragMoved = true; scroller.classList.add('dragging'); }
      target = drag.s - dx * 1.0;
      scroller.scrollLeft = B.lerp(scroller.scrollLeft, target, 0.6);
    });
    addEventListener('pointerup', () => { drag = null; scroller.classList.remove('dragging'); setTimeout(() => { V._dragMoved = false; }, 0); });
    scroller.addEventListener('scroll', () => { if (!drag && Math.abs(scroller.scrollLeft - target) > 40 && !running) target = scroller.scrollLeft; });
    let mdrag = false;
    const miniGo = e => { const r = mini.getBoundingClientRect(); target = (e.clientX - r.left) / r.width * total - W / 2; };
    mini.addEventListener('pointerdown', e => { mdrag = true; miniGo(e); mini.setPointerCapture(e.pointerId); });
    mini.addEventListener('pointermove', e => { if (mdrag) miniGo(e); });
    mini.addEventListener('pointerup', () => { mdrag = false; });
  }

  V.init = function (el) {
    root = el;
    el.innerHTML = `<div class="tl">
      <canvas class="tl-embers"></canvas>
      <div class="tl-scroller"><div class="tl-track"></div></div>
      <div class="tl-hud"><div class="tl-era">冥古宙<small>HADEAN</small></div><div class="tl-age">46 亿年前</div></div>
      <div class="tl-cursor"></div>
      <div class="tl-alert"></div>
      <div class="tl-jumps">
        <button class="ms" data-m="4600">⏮ 地球诞生</button>
        <button class="ms" data-m="538.8">✦ 寒武纪大爆发</button>
        ${B.data.massExtinctions.map(m => `<button data-m="${m.t}">☄ ${m.name}</button>`).join('')}
        <button class="ms" data-m="0.0005">⌛ 近代灭绝</button>
        <button class="ms" data-m="0">⏭ 现在</button>
      </div>
      <div class="tl-mini" title="点击或拖动跳转"></div></div>`;
    tl = B.$('.tl', el); scroller = B.$('.tl-scroller', el); track = B.$('.tl-track', el);
    hudEra = B.$('.tl-era', el); hudAge = B.$('.tl-age', el); mini = B.$('.tl-mini', el); alertEl = B.$('.tl-alert', el);
    panel = B.live.panel(el);
    eraCta = B.live.cta({ kicker: 'LIVE · 全球化石记录', title: '冥古宙的全部生物', unit: '属', color: B.data.periods[0].c, cls: 'cta-hud' });
    eraCta.onclick = () => showEra(hudEra._p || B.data.periods[0]);
    B.$('.tl-hud', el).appendChild(eraCta);
    B.$$('.tl-jumps button', el).forEach(b => b.onclick = () => V.jumpTo(+b.dataset.m === 0 ? B.yearToMa(B.NOW_YEAR) : +b.dataset.m));
    bind();
    let rt;
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (B.current !== 'time') { built = false; return; } const m = maOf(scroller.scrollLeft + W / 2); build(); V.jumpTo(m, true); }, 200); });
  };
  V.enter = function () {
    if (!built || root.clientHeight !== H || root.clientWidth !== W) { const first = !built; build(); if (first) { target = 0; scroller.scrollLeft = 0; } }
    tl.style.setProperty('--axis', axisY - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 64) - 110 + 'px');
    if (!running) { running = true; raf = requestAnimationFrame(loop); }
  };
  V.leave = function () { running = false; cancelAnimationFrame(raf); };
  V.key = function (e) {
    if (e.key === 'Escape' && panel.isOpen()) { panel.hide(); return; }
    if (e.key === 'ArrowRight') target += W * 0.5;
    if (e.key === 'ArrowLeft') target -= W * 0.5;
    if (e.key === 'Home') target = 0;
    if (e.key === 'End') target = total;
  };
  V.index = () => {
    const out = B.data.extinct.map(e => ({ title: e.n, en: e.e, latin: e.l, sub: `${e.l} · ${e.y ? '公元 ' + e.y + ' 年灭绝' : '约 ' + B.fmtAgo(tOf(e))}`, i: e.i, ph: e, go: () => { V.jumpTo(tOf(e)); setTimeout(() => B.openDetail(detail(e)), 900); } }));
    B.data.periods.forEach(p => out.push({ title: p.n, en: p.e, sub: `地质年代 · ${B.fmtAgo(p.a)} — ${p.b ? B.fmtAgo(p.b) : '现在'}`, kw: '地质年代 年代 纪 宙', go: () => V.jumpTo(Math.sqrt(p.a * Math.max(p.b, 1e-6))) }));
    B.data.massExtinctions.forEach(m => out.push({ title: m.name, sub: `第${m.n.slice(1)}大灭绝 · ${m.p} 物种消失`, kw: '大灭绝 灭绝事件', i: '☄️', go: () => V.jumpTo(m.t) }));
    return out;
  };
  B.views.time = V;
})();
