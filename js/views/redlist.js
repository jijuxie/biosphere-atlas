/* 红色名录视角：生命体征心电图、IUCN 等级光谱、类群受威胁比例、威胁来源、复兴之路 */
(function () {
  const B = BIO;
  const V = {};
  let root, sc, ecg, ectx, gridEl, infoEl, running = false, raf = 0, cur = 'CR';
  let EW = 0, EH = 0, trace = [], phase = 0, beatAmp = 1, lastT = 0, sparks = [];

  /* ---------- 物种池：把各视角的数据按等级汇总 ---------- */
  function pool() {
    const out = [];
    B.data.species.forEach(s => out.push({ ph: s, s: s.s, n: s.n, l: s.l, i: s.i, meta: `${B.REGIONS[s.r].t} · ${B.CATS[s.c].t}`, open: () => B.openDetail(B.views.map.detail(s)) }));
    B.data.redExtra.forEach(s => out.push({ ph: s, s: s.s, n: s.n, l: s.l, i: s.i, meta: `${B.CATS[s.c].t} · 仅存于人工环境`, open: () => B.openDetail(extraDetail(s)) }));
    B.data.extinct.forEach(e => out.push({ ph: e, s: 'EX', fx: e.s === 'FX', n: e.n, l: e.l, i: e.i, meta: e.y ? `公元 ${e.y} 年${e.s === 'FX' ? ' · 功能性灭绝' : ''}` : `约 ${B.fmtAgo(e.span ? e.span[1] : e.t)}`, open: () => B.openDetail(B.views.time.detail(e)) }));
    return out;
  }
  function extraDetail(s) {
    const st = B.STATUS[s.s];
    return { i: s.i, color: st.c, title: s.n, latin: s.l, en: s.e, photo: s,
      tags: [{ t: B.CATS[s.c].t, c: B.CATS[s.c].c }, { t: `IUCN ${s.s} · ${st.t}`, c: st.c, solid: true }],
      stats: [['体型', s.z], ['原产地', s.h], ['保护等级', `${st.t}（${s.s}）`]], desc: s.d, fact: s.f };
  }
  function recDetail(r) {
    const to = B.STATUS[r.to];
    return { i: r.i, color: to.c, title: r.n, latin: r.l, en: null, photo: { l: r.l },
      tags: [{ t: '保护成功案例', c: '#4ade80', solid: true }, { t: `${r.fromLabel || B.STATUS[r.from].t} → ${to.t}`, c: to.c }],
      stats: [[`${r.ya} 年`, `${r.a ? r.a.toLocaleString('zh-CN') : '野外为 0'} ${r.unit}`], [`${r.yb} 年`, `${r.approx ? '约 ' : ''}${r.b.toLocaleString('zh-CN')}${r.plus ? '+' : ''} ${r.unit}${r.note ? `（${r.note}）` : ''}`]],
      desc: r.d, fact: '保护是有效的。研究显示，如果没有保护行动，过去几十年中鸟类和哺乳动物的灭绝数量可能会是现在的 3–4 倍。' };
  }

  /* ---------- 全球名单：iNaturalist 中带 IUCN 评估的全部物种 ---------- */
  const CSI = new Set(['EX', 'EW', 'CR', 'EN', 'VU', 'NT', 'LC', 'DD']);
  const inatRed = k => B.live.inatCounts(`csi=${k}&verifiable=any`);
  let panel;

  /* ---------- 等级光谱 ---------- */
  function selectCat(k, scroll) {
    cur = k;
    const c = B.data.iucn.find(x => x.k === k), st = B.STATUS[k];
    B.$$('.rl-node', root).forEach(n => n.classList.toggle('on', n.dataset.k === k));
    const list = pool().filter(p => p.s === k);
    infoEl.style.setProperty('--sc', st.c);
    infoEl.innerHTML = `<div class="rl-code">${k}</div><div class="rl-def"><h3>${c.t}<small>${c.e}</small></h3><p>${c.d}</p></div><div class="rl-cnt"><b>${list.length}</b><span>本站收录</span></div>`;
    if (CSI.has(k)) {
      const b = B.live.cta({ kicker: 'LIVE · iNaturalist × IUCN', title: `全球所有「${c.t}」物种`, unit: '种', color: st.c, cls: 'cta-inline rl-all' });
      infoEl.appendChild(b);
      inatRed(k)(1).then(r => { if (cur === k) b.set({ n: r.total }); }).catch(() => b.set({ n: '—' }));
      b.onclick = () => panel.show({ color: st.c, kicker: 'LIVE · iNaturalist × IUCN', title: `全球所有「${c.t}」物种`, sub: `IUCN ${k} · ${c.e}`,
        source: '名单来自 iNaturalist 收录的 IUCN 红色名录评估，只包含在 iNaturalist 上有观测记录的物种，按观测次数排序。',
        summary: n => `iNaturalist 记录到 <b>${B.live.fmt(n)}</b> 个被 IUCN 评为「${c.t}」的物种`, load: inatRed(k) });
    }
    gridEl.innerHTML = '';
    if (!list.length) gridEl.innerHTML = '<p class="rl-empty">本站暂未收录该等级的物种。</p>';
    list.forEach((p, i) => {
      const card = B.h(`<button class="rl-card" type="button" style="--sc:${st.c};--d:${Math.min(i, 30) * 25}ms">
        <span class="rc-ic"><span>${p.i || `<em>${B.esc(p.n[0])}</em>`}</span></span>
        <span class="rc-tx"><b>${B.esc(p.n)}</b><small>${B.esc(p.l || '')}</small><i>${B.esc(p.meta)}</i></span>
        <span class="st" style="--sc:${p.fx ? '#a1a1aa' : st.c}">${p.fx ? 'FX' : k}</span></button>`);
      card.onclick = p.open;
      B.photo.fill(card.querySelector('.rc-ic'), p.ph);
      gridEl.appendChild(card);
    });
    if (scroll) B.$('.rl-spectrum', root).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- 心电图 ---------- */
  function sizeEcg() {
    const d = Math.min(devicePixelRatio || 1, 1.5);
    EW = ecg.clientWidth; EH = ecg.clientHeight;
    ecg.width = EW * d; ecg.height = EH * d; ectx.setTransform(d, 0, 0, d, 0, 0);
    trace = new Array(Math.ceil(EW / 2)).fill(0);
  }
  function wave(p) {
    // 一次心跳（0–1）：P 波、QRS 波群、T 波
    const g = (x, m, s, a) => a * Math.exp(-((x - m) ** 2) / (2 * s * s));
    return g(p, 0.18, 0.025, 0.12) - g(p, 0.3, 0.008, 0.18) + g(p, 0.33, 0.012, 1) - g(p, 0.37, 0.01, 0.32) + g(p, 0.6, 0.045, 0.25);
  }
  function drawEcg(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t;
    const steps = Math.max(1, Math.round(dt * 160));
    for (let i = 0; i < steps; i++) {
      phase += 1 / 150;
      if (phase >= 1) { phase -= 1; beatAmp = 0.55 + Math.random() * 0.45; }
      trace.push(wave(phase) * beatAmp);
      trace.shift();
    }
    ectx.clearRect(0, 0, EW, EH);
    // 监护仪网格
    ectx.strokeStyle = 'rgba(255,77,109,.06)'; ectx.lineWidth = 1;
    for (let x = (-(t / 20) % 40); x < EW; x += 40) { ectx.beginPath(); ectx.moveTo(x, 0); ectx.lineTo(x, EH); ectx.stroke(); }
    for (let y = 0; y < EH; y += 40) { ectx.beginPath(); ectx.moveTo(0, y); ectx.lineTo(EW, y); ectx.stroke(); }
    const mid = EH * 0.5, amp = EH * 0.32;
    const grad = ectx.createLinearGradient(0, 0, EW, 0);
    grad.addColorStop(0, 'rgba(255,77,109,0)'); grad.addColorStop(0.7, 'rgba(255,77,109,.7)'); grad.addColorStop(1, '#ff9aae');
    ectx.strokeStyle = grad; ectx.lineWidth = 2; ectx.shadowColor = '#ff4d6d'; ectx.shadowBlur = 12;
    ectx.beginPath();
    trace.forEach((v, i) => { const x = i * 2, y = mid - v * amp; i ? ectx.lineTo(x, y) : ectx.moveTo(x, y); });
    ectx.stroke(); ectx.shadowBlur = 0;
    const last = trace[trace.length - 1];
    ectx.fillStyle = '#fff'; ectx.beginPath(); ectx.arc((trace.length - 1) * 2, mid - last * amp, 3, 0, 7); ectx.fill();
    // 心跳峰值时，从光点迸出火花
    const hx = (trace.length - 1) * 2, hy = mid - last * amp;
    if (last > 0.6 && !V._peak) { V._peak = true; for (let i = 0; i < 26; i++) { const a = Math.random() * 6.283, s = 1 + Math.random() * 4; sparks.push({ x: hx, y: hy, vx: Math.cos(a) * s - 1.5, vy: Math.sin(a) * s, l: 1 }); } }
    if (last < 0.2) V._peak = false;
    ectx.globalCompositeOperation = 'lighter';
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.vx *= 0.97; p.l -= 0.022;
      if (p.l <= 0) { sparks.splice(i, 1); continue; }
      ectx.fillStyle = `rgba(255,${120 + p.l * 120 | 0},${140 * p.l | 0},${p.l})`; ectx.beginPath(); ectx.arc(p.x, p.y, 1.6 * p.l + 0.4, 0, 7); ectx.fill();
    }
    ectx.globalCompositeOperation = 'source-over';
  }
  function loop(t) { if (!running) return; raf = requestAnimationFrame(loop); if (sc.scrollTop < EH + 200) drawEcg(t); }

  /* ---------- 入场动画 ---------- */
  function countUp(el) {
    const to = +el.dataset.to, from = +(el.dataset.from || 0), fmt = el.dataset.fmt, t0 = performance.now(), dur = 1800;
    (function tick(now) {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4), v = from + (to - from) * e;
      el.textContent = (fmt === 'wan' ? `${(v / 1e4).toFixed(1)} 万` : Math.round(v).toLocaleString('zh-CN')) + (el.dataset.suffix || '');
      if (k < 1) requestAnimationFrame(tick);
      else if (el.closest('.rl-rec')) B.fx.burstAt(el, { colors: [getComputedStyle(el.closest('.rl-rec')).getPropertyValue('--tc'), '#ffffff', '#4ade80'], count: 40, power: 5, life: 50, ringSize: 90 });
    })(t0);
  }
  function observe() {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      e.target.classList.add('in');
      B.$$('[data-to]', e.target).forEach(countUp);
      if (e.target.dataset.to) countUp(e.target);
    }), { root: sc, threshold: 0.25 });
    B.$$('.rl-observe', root).forEach(el => io.observe(el));
  }

  /* ---------- 构建 ---------- */
  V.init = function (el) {
    root = el;
    const I = B.data.iucn;
    const nodes = I.map((c, i) => `<button class="rl-node" type="button" data-k="${c.k}" style="--sc:${B.STATUS[c.k].c};grid-column:${i + 1}"><span class="rn-c">${c.k}</span><span class="rn-t">${c.t}</span></button>`).join('');
    const groups = B.data.redGroups.map(g => {
      const icons = d3.range(10).map(i => { const f = B.clamp(g.p / 10 - i, 0, 1); return `<span class="pg"><span class="pg-b">${g.i}</span><span class="pg-f" style="width:${f * 100}%">${g.i}</span></span>`; }).join('');
      return `<div class="rl-group rl-observe" style="--p:${g.p}%"><div class="rg-h"><b>${g.i} ${g.n}</b><span><em data-to="${g.p}">0</em>%</span></div><div class="rg-pic">${icons}</div><div class="rg-bar"><i></i></div><p>${g.d}</p></div>`;
    }).join('');
    const threats = B.data.threats.map((t, i) => `<div class="rl-threat rl-observe" style="--tc:${t.c};--d:${i * 80}ms"><div class="th-i">${t.i}</div><h4>${t.n}</h4><p>${t.d}</p><small>例：${t.ex}</small></div>`).join('');
    const recs = B.data.recoveries.map((r, i) => {
      const fs = B.STATUS[r.from], ts = B.STATUS[r.to];
      const factor = r.a ? `× ${Math.round(r.b / r.a).toLocaleString('zh-CN')}` : '从零开始';
      return `<button class="rl-rec rl-observe" type="button" data-i="${i}" style="--tc:${ts.c};--fc:${fs.c};--d:${(i % 3) * 90}ms">
        <div class="rr-top"><span class="rr-ic"><span>${r.i}</span></span><b>${r.n}</b><span class="rr-st"><span class="st" style="--sc:${fs.c}">${r.fromLabel || r.from}</span>→<span class="st" style="--sc:${ts.c}">${r.to}</span></span></div>
        <div class="rr-num"><div><small>${r.ya}</small><b>${r.approx && r.a ? '≈' : ''}${r.a ? r.a.toLocaleString('zh-CN') : '0'}</b></div><span class="rr-arrow">⟶</span><div class="rr-now"><small>${r.yb}${r.note ? ' · ' + r.note : ''}</small><b>${r.approx ? '≈' : ''}<em data-to="${r.b}" data-from="${r.a}">${r.a}</em>${r.plus ? '+' : ''}</b></div></div>
        <div class="rr-bar"><i></i><span>${factor} · 单位：${r.unit}</span></div>
        <p>${r.d}</p></button>`;
    }).join('');

    el.innerHTML = `<div class="rl-scroll">
      <section class="rl-hero">
        <canvas class="rl-ecg"></canvas>
        <div class="rl-hero-copy">
          <div class="eyebrow"><span class="pulse-dot rl-dot"></span>06 · IUCN RED LIST · 地球生命体征监测中</div>
          <h2>红色名录</h2>
          <p>世界自然保护联盟（IUCN）红色名录是全球物种灭绝风险的“体检报告”。<br>它告诉我们谁正处于危险之中——也告诉我们，保护真的有用。</p>
          <div class="rl-stats">
            <div class="rl-observe"><b data-to="172000" data-fmt="wan" data-suffix="+">0</b><span>已被评估的物种</span></div>
            <div class="rl-observe"><b data-to="48000" data-fmt="wan" data-suffix="+">0</b><span>受威胁物种</span></div>
            <div class="rl-observe"><b><em data-to="28">0</em>%</b><span>已评估物种中受威胁的比例</span></div>
          </div>
          <div class="rl-src">数据：IUCN 红色名录（2025 年），数字为近似值</div>
        </div>
        <div class="scroll-hint"><span></span>向下查看</div>
      </section>

      <section class="rl-sec">
        <h2 class="section-title" data-reveal><small>THE CATEGORIES</small>九个等级，一条通往灭绝的路</h2>
        <p class="section-sub" data-reveal>IUCN 依据种群数量、下降速度和分布范围，把每个物种归入下面九个等级之一。点击任意等级，查看本站收录的对应物种。</p>
        <div class="rl-spectrum" data-reveal>
          <div class="rl-brk" style="grid-column:1/3">灭绝</div>
          <div class="rl-brk thr" style="grid-column:3/6">受威胁</div>
          <div class="rl-brk" style="grid-column:6/8">低危</div>
          <div class="rl-brk" style="grid-column:8/10">信息不足</div>
          <div class="rl-line"></div>
          ${nodes}
        </div>
        <div class="rl-info"></div>
        <div class="rl-grid"></div>
      </section>

      <section class="rl-sec">
        <h2 class="section-title" data-reveal><small>WHO IS AT RISK</small>谁最危险</h2>
        <p class="section-sub" data-reveal>在已被评估的物种中，受威胁（易危、濒危、极危）物种所占的比例。每个图标代表该类群的十分之一。</p>
        <div class="rl-groups" data-reveal>${groups}</div>
      </section>

      <section class="rl-sec">
        <h2 class="section-title" data-reveal><small>THE DRIVERS</small>威胁从何而来</h2>
        <p class="section-sub" data-reveal>几乎所有的威胁都指向同一个源头：人类活动。好消息是，这也意味着我们有能力改变它。</p>
        <div class="rl-threats">${threats}</div>
      </section>

      <section class="rl-sec">
        <h2 class="section-title" data-reveal><small>THE COMEBACKS</small>复兴之路</h2>
        <p class="section-sub" data-reveal>灭绝并非不可逆转。这些物种曾经只剩下几只、几十只，甚至在野外彻底消失——如今它们正在回来。</p>
        <div class="rl-recs">${recs}</div>
      </section>

      <footer class="foot rl-foot">
        <p class="rl-hope">红色名录不是讣告，而是一份行动清单。</p>
        <p>数据综合自 IUCN 红色名录、中国国家林业和草原局及各物种保护项目的公开报告，数字为近似值，仅供科普参考。</p>
      </footer>
    </div>`;
    sc = B.$('.rl-scroll', el); ecg = B.$('.rl-ecg', el); ectx = ecg.getContext('2d');
    gridEl = B.$('.rl-grid', el); infoEl = B.$('.rl-info', el);
    panel = B.live.panel(el);
    B.$$('.rl-node', el).forEach(n => n.onclick = e => { selectCat(n.dataset.k); B.fx.burst(e.clientX, e.clientY, { color: B.STATUS[n.dataset.k].c, count: 80, power: 9, ringSize: 160 }); });
    B.$$('.rl-rec', el).forEach(c => { const r = B.data.recoveries[+c.dataset.i]; c.onclick = () => B.openDetail(recDetail(r)); B.photo.fill(c.querySelector('.rr-ic'), { l: r.l }); });
    selectCat(cur);
    sizeEcg(); observe();
    B.fx.reveal(el, sc);
    addEventListener('resize', () => { if (B.current === 'redlist') sizeEcg(); });
  };
  V.enter = function () { if (ecg.clientWidth !== EW) sizeEcg(); if (!running) { running = true; raf = requestAnimationFrame(loop); } };
  V.leave = function () { running = false; cancelAnimationFrame(raf); };
  V.showCat = k => selectCat(k, true);
  V.index = () => [].concat(
    B.data.iucn.map(c => ({ title: c.t, en: c.e, sub: `IUCN 等级 · ${c.k} · ${c.e}`, kw: `${c.k} 红色名录 等级 iucn`, i: '🛑', go: () => V.showCat(c.k) })),
    B.data.redExtra.map(s => ({ title: s.n, en: s.e, latin: s.l, sub: `${s.l} · 野外灭绝`, i: s.i, ph: s, kw: '红色名录', go: () => { V.showCat('EW'); setTimeout(() => B.openDetail(extraDetail(s)), 700); } })),
    B.data.recoveries.map(r => ({ ph: { l: r.l }, title: `${r.n} 的复兴`, sub: `保护成功 · ${r.ya} 年 ${r.a} → ${r.yb} 年 ${r.b.toLocaleString('zh-CN')} ${r.unit}`, i: r.i, kw: `${r.n} 保护 恢复 复兴 成功`, go: () => { B.$('.rl-recs', root).scrollIntoView({ behavior: 'smooth' }); setTimeout(() => B.openDetail(recDetail(r)), 700); } })),
    B.data.threats.map(t => ({ title: t.n, sub: `威胁 · ${t.d.slice(0, 26)}…`, i: t.i, kw: '威胁 原因', go: () => B.$('.rl-threats', root).scrollIntoView({ behavior: 'smooth' }) }))
  );
  V.key = e => { if (e.key === 'Escape' && panel.isOpen()) panel.hide(); };
  B.views.redlist = V;
})();
