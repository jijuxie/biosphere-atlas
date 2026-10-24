/* 首页“七种视角”卡片里的动态小场景：每张卡一块 canvas，只在卡片可见且停留在首页时绘制（约 30 帧/秒）
   地球 = 自转的地球 + 物种光点 + 迁徙路线；时间 = 显生宙多样性曲线 + 大灭绝；生命树 = 放射状演化树 + 流动光点；
   深海 = 分层海水 + 光柱 + 海洋雪 + 发光生物；尺度 = 十的幂次无限缩放；红色名录 = 受威胁比例点阵；万物 = 实拍照片长廊（CSS） */
(function () {
  const B = BIO;
  const TAU = Math.PI * 2;
  const L = {};
  const list = [];
  let raf = 0, tick = 0;

  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${a})`; };
  const smooth = (a, b, x) => { const k = B.clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const sup = n => String(n).split('').map(ch => SUP[ch]).join('');
  const MONO = 'SF Mono, Menlo, monospace';
  const SANS = getComputedStyle(document.documentElement).getPropertyValue('--sans') || 'sans-serif';
  // 固定的伪随机，保证每次打开画面一致
  function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

  const ARTS = {};

  /* ---------- 01 地球 ---------- */
  ARTS.globe = () => {
    const land = topojson.feature(WORLD_TOPO, WORLD_TOPO.objects.land);
    const grat = d3.geoGraticule10();
    const proj = d3.geoOrthographic().clipAngle(90).precision(0.7);
    const pins = B.data.species.filter(s => s.p).map((s, i) => ({ p: s.p, c: (B.CATS[s.c] || {}).c || '#5ef2ff', ph: (i * 0.618) % 1, ring: i % 5 === 0 }));
    // 几条著名的迁徙路线：北极燕鸥、座头鲸、帝王蝶、灰鲸
    const ROUTES = [
      { c: '#ffffff', legs: [[-40, 72], [-18, 20], [-12, -20], [-30, -68]] },
      { c: '#4fb8ff', legs: [[-62, -64], [-80, -30], [-86, 8]] },
      { c: '#ffb547', legs: [[-80, 46], [-92, 33], [-100, 19.5]] },
      { c: '#3cf0c8', legs: [[-168, 66], [-140, 45], [-113, 27]] }
    ].map(r => {
      const pts = [];
      for (let i = 0; i < r.legs.length - 1; i++) { const f = d3.geoInterpolate(r.legs[i], r.legs[i + 1]); for (let k = 0; k < 30; k++) pts.push(f(k / 30)); }
      pts.push(r.legs[r.legs.length - 1]);
      return { c: r.c, pts };
    });
    const r = rng(7), stars = d3.range(90).map(() => [r(), r(), r() * 1.2 + 0.3, r() * TAU]);
    let path, cx, cy, R;
    return {
      resize(w, h, c) { R = Math.min(w * 0.36, h * 0.4); cx = w * (w > 520 ? 0.62 : 0.5); cy = h * (w > 520 ? 0.42 : 0.36); proj.scale(R).translate([cx, cy]); path = d3.geoPath(proj, c); },
      draw(c, w, h, t, it) {
        c.clearRect(0, 0, w, h);
        for (const s of stars) { c.globalAlpha = 0.25 + 0.35 * Math.sin(t * 1.3 + s[3]) ** 2; c.fillStyle = '#cfe8ff'; c.fillRect(s[0] * w, s[1] * h, s[2], s[2]); }
        c.globalAlpha = 1;
        const lam = t * 9 - 20 + (it.mx - 0.5) * 50 * it.hover, phi = -18 - (it.my - 0.5) * 24 * it.hover;
        proj.rotate([lam, phi]);
        const ctr = [-lam, -phi];
        // 大气光晕
        let g = c.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.4);
        g.addColorStop(0, 'rgba(60,240,200,.38)'); g.addColorStop(0.35, 'rgba(60,156,240,.12)'); g.addColorStop(1, 'rgba(60,156,240,0)');
        c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R * 1.4, 0, TAU); c.fill();
        // 海洋
        g = c.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
        g.addColorStop(0, '#12476a'); g.addColorStop(0.6, '#07203a'); g.addColorStop(1, '#020814');
        c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
        c.beginPath(); path(grat); c.strokeStyle = 'rgba(94,242,255,.07)'; c.lineWidth = 0.7; c.stroke();
        // 陆地
        c.beginPath(); path(land);
        g = c.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
        g.addColorStop(0, 'rgba(70,190,140,.7)'); g.addColorStop(1, 'rgba(20,90,80,.6)');
        c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(127,240,200,.6)'; c.lineWidth = 0.7; c.stroke();
        // 物种光点
        for (const p of pins) {
          if (d3.geoDistance(p.p, ctr) > 1.48) continue;
          const [x, y] = proj(p.p);
          c.globalAlpha = 0.28; c.fillStyle = p.c; c.fillRect(x - 2.5, y - 2.5, 5, 5);
          c.globalAlpha = 1; c.fillRect(x - 1, y - 1, 2, 2);
          if (p.ring) { const k = (t * 0.45 + p.ph) % 1; if (k < 0.4) { c.globalAlpha = (1 - k / 0.4) * 0.75; c.strokeStyle = p.c; c.lineWidth = 1; c.beginPath(); c.arc(x, y, 2 + k * 34, 0, TAU); c.stroke(); } }
        }
        // 迁徙路线：沿大圆逐渐画出，头部一颗亮点
        c.lineWidth = 1.6; c.lineCap = 'round';
        ROUTES.forEach((rt, i) => {
          const k = (t * 0.11 + i * 0.27) % 1, n = Math.max(2, Math.round(rt.pts.length * Math.min(1, k * 1.25)));
          c.globalAlpha = 0.9 * (1 - smooth(0.82, 1, k));
          c.strokeStyle = rt.c; c.setLineDash([4, 4]); c.beginPath(); path({ type: 'LineString', coordinates: rt.pts.slice(0, n) }); c.stroke(); c.setLineDash([]);
          const hd = rt.pts[n - 1];
          if (d3.geoDistance(hd, ctr) < 1.5) { const [x, y] = proj(hd); c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 2.6, 0, TAU); c.fill(); c.globalAlpha *= 0.35; c.beginPath(); c.arc(x, y, 7, 0, TAU); c.fill(); }
        });
        c.globalAlpha = 1;
        // 晨昏线阴影与边缘光
        g = c.createRadialGradient(cx - R * 0.45, cy - R * 0.5, R * 0.2, cx, cy, R * 1.05);
        g.addColorStop(0, 'rgba(255,255,255,.06)'); g.addColorStop(0.55, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,4,12,.6)');
        c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(127,255,230,.55)'; c.lineWidth = 1.2; c.beginPath(); c.arc(cx, cy, R, Math.PI * 0.9, Math.PI * 1.75); c.stroke();
      }
    };
  };

  /* ---------- 02 时间 ---------- */
  ARTS.time = () => {
    const per = B.data.periods.filter(p => p.a <= 541);
    const div = B.data.diversity, ext = B.data.massExtinctions;
    const yAt = ma => { for (let i = 1; i < div.length; i++) if (div[i][0] <= ma) { const [a0, v0] = div[i - 1], [a1, v1] = div[i]; return v0 + (v1 - v0) * (a0 - ma) / (a0 - a1); } return div[div.length - 1][1]; };
    let x, y, X0, X1, base;
    const line = d3.line().curve(d3.curveCatmullRom.alpha(0.5));
    let pts;
    function shape(c, close) { line.context(c)(pts); if (close) { c.lineTo(X1, base); c.lineTo(X0, base); c.closePath(); } }
    return {
      resize(w, h) {
        X0 = w > 520 ? w * 0.42 : 20; X1 = w - 22; base = h - 52;
        x = d3.scaleLinear([541, 0], [X0, X1]); y = d3.scaleLinear([0, 2700], [base, w > 520 ? 70 : 60]);
        pts = div.map(d => [x(d[0]), y(d[1])]);
      },
      draw(c, w, h, t, it) {
        c.clearRect(0, 0, w, h);
        const dur = 10, k = (t % dur) / dur, px = X0 + (X1 - X0) * d3.easeCubicInOut(Math.min(1, k * 1.12));
        const fade = 1 - smooth(0.9, 1, k);
        // 网格
        c.strokeStyle = 'rgba(150,180,255,.07)'; c.lineWidth = 1;
        for (let v = 500; v <= 2500; v += 500) { c.beginPath(); c.moveTo(X0, y(v)); c.lineTo(X1, y(v)); c.stroke(); }
        // 整条曲线（暗）
        let g = c.createLinearGradient(0, y(2700), 0, base);
        g.addColorStop(0, 'rgba(255,181,71,.10)'); g.addColorStop(1, 'rgba(255,181,71,0)');
        c.beginPath(); shape(c, true); c.fillStyle = g; c.fill();
        c.beginPath(); shape(c); c.strokeStyle = 'rgba(255,200,150,.22)'; c.lineWidth = 1.2; c.stroke();
        // 播放头之前（亮）
        c.save(); c.beginPath(); c.rect(0, 0, px, h); c.clip();
        g = c.createLinearGradient(0, y(2700), 0, base);
        g.addColorStop(0, 'rgba(255,181,71,.5)'); g.addColorStop(1, 'rgba(255,77,109,.02)');
        c.globalAlpha = fade; c.beginPath(); shape(c, true); c.fillStyle = g; c.fill();
        const lg = c.createLinearGradient(X0, 0, X1, 0); lg.addColorStop(0, '#ffb547'); lg.addColorStop(1, '#ff4d6d');
        c.beginPath(); shape(c); c.strokeStyle = lg; c.lineWidth = 6; c.globalAlpha = 0.18 * fade; c.stroke();
        c.lineWidth = 2; c.globalAlpha = fade; c.stroke();
        c.restore(); c.globalAlpha = 1;
        // 地质年代色带
        per.forEach(p => {
          const a = x(Math.min(541, p.a)), b = x(p.b), on = b <= px;
          c.globalAlpha = on ? 0.35 + 0.6 * fade : 0.35;
          c.fillStyle = p.c; c.fillRect(a, base + 10, Math.max(1, b - a - 1), 7);
          if (b - a > 34) { c.globalAlpha = on ? 0.85 : 0.35; c.fillStyle = '#cfdaf3'; c.font = `10px ${SANS}`; c.textAlign = 'center'; c.fillText(p.n, (a + b) / 2, base + 33); }
        });
        c.globalAlpha = 1;
        // 五次大灭绝
        ext.forEach((e, i) => {
          const ex = x(e.t), ey = y(yAt(e.t)), passed = px >= ex, since = (px - ex) / (X1 - X0) * dur;
          c.strokeStyle = 'rgba(255,77,109,.35)'; c.setLineDash([2, 4]); c.beginPath(); c.moveTo(ex, ey + 6); c.lineTo(ex, base + 8); c.stroke(); c.setLineDash([]);
          c.fillStyle = passed ? '#ff4d6d' : 'rgba(255,77,109,.35)'; c.beginPath(); c.arc(ex, ey, passed ? 3.6 : 2.6, 0, TAU); c.fill();
          if (passed && since < 1.2) { const q = since / 1.2; c.globalAlpha = (1 - q) * fade; c.strokeStyle = '#ff4d6d'; c.lineWidth = 1.5; c.beginPath(); c.arc(ex, ey, 4 + q * 26, 0, TAU); c.stroke(); c.globalAlpha = 1; }
          c.globalAlpha = passed ? fade : 0.4; c.fillStyle = '#ff8098'; c.font = `600 10px ${MONO}`; c.textAlign = 'center'; c.fillText(['I', 'II', 'III', 'IV', 'V'][i], ex, ey - 10); c.globalAlpha = 1;
        });
        // 播放头
        if (fade > 0.01) {
          c.globalAlpha = fade;
          g = c.createLinearGradient(0, 40, 0, base); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,.7)');
          c.strokeStyle = g; c.lineWidth = 1; c.beginPath(); c.moveTo(px, 40); c.lineTo(px, base + 8); c.stroke();
          const ma = x.invert(px), py = y(yAt(ma));
          c.fillStyle = '#fff'; c.beginPath(); c.arc(px, py, 4, 0, TAU); c.fill();
          c.globalAlpha = 0.3 * fade; c.beginPath(); c.arc(px, py, 10, 0, TAU); c.fill(); c.globalAlpha = fade;
          const cur = per.find(p => p.a >= ma && p.b <= ma) || per[per.length - 1];
          c.font = `600 11px ${MONO}`; c.textAlign = px > X1 - 110 ? 'right' : 'left';
          const tx = px + (px > X1 - 110 ? -10 : 10);
          c.fillStyle = '#fff'; c.fillText(ma < 1 ? '现在' : `距今 ${Math.round(ma)} 百万年`, tx, 52);
          c.fillStyle = cur.c; c.font = `12px ${SANS}`; c.fillText(cur.n, tx, 68);
          c.globalAlpha = 1;
        }
      }
    };
  };

  /* ---------- 03 生命树 ---------- */
  ARTS.tree = () => {
    const root = d3.hierarchy(B.data.tree, d => d.children);
    root.each(d => { d.col = d.data.c || (d.parent && d.parent.col) || '#ffffff'; });
    const leaves = root.leaves(), r = rng(3);
    const lr = d3.linkRadial().angle(d => d.x).radius(d => d.y);
    let R, cx, cy, links, sparks;
    const polar = (a, rad) => [Math.cos(a - Math.PI / 2) * rad, Math.sin(a - Math.PI / 2) * rad];
    const spawn = s => { s.leaf = leaves[(r() * leaves.length) | 0]; s.anc = s.leaf.ancestors().reverse(); s.k = 0; s.v = 0.006 + r() * 0.006; return s; };
    return {
      resize(w, h) {
        R = Math.min(w * 0.44, h * 0.38); cx = w / 2; cy = h * 0.38;
        d3.cluster().size([TAU, R]).separation((a, b) => a.parent === b.parent ? 1 : 1.6)(root);
        links = root.links();
        sparks = d3.range(22).map(() => { const s = spawn({}); s.k = r(); return s; });
      },
      draw(c, w, h, t, it) {
        c.clearRect(0, 0, w, h);
        c.save(); c.translate(cx, cy); c.rotate(t * 0.04 + it.hover * 0.25);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, R * 1.2);
        g.addColorStop(0, 'rgba(183,139,255,.22)'); g.addColorStop(1, 'rgba(183,139,255,0)');
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, R * 1.2, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(150,180,255,.1)'; c.lineWidth = 1; c.setLineDash([2, 5]);
        [0.33, 0.66, 1].forEach(f => { c.beginPath(); c.arc(0, 0, R * f, 0, TAU); c.stroke(); });
        c.setLineDash([]);
        lr.context(c);
        for (const l of links) {
          c.globalAlpha = 0.35 + 0.35 * it.hover; c.strokeStyle = l.target.col; c.lineWidth = Math.max(0.7, 2.4 - l.source.depth * 0.45);
          c.beginPath(); lr(l); c.stroke();
        }
        for (const d of leaves) { const [x, y] = polar(d.x, d.y); c.globalAlpha = 0.9; c.fillStyle = d.col; c.beginPath(); c.arc(x, y, 1.8, 0, TAU); c.fill(); }
        // 沿枝条从根流向叶子的光点
        c.globalCompositeOperation = 'lighter';
        for (const s of sparks) {
          s.k += s.v * (1 + it.hover); if (s.k >= 1) spawn(s);
          const n = s.anc.length - 1, f = s.k * n, i = Math.min(n - 1, f | 0), q = f - i, a = s.anc[i], b = s.anc[i + 1];
          const [x, y] = polar(a.x + (b.x - a.x) * q, a.y + (b.y - a.y) * q);
          c.globalAlpha = Math.sin(s.k * Math.PI);
          c.fillStyle = s.leaf.col; c.beginPath(); c.arc(x, y, 5, 0, TAU); c.globalAlpha *= 0.3; c.fill();
          c.globalAlpha = Math.sin(s.k * Math.PI); c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 1.6, 0, TAU); c.fill();
        }
        c.globalCompositeOperation = 'source-over';
        // LUCA
        const pulse = 0.5 + 0.5 * Math.sin(t * 2);
        c.globalAlpha = 0.25 + pulse * 0.25; c.fillStyle = '#ffffff'; c.beginPath(); c.arc(0, 0, 9 + pulse * 4, 0, TAU); c.fill();
        c.globalAlpha = 1; c.beginPath(); c.arc(0, 0, 4, 0, TAU); c.fill();
        c.restore(); c.globalAlpha = 1;
      }
    };
  };

  /* ---------- 04 深海 ---------- */
  ARTS.ocean = () => {
    const r = rng(11);
    const snow = d3.range(70).map(() => ({ x: r(), y: r(), s: r() * 1.3 + 0.4, v: 0.015 + r() * 0.03 }));
    const glows = d3.range(14).map(i => ({ x: 0.08 + r() * 0.84, y: 0.42 + r() * 0.5, r: 6 + r() * 12, c: ['#7ff5ff', '#4fb8ff', '#ff9cf5', '#c05bff', '#5affe6'][i % 5], ph: r() * TAU, sp: 0.6 + r() * 1.4 }));
    const Z = [[200, '光合带'], [1000, '弱光带'], [4000, '无光带'], [6000, '深渊带'], [10935, '海沟']];
    const yd = d => 10 + Math.sqrt(d / 10935) * 0.9;
    return {
      draw(c, w, h, t, it) {
        let g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#2c86cc'); g.addColorStop(0.14, '#0f4a8a'); g.addColorStop(0.36, '#08214a'); g.addColorStop(0.62, '#040c26'); g.addColorStop(1, '#010309');
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        // 海面波光
        c.strokeStyle = 'rgba(200,240,255,.5)'; c.lineWidth = 1.2; c.beginPath();
        for (let x = 0; x <= w; x += 6) { const y = 6 + Math.sin(x * 0.04 + t * 1.6) * 2 + Math.sin(x * 0.013 - t) * 1.5; x ? c.lineTo(x, y) : c.moveTo(x, y); }
        c.stroke();
        // 光柱
        c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 6; i++) {
          const x0 = w * (0.1 + i * 0.17) + Math.sin(t * 0.5 + i) * 18, spread = 30 + i * 6, len = h * (0.45 + 0.1 * Math.sin(t * 0.7 + i * 2));
          g = c.createLinearGradient(0, 0, 0, len); g.addColorStop(0, 'rgba(150,220,255,.16)'); g.addColorStop(1, 'rgba(150,220,255,0)');
          c.fillStyle = g; c.beginPath(); c.moveTo(x0 - 8, 0); c.lineTo(x0 + 8, 0); c.lineTo(x0 + spread + 30, len); c.lineTo(x0 + spread - 30, len); c.closePath(); c.fill();
        }
        // 深度刻度
        c.globalCompositeOperation = 'source-over';
        c.font = `9px ${MONO}`; c.textAlign = 'right';
        Z.forEach(([d, n]) => { const y = yd(d) * h * 0.92; c.strokeStyle = 'rgba(160,200,255,.12)'; c.setLineDash([3, 5]); c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); c.setLineDash([]); c.fillStyle = 'rgba(190,220,255,.5)'; c.fillText(`${d.toLocaleString('zh-CN')} m`, w - 14, y - 4); });
        // 海洋雪
        c.fillStyle = 'rgba(220,240,255,.55)';
        for (const s of snow) { s.y += s.v / 60 * 2; if (s.y > 1) { s.y = 0; s.x = Math.random(); } c.globalAlpha = 0.25 + s.y * 0.4; c.fillRect(s.x * w + Math.sin(t + s.y * 9) * 3, s.y * h, s.s, s.s); }
        // 发光生物，手电筒靠近时更亮
        c.globalCompositeOperation = 'lighter';
        for (const o of glows) {
          const x = o.x * w + Math.sin(t * 0.4 + o.ph) * 10, y = o.y * h + Math.cos(t * 0.3 + o.ph) * 6;
          const near = it.hover * Math.max(0, 1 - Math.hypot(x - it.mx * w, y - it.my * h) / 120);
          const a = (0.35 + 0.65 * Math.max(0, Math.sin(t * o.sp + o.ph)) ** 2) * (0.7 + near);
          g = c.createRadialGradient(x, y, 0, x, y, o.r * (1 + near));
          g.addColorStop(0, rgba(o.c, Math.min(1, a))); g.addColorStop(0.25, rgba(o.c, a * 0.4)); g.addColorStop(1, rgba(o.c, 0));
          c.globalAlpha = 1; c.fillStyle = g; c.beginPath(); c.arc(x, y, o.r * (1 + near), 0, TAU); c.fill();
        }
        if (it.hover > 0.02) {
          const mx = it.mx * w, my = it.my * h;
          g = c.createRadialGradient(mx, my, 0, mx, my, 90); g.addColorStop(0, `rgba(180,230,255,${0.16 * it.hover})`); g.addColorStop(1, 'rgba(180,230,255,0)');
          c.fillStyle = g; c.beginPath(); c.arc(mx, my, 90, 0, TAU); c.fill();
        }
        c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      }
    };
  };

  /* ---------- 05 尺度：十的幂次无限缩放 ---------- */
  ARTS.scale = () => {
    const items = B.data.scale.filter(s => s.s > 0);
    const E0 = Math.floor(Math.log10(d3.min(items, s => s.s))), E1 = Math.ceil(Math.log10(d3.max(items, s => s.s)));
    const rep = {};
    for (let k = E0; k <= E1; k++) rep[k] = items.find(s => Math.floor(Math.log10(s.s)) === k && s.i) || items.find(s => Math.floor(Math.log10(s.s)) === k);
    const col = d3.interpolateRgb('#ff5fa2', '#ffd166');
    let cx, cy, r0, maxR;
    return {
      resize(w, h) { cx = w / 2; cy = h * 0.37; r0 = Math.min(w, h) * 0.17; maxR = Math.hypot(w, h) * 0.62; },
      draw(c, w, h, t, it) {
        c.clearRect(0, 0, w, h);
        const span = E1 - E0 + 1, z = E0 + ((t * 0.32 * (1 + it.hover)) % span);
        const F = 2.35;
        let g = c.createRadialGradient(cx, cy, 0, cx, cy, r0 * 2);
        g.addColorStop(0, 'rgba(255,95,162,.22)'); g.addColorStop(1, 'rgba(255,95,162,0)');
        c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r0 * 2, 0, TAU); c.fill();
        c.textAlign = 'center'; c.textBaseline = 'middle';
        for (let j = -3; j <= 6; j++) {
          // 环形循环：k 取模，让最大尺度之后无缝接回最小尺度
          const kk = Math.floor(z) + j, k = ((kk - E0) % span + span) % span + E0;
          const rad = r0 * Math.pow(F, kk - z);
          if (rad < 2 || rad > maxR) continue;
          const a = smooth(2, 18, rad) * (1 - smooth(maxR * 0.55, maxR, rad));
          const cc = col((k - E0) / (span - 1));
          c.globalAlpha = a * 0.75; c.strokeStyle = cc; c.lineWidth = 1.2;
          c.beginPath(); c.arc(cx, cy, rad, 0, TAU); c.stroke();
          c.globalAlpha = a * 0.2; c.lineWidth = 5; c.stroke();
          if (rad > 22) {
            c.globalAlpha = a * 0.85; c.fillStyle = cc; c.font = `10px ${MONO}`;
            c.fillText(`10${sup(k)} m`, cx, cy - rad - 8);
            const s = rep[k];
            if (s) {
              const ang = k * 2.39996 + 0.6, px = cx + Math.cos(ang) * rad, py = cy + Math.sin(ang) * rad, fs = B.clamp(rad * 0.22, 11, 30);
              c.globalAlpha = a; c.fillStyle = 'rgba(3,6,14,.75)'; c.beginPath(); c.arc(px, py, fs * 0.75, 0, TAU); c.fill();
              c.strokeStyle = cc; c.lineWidth = 1; c.stroke();
              if (s.i) { c.font = `${fs}px ${SANS}`; c.fillText(s.i, px, py + 1); }
              else { c.fillStyle = cc; c.font = `${fs * 0.7}px ${SANS}`; c.fillText(s.n[0], px, py + 1); }
              if (rad > 60) { c.globalAlpha = a * 0.8; c.fillStyle = '#e8eefc'; c.font = `11px ${SANS}`; c.fillText(s.n, px, py + fs * 0.75 + 11); }
            }
          }
        }
        c.globalAlpha = 1; c.textBaseline = 'alphabetic';
      }
    };
  };

  /* ---------- 06 红色名录：受威胁比例点阵 ---------- */
  ARTS.redlist = () => {
    const G = B.data.redGroups, COLS = 20, ROWS = 5, PER = 3.6;
    return {
      draw(c, w, h, t, it) {
        c.clearRect(0, 0, w, h);
        const gi = Math.floor(t / PER) % G.length, u = (t % PER) / PER, gr = G[gi], p = gr.p;
        const x0 = 24, x1 = w - 24, y0 = 86, y1 = Math.min(h * 0.44, y0 + (x1 - x0) / COLS * ROWS);
        const sx = (x1 - x0) / COLS, sy = (y1 - y0) / ROWS, rad = Math.min(sx, sy) * 0.3;
        let g = c.createRadialGradient(w * 0.5, y0 + (y1 - y0) / 2, 0, w * 0.5, y0, w * 0.6);
        g.addColorStop(0, 'rgba(255,77,109,.14)'); g.addColorStop(1, 'rgba(255,77,109,0)');
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        const out = smooth(0.86, 1, u);
        for (let col = 0; col < COLS; col++) for (let row = 0; row < ROWS; row++) {
          const i = col * ROWS + row, x = x0 + sx * (col + 0.5), y = y0 + sy * (row + 0.5);
          const thr = i < p, on = B.clamp((u * PER - i * 0.012) / 0.3, 0, 1) * (1 - out);
          c.globalAlpha = 1;
          c.fillStyle = 'rgba(150,170,210,.16)'; c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fill();
          if (thr && on > 0) {
            const cc = i < p * 0.25 ? '#ff2a4f' : i < p * 0.6 ? '#ff7a3d' : '#ffc53d';
            c.globalAlpha = on * 0.3; c.fillStyle = cc; c.beginPath(); c.arc(x, y, rad * 2.1, 0, TAU); c.fill();
            c.globalAlpha = on; c.beginPath(); c.arc(x, y, rad * (0.6 + 0.4 * on), 0, TAU); c.fill();
          }
        }
        c.globalAlpha = 1 - out;
        const shown = Math.round(p * B.clamp(u / 0.55, 0, 1));
        c.textBaseline = 'alphabetic'; c.textAlign = 'left'; c.fillStyle = '#e8eefc'; c.font = `14px ${SANS}`;
        c.fillText(`${gr.i} ${gr.n} · 受威胁比例`, x0, y0 - 14);
        c.textAlign = 'right'; c.fillStyle = '#ff5c7a'; c.font = `600 22px ${MONO}`;
        c.fillText(`${shown}%`, x1, y0 - 12);
        // 进度点
        c.globalAlpha = 1;
        G.forEach((_, k) => { c.fillStyle = k === gi ? '#ff4d6d' : 'rgba(150,170,210,.25)'; c.fillRect(w / 2 - G.length * 6 + k * 12, y1 + 12, k === gi ? 8 : 4, 2); });
      }
    };
  };

  /* ---------- 07 万物：照片长廊（纯 CSS 动画） ---------- */
  function mosaic(card) {
    const box = B.$('.lens-mosaic', card); if (!box) return;
    const pool = B.data.species.filter(s => s.pu), r = rng(5);
    const pick = d3.shuffler(r)(pool.slice()).slice(0, 66);
    box.innerHTML = [0, 1, 2].map(row => {
      const set = pick.slice(row * 22, row * 22 + 22).map(s => `<span class="lm-t" style="--cc:${(B.CATS[s.c] || {}).c || '#5ef2ff'}"><img loading="lazy" decoding="async" src="${B.esc(s.pu.replace('/square.', '/small.'))}" alt=""><b>${B.esc(s.n)}</b></span>`).join('');
      return `<div class="lm-row" style="--dur:${70 + row * 16}s;--dir:${row % 2 ? 'reverse' : 'normal'}"><div class="lm-track">${set}${set}</div></div>`;
    }).join('');
    B.$$('img', box).forEach(img => { img.onload = () => img.classList.add('in'); img.onerror = () => img.parentNode.classList.add('none'); });
  }

  function size(it) {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    it.w = it.card.offsetWidth; it.h = it.card.offsetHeight; it.dpr = dpr;
    if (!it.cv || !it.w) return;
    it.cv.width = Math.round(it.w * dpr); it.cv.height = Math.round(it.h * dpr);
    it.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    it.art.resize && it.art.resize(it.w, it.h, it.ctx);
  }
  function frame(now) {
    raf = 0;
    if (B.current !== 'home' || !list.some(it => it.vis)) return;
    raf = requestAnimationFrame(frame);
    if (tick++ & 1) return;
    for (const it of list) {
      if (!it.vis || !it.cv || !it.w) continue;
      it.hover += ((it.hv ? 1 : 0) - it.hover) * 0.12;
      it.ctx.setTransform(it.dpr, 0, 0, it.dpr, 0, 0);
      it.art.draw(it.ctx, it.w, it.h, (now - it.t0) / 1000, it);
    }
  }
  L.kick = () => { if (!raf && B.current === 'home') raf = requestAnimationFrame(frame); };

  L.init = function (root, scroller) {
    B.$$('.lens[data-art]', root).forEach(card => {
      const kind = card.dataset.art;
      if (kind === 'mosaic') mosaic(card);
      const cv = B.$('canvas.lens-art', card);
      const it = { card, cv, ctx: cv && cv.getContext('2d'), vis: false, hover: 0, hv: false, mx: 0.5, my: 0.5, t0: performance.now() - Math.random() * 4000, art: ARTS[kind] && cv ? ARTS[kind]() : null };
      if (!it.art) it.cv = null;
      card.addEventListener('pointerenter', () => { it.hv = true; });
      card.addEventListener('pointerleave', () => { it.hv = false; });
      card.addEventListener('pointermove', e => { const r = card.getBoundingClientRect(); it.mx = (e.clientX - r.left) / r.width; it.my = (e.clientY - r.top) / r.height; });
      list.push(it);
    });
    const io = new IntersectionObserver(es => {
      es.forEach(e => { const it = list.find(x => x.card === e.target); it.vis = e.isIntersecting; it.card.classList.toggle('lens-live', it.vis); });
      L.kick();
    }, { root: scroller, rootMargin: '80px' });
    const ro = new ResizeObserver(es => es.forEach(e => { const it = list.find(x => x.card === e.target); size(it); }));
    list.forEach(it => { io.observe(it.card); ro.observe(it.card); });
    // 卡片角标里的数字
    const set = (k, v) => { const el = B.$(`[data-lstat="${k}"]`, root); if (el) el.textContent = v; };
    set('pins', B.data.species.filter(s => s.p).length.toLocaleString('zh-CN'));
    const sc = B.data.scale.filter(s => s.s > 0);
    set('decades', Math.round(Math.log10(d3.max(sc, s => s.s) / d3.min(sc, s => s.s))));
    set('tree', d3.hierarchy(B.data.tree, d => d.children).descendants().length);
  };

  B.lenses = L;
})();
