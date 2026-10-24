/* 首页 3D 粒子引擎：文字 / emoji / 地球 / DNA / 生命树 之间爆裂变形 */
window.BIO = window.BIO || {};
(function () {
  const B = BIO;
  const H3 = {};
  let renderer, scene, camera, group, points, dust, mat, geo;
  let N = 0, pos, vel, tgt, col, tcol, seeds;
  let W = 0, H = 0, running = false, raf = 0, idx = -1, phaseStart = 0, holdUntil = 0, spin = false, spinSpeed = 0;
  let mouse = { x: 0, y: 0, wx: 9999, wy: 9999, inside: false }, rotY = 0, rotX = 0, onChange = null, landMask = null;
  const shapeCache = new Map();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  H3.SEQ = [
    { k: 'text', s: '万物', pal: ['#5ef2ff', '#a17bff', '#ffb547', '#3cf0c8', '#ff5fa2'], sub: '约 870 万个物种，共享同一颗星球', fx: 'burst' },
    { k: 'earth', sub: '一颗蓝色星球——宇宙中已知唯一有生命的地方', fx: 'vortex' },
    { k: 'text', s: '生命', pal: ['#3cf0c8', '#5ef2ff', '#e8fffb'], sub: '38 亿年前，第一个细胞在海洋中诞生', fx: 'implode' },
    { k: 'helix', sub: '从细菌到蓝鲸，所有生命共享同一套遗传密码', fx: 'vortex' },
    { k: 'text', s: '演化', pal: ['#b78bff', '#6dffb0', '#ffffff'], sub: '一棵生长了 40 亿年的生命之树', fx: 'burst' },
    { k: 'tree', sub: '每一根枝条，都是一次演化的分岔', fx: 'rain' },
    { k: 'emoji', s: '🐋', sub: '蓝鲸 · 地球上有史以来最大的动物', fx: 'wave' },
    { k: 'text', s: '灭绝', pal: ['#ff2a4a', '#ff4d6d', '#ffb547'], sub: '曾经存在过的物种，99% 已经消失', fx: 'burst' },
    { k: 'emoji', s: '🦖', sub: '恐龙统治地球 1.6 亿年，在一次撞击后谢幕', fx: 'implode' },
    { k: 'text', s: '深海', pal: ['#2d5bff', '#4fb8ff', '#7ff5ff'], sub: '人类探索过的海底，还不到四分之一', fx: 'rain' },
    { k: 'emoji', s: '🪼', sub: '水母已经在海洋中漂浮了 5 亿年', fx: 'vortex' },
    { k: 'text', s: '共生', pal: ['#e8c26a', '#3dff9a', '#bef264'], sub: '九成陆生植物的根，与真菌的菌丝相连', fx: 'wave' },
    { k: 'emoji', s: '🍄', sub: '真菌：既不是植物，也不是动物', fx: 'burst' },
    { k: 'text', s: '微光', pal: ['#c58bff', '#5ef2ff', '#ff8fd1'], sub: '一滴海水里，生活着上百万个微生物', fx: 'implode' },
    { k: 'emoji', s: '🦠', sub: '细菌的总重量，是所有动物的 30 多倍', fx: 'vortex' },
    { k: 'text', s: '希望', pal: ['#4ade80', '#bef264', '#5ef2ff'], sub: '朱鹮从 7 只回到 1 万只——保护，真的有用', fx: 'burst' },
    { k: 'emoji', s: '🌱', sub: '每一个物种，都值得被认识', fx: 'rain' }
  ];

  const hexRgb = h => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const mixPal = (pal, u) => { const p = pal.map(hexRgb), f = u * (p.length - 1), i = Math.min(p.length - 2, Math.floor(f)), k = f - i; return p[i].map((v, j) => v + (p[i + 1][j] - v) * k); };

  /* ---------- 形状生成：返回 {p: Float32Array(N*3), c: Float32Array(N*3), spin} ---------- */
  function pack(list, spinIt) {
    const p = new Float32Array(N * 3), c = new Float32Array(N * 3);
    if (!list.length) list = [[0, 0, 0, 1, 1, 1]];
    for (let i = 0; i < N; i++) {
      const s = list[i < list.length ? i : (Math.random() * list.length) | 0];
      const j = i < list.length ? 0 : 1.5;
      p[i * 3] = s[0] + (Math.random() - 0.5) * j; p[i * 3 + 1] = s[1] + (Math.random() - 0.5) * j; p[i * 3 + 2] = s[2] + (Math.random() - 0.5) * j;
      c[i * 3] = s[3]; c[i * 3 + 1] = s[4]; c[i * 3 + 2] = s[5];
    }
    return { p, c, spin: spinIt };
  }
  const OFF = () => H * 0.17;   // 形状整体上移，给下方文字留出空间
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function sampleCanvas(draw, cw, ch, scale, colorFn, depth) {
    const off = document.createElement('canvas'); off.width = cw; off.height = ch;
    const o = off.getContext('2d', { willReadFrequently: true });
    draw(o, cw, ch);
    const d = o.getImageData(0, 0, cw, ch).data, out = [];
    let step = 1;
    let count = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 120) count++;
    step = Math.max(1, Math.sqrt(count / (N * 0.95)));
    for (let y = 0; y < ch; y += step) for (let x = 0; x < cw; x += step) {
      const k = ((y | 0) * cw + (x | 0)) * 4;
      if (d[k + 3] > 120) {
        const c = colorFn(x / cw, y / ch, d[k] / 255, d[k + 1] / 255, d[k + 2] / 255);
        const lum = (d[k] + d[k + 1] + d[k + 2]) / 765;
        out.push([(x - cw / 2) * scale, (ch / 2 - y) * scale, depth(lum, x / cw, y / ch), c[0], c[1], c[2]]);
      }
    }
    return shuffle(out);
  }
  function shapeText(st) {
    const cw = Math.min(1300, Math.round(W * 0.86)), ch = Math.min(440, Math.round(H * 0.42));
    const fs = Math.min(cw / (st.s.length * 1.08), ch * 0.92);
    const list = sampleCanvas((o, w, h) => {
      o.fillStyle = '#fff'; o.textAlign = 'center'; o.textBaseline = 'middle';
      o.font = `900 ${fs}px "Songti SC","Noto Serif SC","Source Han Serif SC","STSong",serif`;
      o.fillText(st.s.split('').join(st.s.length < 4 ? ' ' : ''), w / 2, h / 2);
    }, cw, ch, 1, (u, v) => { const c = mixPal(st.pal, u); const b = 0.85 + Math.random() * 0.3; return c.map(x => Math.min(1, x * b)); }, () => (Math.random() - 0.5) * 34);
    return pack(list.map(p => (p[1] += OFF(), p)), false);
  }
  function shapeEmoji(st) {
    const S = 360, scale = Math.min(W * 0.8, H * 0.5) / S;
    const list = sampleCanvas((o, w, h) => {
      o.textAlign = 'center'; o.textBaseline = 'middle';
      o.font = `${S * 0.86}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      o.fillText(st.s, w / 2, h / 2 + S * 0.04);
    }, S, S, scale, (u, v, r, g, b) => { const m = Math.max(r, g, b, 0.3); return [r / m * 0.9 + 0.1, g / m * 0.9 + 0.1, b / m * 0.9 + 0.1]; }, (lum, u, v) => { const dx = u - 0.5, dy = v - 0.5; return (0.25 - (dx * dx + dy * dy)) * 420 + (lum - 0.5) * 60; });
    return pack(list.map(p => (p[1] += OFF(), p)), false);
  }
  function buildLandMask() {
    if (landMask || !window.WORLD_TOPO) return;
    const RW = 720, RH = 360, off = document.createElement('canvas'); off.width = RW; off.height = RH;
    const o = off.getContext('2d', { willReadFrequently: true });
    const land = topojson.feature(WORLD_TOPO, WORLD_TOPO.objects.land);
    const eq = d3.geoEquirectangular().scale(RW / (2 * Math.PI)).translate([RW / 2, RH / 2]);
    o.fillStyle = '#fff'; o.beginPath(); d3.geoPath(eq, o)(land); o.fill();
    const d = o.getImageData(0, 0, RW, RH).data;
    landMask = (lon, lat) => { const x = Math.floor((lon + 180) / 360 * RW) % RW, y = Math.min(RH - 1, Math.floor((90 - lat) / 180 * RH)); return d[(y * RW + x) * 4 + 3] > 100; };
  }
  function shapeEarth() {
    buildLandMask();
    const R = Math.min(W * 0.3, H * 0.24), list = [], M = N * 2.2, ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < M && list.length < N; i++) {
      const y = 1 - (i / (M - 1)) * 2, r = Math.sqrt(1 - y * y), th = ga * i;
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      const lat = Math.asin(y) * 180 / Math.PI, lon = Math.atan2(z, x) * 180 / Math.PI;
      const isLand = landMask ? landMask(lon, lat) : Math.random() < 0.3;
      if (isLand) list.push([x * R, y * R, z * R, 0.25 + Math.random() * 0.2, 0.95, 0.75 + Math.random() * 0.2]);
      else if (Math.random() < 0.42) list.push([x * R, y * R, z * R, 0.12, 0.35 + Math.random() * 0.2, 0.95]);
    }
    for (let i = 0; i < N * 0.08; i++) { const a = Math.random() * 6.283, rr = R * (1.35 + Math.random() * 0.25); list.push([Math.cos(a) * rr, (Math.random() - 0.5) * R * 0.08, Math.sin(a) * rr, 0.6, 0.85, 1]); }
    return pack(shuffle(list).map(p => (p[1] += OFF(), p)), true);
  }
  function shapeHelix() {
    const list = [], h = Math.min(H * 0.46, 520), r = Math.min(W, H) * 0.12, turns = 3.2;
    const base = [[0.37, 1, 0.78], [1, 0.37, 0.64], [0.37, 0.95, 1], [1, 0.71, 0.28]];
    for (let i = 0; i < N; i++) {
      const u = Math.random(), y = (u - 0.5) * h, a = u * turns * Math.PI * 2, kind = Math.random();
      if (kind < 0.36) list.push([Math.cos(a) * r, y, Math.sin(a) * r, 0.37, 0.95, 1]);
      else if (kind < 0.72) list.push([Math.cos(a + Math.PI) * r, y, Math.sin(a + Math.PI) * r, 0.75, 0.48, 1]);
      else {
        const rung = Math.round(u * 46) / 46, ra = rung * turns * Math.PI * 2, ry = (rung - 0.5) * h, t = Math.random() * 2 - 1;
        const c = base[(Math.round(rung * 46) + (t > 0 ? 1 : 0)) % 4];
        list.push([Math.cos(ra) * r * t, ry, Math.sin(ra) * r * t, c[0], c[1], c[2]]);
      }
    }
    return pack(list.map(p => (p[1] += OFF(), p)), true);
  }
  function shapeTree() {
    const segs = [], L0 = Math.min(H * 0.125, 120);
    (function grow(x, y, z, ang, tilt, len, depth) {
      const x2 = x + Math.sin(ang) * Math.cos(tilt) * len, y2 = y + Math.cos(ang) * len, z2 = z + Math.sin(ang) * Math.sin(tilt) * len;
      segs.push([x, y, z, x2, y2, z2, depth]);
      if (depth >= 7) return;
      const n = depth < 2 ? 3 : 2;
      for (let i = 0; i < n; i++) grow(x2, y2, z2, ang + (i - (n - 1) / 2) * (0.55 + Math.random() * 0.25), tilt + (Math.random() - 0.5) * 1.6, len * (0.68 + Math.random() * 0.1), depth + 1);
    })(0, -H * 0.21, 0, 0, 0, L0, 0);
    const list = [], total = segs.reduce((s, g) => s + Math.hypot(g[3] - g[0], g[4] - g[1], g[5] - g[2]), 0);
    for (let i = 0; i < N; i++) {
      let t = Math.random() * total, g = segs[0];
      for (const s of segs) { const l = Math.hypot(s[3] - s[0], s[4] - s[1], s[5] - s[2]); if (t <= l) { g = s; break; } t -= l; }
      const k = Math.random(), th = (8 - g[6]) * 1.6;
      const leaf = g[6] >= 6 && Math.random() < 0.6;
      const x = g[0] + (g[3] - g[0]) * k + (Math.random() - 0.5) * (leaf ? 26 : th), y = g[1] + (g[4] - g[1]) * k + (Math.random() - 0.5) * (leaf ? 26 : th), z = g[2] + (g[5] - g[2]) * k + (Math.random() - 0.5) * (leaf ? 26 : th);
      const c = leaf ? (Math.random() < 0.3 ? [1, 0.82, 0.4] : [0.42, 1, 0.69]) : mixPal(['#b78bff', '#6dffb0'], g[6] / 7);
      list.push([x, y, z, c[0], c[1], c[2]]);
    }
    return pack(list.map(p => (p[1] += OFF(), p)), true);
  }
  function shapeFor(i) {
    if (shapeCache.has(i)) return shapeCache.get(i);
    const st = H3.SEQ[i];
    const s = st.k === 'text' ? shapeText(st) : st.k === 'emoji' ? shapeEmoji(st) : st.k === 'earth' ? shapeEarth() : st.k === 'helix' ? shapeHelix() : shapeTree();
    shapeCache.set(i, s);
    return s;
  }

  /* ---------- 爆裂方式 ---------- */
  function explode(kind) {
    for (let i = 0; i < N; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1] - OFF(), z = pos[i * 3 + 2], d = Math.hypot(x, y, z) || 1, r = Math.random();
      let vx, vy, vz;
      if (kind === 'vortex') { const s = 6 + r * 10; vx = -z / d * s - x / d * 3; vz = x / d * s - z / d * 3; vy = (Math.random() - 0.3) * 8; }
      else if (kind === 'implode') { vx = -x * 0.05; vy = -y * 0.05; vz = -z * 0.05 + (Math.random() - 0.5) * 30; }
      else if (kind === 'rain') { vx = (Math.random() - 0.5) * 4; vy = -6 - r * 18; vz = (Math.random() - 0.5) * 8; }
      else if (kind === 'wave') { vx = (Math.random() - 0.5) * 6; vy = Math.sin(x * 0.012) * 14; vz = Math.cos(y * 0.012) * 22; }
      else { const s = 10 + r * 26; vx = x / d * s + (Math.random() - 0.5) * 8; vy = y / d * s + (Math.random() - 0.5) * 8; vz = z / d * s + (Math.random() - 0.5) * 30; }
      vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    }
  }

  H3.go = function (i, kind) {
    idx = ((i % H3.SEQ.length) + H3.SEQ.length) % H3.SEQ.length;
    const st = H3.SEQ[idx], s = shapeFor(idx);
    explode(kind || st.fx || 'burst');
    tgt.set(s.p); tcol.set(s.c);
    spin = s.spin;
    phaseStart = performance.now();
    holdUntil = phaseStart + (st.k === 'text' ? 4200 : 4800);
    onChange && onChange(st, idx);
    // 预生成下一个形状，避免切换时卡顿
    setTimeout(() => shapeFor(idx + 1 < H3.SEQ.length ? idx + 1 : 0), 600);
  };
  H3.next = kind => H3.go(idx + 1, kind);

  /* ---------- 渲染循环 ---------- */
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (now > holdUntil && !reduce) H3.next();
    const t = (now - phaseStart) / 1000;
    const exploding = t < 0.55;
    const k = exploding ? 0 : Math.min(0.085, 0.012 + (t - 0.55) * 0.05);
    const damp = exploding ? 0.94 : 0.85;
    // 鼠标在 group 本地坐标中的位置（近似：只考虑绕 Y 轴旋转）
    const cy = Math.cos(-rotY), sy = Math.sin(-rotY);
    const lmx = mouse.wx * cy, lmz = -mouse.wx * sy, lmy = mouse.wy;
    const R2 = 150 * 150, wob = now * 0.0015;
    for (let i = 0; i < N; i++) {
      const a = i * 3;
      let vx = vel[a], vy = vel[a + 1], vz = vel[a + 2];
      if (!exploding) {
        const ws = seeds[i];
        vx += (tgt[a] + Math.sin(wob + ws * 9) * 0.8 - pos[a]) * k;
        vy += (tgt[a + 1] + Math.cos(wob * 1.3 + ws * 7) * 0.8 - pos[a + 1]) * k;
        vz += (tgt[a + 2] - pos[a + 2]) * k;
      }
      if (mouse.inside) {
        const dx = pos[a] - lmx, dy = pos[a + 1] - lmy, dz = pos[a + 2] - lmz, d2 = dx * dx + dy * dy;
        if (d2 < R2) { const d = Math.sqrt(d2) || 1, f = (1 - d / 150) * 9; vx += dx / d * f; vy += dy / d * f; vz += (dz >= 0 ? 1 : -1) * f * 1.6; }
      }
      vx *= damp; vy *= damp; vz *= damp;
      vel[a] = vx; vel[a + 1] = vy; vel[a + 2] = vz;
      pos[a] += vx; pos[a + 1] += vy; pos[a + 2] += vz;
      col[a] += (tcol[a] - col[a]) * 0.05; col[a + 1] += (tcol[a + 1] - col[a + 1]) * 0.05; col[a + 2] += (tcol[a + 2] - col[a + 2]) * 0.05;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
    // 旋转：立体形状持续自转，文字随鼠标轻微转动
    spinSpeed += ((spin ? 0.006 : 0) - spinSpeed) * 0.05;
    const targetY = spin ? rotY + spinSpeed : Math.sin(now * 0.0004) * 0.22 + mouse.x * 0.45;
    rotY = spin ? targetY : rotY + (targetY - rotY) * 0.05;
    rotX += (mouse.y * 0.28 - rotX) * 0.05;
    group.rotation.y = rotY; group.rotation.x = rotX;
    dust.rotation.y = now * 0.00003; dust.rotation.x = Math.sin(now * 0.0001) * 0.1;
    mat.uniforms.uTime.value = now / 1000;
    dust.material.uniforms.uTime.value = now / 1000;
    renderer.render(scene, camera);
  }

  function makeMaterial(base) {
    return new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPix: { value: Math.min(devicePixelRatio || 1, 2) }, uBase: { value: base } },
      vertexShader: `attribute vec3 aColor; attribute float aSeed; uniform float uTime; uniform float uPix; uniform float uBase;
        varying vec3 vColor; varying float vAlpha;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
          float tw = 0.7 + 0.3 * sin(uTime * 2.2 + aSeed * 40.0);
          gl_PointSize = uBase * (0.6 + aSeed * 0.9) * uPix * (900.0 / -mv.z) * tw;
          vColor = aColor; vAlpha = clamp(1.4 - (-mv.z - 700.0) / 1600.0, 0.25, 1.0); }`,
      fragmentShader: `varying vec3 vColor; varying float vAlpha;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;
          float a = pow(smoothstep(0.5, 0.0, d), 1.3); gl_FragColor = vec4(vColor * (0.8 + a * 1.1), a * vAlpha); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
  }

  H3.init = function (canvas, opts = {}) {
    if (!window.THREE) return false;
    try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' }); }
    catch (e) { return false; }
    onChange = opts.onChange;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, 1, 1, 6000);
    group = new THREE.Group(); scene.add(group);
    N = innerWidth < 760 ? 5000 : 12000;
    pos = new Float32Array(N * 3); vel = new Float32Array(N * 3); tgt = new Float32Array(N * 3);
    col = new Float32Array(N * 3); tcol = new Float32Array(N * 3); seeds = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      seeds[i] = Math.random();
      const a = Math.random() * 6.283, r = 600 + Math.random() * 1400;
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = (Math.random() - 0.5) * 1400; pos[i * 3 + 2] = Math.sin(a) * r - 400;
      col.set([0.4, 0.8, 1], i * 3);
    }
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    mat = makeMaterial(3.4);
    points = new THREE.Points(geo, mat); group.add(points);
    // 背景尘埃：更远、更暗的一层，增加纵深
    const DN = 1600, dp = new Float32Array(DN * 3), dc = new Float32Array(DN * 3), ds = new Float32Array(DN);
    for (let i = 0; i < DN; i++) {
      dp[i * 3] = (Math.random() - 0.5) * 3600; dp[i * 3 + 1] = (Math.random() - 0.5) * 2200; dp[i * 3 + 2] = -300 - Math.random() * 2200;
      const c = [[0.37, 0.95, 1], [0.63, 0.48, 1], [1, 0.71, 0.28]][i % 3]; dc.set(c.map(v => v * 0.6), i * 3); ds[i] = Math.random();
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    dg.setAttribute('aColor', new THREE.BufferAttribute(dc, 3));
    dg.setAttribute('aSeed', new THREE.BufferAttribute(ds, 1));
    dust = new THREE.Points(dg, makeMaterial(3.2)); scene.add(dust);
    H3.resize();
    const host = opts.host || canvas;
    host.addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - r.left) / r.width * 2 - 1; mouse.y = (e.clientY - r.top) / r.height * 2 - 1;
      mouse.wx = e.clientX - r.left - r.width / 2; mouse.wy = r.height / 2 - (e.clientY - r.top); mouse.inside = true;
    });
    host.addEventListener('pointerleave', () => { mouse.inside = false; mouse.x = mouse.y = 0; });
    return true;
  };
  H3.resize = function () {
    if (!renderer) return;
    const c = renderer.domElement;
    const w = c.clientWidth, h = c.clientHeight;
    if (w < 10 || h < 10) return;
    const changed = Math.abs(w - W) > 40 || Math.abs(h - H) > 40;
    W = w; H = h;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.position.set(0, 0, (H / 2) / Math.tan(25 * Math.PI / 180));
    camera.updateProjectionMatrix();
    if (changed) { shapeCache.clear(); if (idx >= 0) { const s = shapeFor(idx); tgt.set(s.p); tcol.set(s.c); } }
  };
  H3.start = function () {
    if (!renderer || running) return;
    H3.resize();
    if (W < 10) return;
    running = true;
    if (idx < 0) H3.go(0, 'implode');
    raf = requestAnimationFrame(frame);
  };
  H3.stop = function () { running = false; cancelAnimationFrame(raf); };
  H3.ok = () => !!renderer;
  B.hero3d = H3;
})();
