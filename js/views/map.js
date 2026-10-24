/* 地球视角：three.js 三维地球（NASA 卫星贴图、实时昼夜、大气光晕）⇄ 平面地图变形；
   实拍照片气泡按密度避让；迁徙流光；点击任意位置用 iNaturalist 实时探索当地生物 */
(function () {
  const B = BIO;
  const V = {};
  const R = 100, D2R = Math.PI / 180;
  const TEX = 'https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/';
  let root, cv, renderer, scene, camera, globe, earthMat, atmoMat, gratMat, ptsMat, ptsGeo, migMat, overlay, selEl, probeEl, sunEl;
  let W = 0, H = 0, lon0 = 105, lat0 = 22, zoom = 1, morph = 0, morphT = 0, introT = 0;
  let spin = true, lastTouch = 0, drag = null, moved = false, anim = null, running = false, raf = 0, frameN = 0;
  let filter = { region: 'all', cat: 'all', threat: false };
  let shown = [], shownSet = new Set(), order = [], sel = null, hover = null, probe = null;
  let listEl, cardEl, countEl, expEl, panel, mapCta;
  const SP = () => B.data.species;
  const tmp = new THREE.Vector3(), tmpN = new THREE.Vector3(), camPos = new THREE.Vector3();

  const ll = (lon, lat, r) => { const a = lat * D2R, b = lon * D2R; return [Math.cos(a) * Math.sin(b) * r, Math.sin(a) * r, Math.cos(a) * Math.cos(b) * r]; };
  const fl = (lon, lat, z) => [lon / 180 * Math.PI * R, lat / 180 * Math.PI * R, z || 0];
  const fmtCoord = p => `${Math.abs(p[1]).toFixed(1)}°${p[1] >= 0 ? 'N' : 'S'}  ${Math.abs(p[0]).toFixed(1)}°${p[0] >= 0 ? 'E' : 'W'}`;
  const REG_CENTER = { asia: [100, 32], europe: [15, 50], africa: [20, 2], namerica: [-100, 42], samerica: [-62, -16], oceania: [148, -26], antarctica: [-10, -72], ocean: [-160, 0] };

  /* ---------- 贴图：先用本地地图数据生成，再换成 NASA 卫星图 ---------- */
  function canvasTextures() {
    const w = 2048, h = 1024;
    const land = topojson.feature(WORLD_TOPO, WORLD_TOPO.objects.land);
    const mk = (fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const o = c.getContext('2d'); const pr = d3.geoEquirectangular().scale(w / (2 * Math.PI)).translate([w / 2, h / 2]); fn(o, d3.geoPath(pr, o)); return new THREE.CanvasTexture(c); };
    const day = mk((o, path) => {
      const g = o.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b2a52'); g.addColorStop(0.5, '#0a3768'); g.addColorStop(1, '#0b2a52');
      o.fillStyle = g; o.fillRect(0, 0, w, h);
      o.beginPath(); path(land); o.fillStyle = '#2f6b4f'; o.fill(); o.lineWidth = 2; o.strokeStyle = '#7ff0c8'; o.stroke();
    });
    const night = mk((o, path) => { o.fillStyle = '#01040a'; o.fillRect(0, 0, w, h); o.beginPath(); path(land); o.fillStyle = '#0d1f1a'; o.fill(); o.strokeStyle = 'rgba(127,240,200,.35)'; o.lineWidth = 1.5; o.stroke(); });
    const spec = mk((o, path) => { o.fillStyle = '#fff'; o.fillRect(0, 0, w, h); o.beginPath(); path(land); o.fillStyle = '#000'; o.fill(); });
    return { day, night, spec };
  }
  function loadRemote() {
    const L = new THREE.TextureLoader(); L.setCrossOrigin('anonymous');
    [['uDay', 'earth-blue-marble.jpg'], ['uNight', 'earth-night.jpg'], ['uSpec', 'earth-water.png']].forEach(([u, f]) => {
      L.load(TEX + f, t => { t.anisotropy = 4; earthMat.uniforms[u].value = t; if (u === 'uDay') root.classList.add('sat'); });
    });
  }

  /* ---------- 几何体 ---------- */
  function earthGeometry() {
    const LO = 256, LA = 128, n = (LO + 1) * (LA + 1);
    const pos = new Float32Array(n * 3), fla = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
    for (let j = 0; j <= LA; j++) for (let i = 0; i <= LO; i++) {
      const k = j * (LO + 1) + i, lon = -180 + 360 * i / LO, lat = -90 + 180 * j / LA;
      const p = ll(lon, lat, R), f = fl(lon, lat);
      pos.set(p, k * 3); fla.set(f, k * 3); nor.set(p.map(v => v / R), k * 3); uv.set([i / LO, j / LA], k * 2);
    }
    for (let j = 0; j < LA; j++) for (let i = 0; i < LO; i++) { const a = j * (LO + 1) + i, b = a + 1, c = a + LO + 1, d = c + 1; idx.push(a, b, d, a, d, c); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aFlat', new THREE.BufferAttribute(fla, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }
  const MORPH_VS = `attribute vec3 aFlat; uniform float uMorph;`;
  function buildScene() {
    renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, 1, 1, 5000);
    globe = new THREE.Group(); globe.rotation.order = 'XYZ'; scene.add(globe);
    const tx = canvasTextures();
    earthMat = new THREE.ShaderMaterial({
      uniforms: { uDay: { value: tx.day }, uNight: { value: tx.night }, uSpec: { value: tx.spec }, uHeat: { value: new THREE.DataTexture(new Uint8Array(4), 1, 1) }, uHeatOn: { value: 0 }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uMorph: { value: 0 }, uCam: { value: new THREE.Vector3() } },
      vertexShader: `${MORPH_VS} varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        void main(){ vec3 p = mix(position, aFlat, uMorph); vec3 n = normalize(mix(normal, vec3(0.0,0.0,1.0), uMorph));
          vUv = uv; vN = normalize(mat3(modelMatrix) * n); vec4 w = modelMatrix * vec4(p,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform sampler2D uDay; uniform sampler2D uNight; uniform sampler2D uSpec; uniform sampler2D uHeat; uniform float uHeatOn; uniform vec3 uSun; uniform float uMorph; uniform vec3 uCam;
        varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        void main(){ vec3 n = normalize(vN); vec3 s = normalize(uSun); float d = dot(n, s);
          float dayK = mix(smoothstep(-0.18, 0.28, d), 1.0, uMorph * 0.8);
          vec3 day = texture2D(uDay, vUv).rgb; vec3 night = texture2D(uNight, vUv).rgb;
          vec3 col = mix(day * 0.08 + night * vec3(1.6, 1.25, 0.8), day * 1.08, dayK);
          vec3 v = normalize(uCam - vW); vec3 h = normalize(s + v);
          float water = texture2D(uSpec, vUv).r;
          col += pow(max(dot(n, h), 0.0), 60.0) * water * 0.55 * dayK * (1.0 - uMorph);
          float rim = pow(1.0 - max(dot(n, v), 0.0), 2.6) * (1.0 - uMorph);
          col += rim * vec3(0.25, 0.7, 1.0) * (0.25 + 0.75 * dayK);
          float term = smoothstep(0.18, 0.0, abs(d)) * (1.0 - uMorph);
          col += term * vec3(1.0, 0.45, 0.2) * 0.12;
          vec4 hm = texture2D(uHeat, vUv); float hk = hm.a * hm.g * uHeatOn; col += mix(vec3(0.1, 0.75, 0.65), vec3(0.85, 1.0, 0.75), hk) * hk * 0.75;
          gl_FragColor = vec4(col, 1.0); }`,
      side: THREE.DoubleSide
    });
    globe.add(new THREE.Mesh(earthGeometry(), earthMat));
    // 大气层
    atmoMat = new THREE.ShaderMaterial({
      uniforms: { uOp: { value: 1 } },
      vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uOp; varying vec3 vN; void main(){ float i = pow(max(0.0, 0.62 - dot(vN, vec3(0.0,0.0,1.0))), 3.2); gl_FragColor = vec4(0.32, 0.78, 1.0, 1.0) * i * 1.5 * uOp; }`,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.12, 64, 64), atmoMat));
    // 经纬网
    const gp = [], gf = [];
    const seg = (a, b) => { gp.push(...ll(a[0], a[1], R * 1.002), ...ll(b[0], b[1], R * 1.002)); gf.push(...fl(a[0], a[1], 0.3), ...fl(b[0], b[1], 0.3)); };
    for (let lon = -180; lon < 180; lon += 30) for (let lat = -80; lat < 80; lat += 4) seg([lon, lat], [lon, lat + 4]);
    for (let lat = -60; lat <= 60; lat += 30) for (let lon = -180; lon < 180; lon += 4) seg([lon, lat], [lon + 4, lat]);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); gg.setAttribute('aFlat', new THREE.Float32BufferAttribute(gf, 3));
    gratMat = new THREE.ShaderMaterial({ uniforms: { uMorph: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `${MORPH_VS} void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(mix(position, aFlat, uMorph), 1.0); }`,
      fragmentShader: `void main(){ gl_FragColor = vec4(0.35, 0.85, 1.0, 0.1); }` });
    globe.add(new THREE.LineSegments(gg, gratMat));
    buildPoints(); buildMigration();
  }
  function buildPoints() {
    const all = SP(), n = all.length;
    const pos = new Float32Array(n * 3), fla = new Float32Array(n * 3), col = new Float32Array(n * 3), show = new Float32Array(n), sd = new Float32Array(n);
    all.forEach((s, i) => {
      pos.set(ll(s.p[0], s.p[1], R * 1.012), i * 3); fla.set(fl(s.p[0], s.p[1], 0.8), i * 3);
      const c = new THREE.Color(B.CATS[s.c].c); col.set([c.r, c.g, c.b], i * 3); show[i] = 1; sd[i] = Math.random(); s._i = i;
    });
    ptsGeo = new THREE.BufferGeometry();
    ptsGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); ptsGeo.setAttribute('aFlat', new THREE.BufferAttribute(fla, 3));
    ptsGeo.setAttribute('aColor', new THREE.BufferAttribute(col, 3)); ptsGeo.setAttribute('aShow', new THREE.BufferAttribute(show, 1)); ptsGeo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
    ptsMat = new THREE.ShaderMaterial({ uniforms: { uMorph: { value: 0 }, uTime: { value: 0 }, uPix: { value: renderer.getPixelRatio() } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `${MORPH_VS} attribute vec3 aColor; attribute float aShow; attribute float aSeed; uniform float uTime; uniform float uPix; varying vec3 vC; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(mix(position, aFlat, uMorph), 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = aShow * uPix * (10.0 + 5.0 * sin(uTime * 3.0 + aSeed * 30.0)) * (260.0 / -mv.z); vC = aColor; vA = aShow; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          float core = smoothstep(0.18, 0.0, d), glow = pow(smoothstep(0.5, 0.0, d), 2.0); gl_FragColor = vec4(vC * glow + vec3(core), (glow + core) * vA); }` });
    globe.add(new THREE.Points(ptsGeo, ptsMat));
  }
  function buildMigration() {
    const pos = [], fla = [], col = [], tt = [];
    SP().filter(s => s.mig).forEach((s, k) => {
      const c = new THREE.Color(B.CATS[s.c].c), m = s.mig, segN = m.length - 1, per = 90;
      for (let g = 0; g < segN; g++) {
        const ip = d3.geoInterpolate(m[g], m[g + 1]);
        for (let j = 0; j < per; j++) {
          const u = j / per, total = (g + u) / segN, q = ip(u), alt = R * (1.012 + 0.09 * Math.sin(Math.PI * total));
          pos.push(...ll(q[0], q[1], alt)); fla.push(...fl(q[0], q[1], 1)); col.push(c.r, c.g, c.b); tt.push(total * 3 + k * 0.37);
        }
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aFlat', new THREE.Float32BufferAttribute(fla, 3));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('aT', new THREE.Float32BufferAttribute(tt, 1));
    migMat = new THREE.ShaderMaterial({ uniforms: { uMorph: { value: 0 }, uTime: { value: 0 }, uPix: { value: renderer.getPixelRatio() } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `${MORPH_VS} attribute vec3 aColor; attribute float aT; uniform float uTime; uniform float uPix; varying vec3 vC; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(mix(position, aFlat, uMorph), 1.0); gl_Position = projectionMatrix * mv;
          float f = fract(aT - uTime * 0.25); vA = 0.16 + pow(f, 10.0) * 1.4; gl_PointSize = uPix * (2.5 + pow(f, 10.0) * 7.0) * (260.0 / -mv.z); vC = aColor; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(mix(vC, vec3(1.0), 0.3), smoothstep(0.5, 0.0, d) * vA); }` });
    globe.add(new THREE.Points(g, migMat));
  }

  /* ---------- 太阳位置（实时昼夜） ---------- */
  function sunLL() {
    const d = new Date(), y0 = Date.UTC(d.getUTCFullYear(), 0, 0);
    const day = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - y0) / 864e5;
    const hrs = d.getUTCHours() + d.getUTCMinutes() / 60;
    return [(12 - hrs) * 15, 23.44 * Math.sin(2 * Math.PI * (284 + day) / 365), d];
  }

  /* ---------- 相机与布局 ---------- */
  function layout() {
    const mobile = innerWidth <= 760;
    const offX = mobile ? 0 : -175, offY = mobile ? H * 0.2 : 0;
    camera.setViewOffset(W, H, offX, offY, W, H);
    camera.aspect = W / H; camera.updateProjectionMatrix();
  }
  function placeCamera() {
    const aspect = W / H, tanH = Math.tan(20 * D2R);
    const usable = innerWidth <= 760 ? 0.95 : (W - 370) / W;
    const dSphere = Math.max(R * 1.22, (R * 1.5) / tanH / Math.min(1, aspect * usable * 1.1) / zoom);
    const dFlat = Math.max(40, Math.max((Math.PI * R * 1.04) / (tanH * aspect * usable), (Math.PI * R * 0.56) / tanH) / zoom);
    const dist = B.lerp(dSphere, dFlat, morph) * (1 + introT * 2.2);
    const c = fl(lon0, lat0 * B.clamp(zoom - 1, 0, 1));
    camPos.set(c[0] * morph, c[1] * morph, dist);
    camera.position.copy(camPos);
    camera.lookAt(c[0] * morph, c[1] * morph, 0);
    globe.rotation.set(lat0 * D2R * (1 - morph), -lon0 * D2R * (1 - morph) + introT * 2.5, 0);
  }

  /* ---------- 屏幕投影 ---------- */
  function project(s, out) {
    const a = s._sv || (s._sv = ll(s.p[0], s.p[1], R * 1.012)), f = s._fv || (s._fv = fl(s.p[0], s.p[1], 0.8));
    tmp.set(a[0] + (f[0] - a[0]) * morph, a[1] + (f[1] - a[1]) * morph, a[2] + (f[2] - a[2]) * morph).applyMatrix4(globe.matrixWorld);
    let face = 1;
    if (morph < 0.98) {
      tmpN.set(a[0], a[1], a[2]).normalize().applyQuaternion(globe.quaternion);
      const vx = camera.position.x - tmp.x, vy = camera.position.y - tmp.y, vz = camera.position.z - tmp.z, vl = Math.hypot(vx, vy, vz);
      face = B.lerp((tmpN.x * vx + tmpN.y * vy + tmpN.z * vz) / vl, 1, morph);
    }
    tmp.project(camera);
    out.x = (tmp.x + 1) / 2 * W; out.y = (1 - tmp.y) / 2 * H; out.face = face;
    out.in = out.x > -40 && out.x < W + 40 && out.y > -40 && out.y < H + 40;
    return out;
  }

  /* ---------- 照片气泡：按密度避让 ---------- */
  function bubble(s) {
    if (s._gb) return s._gb;
    const b = B.h(`<div class="gb" style="--cc:${B.CATS[s.c].c}"><span class="gb-ph"><span>${s.i || ''}</span></span><b>${B.esc(s.n)}</b></div>`);
    b.onclick = e => { e.stopPropagation(); select(s, true); };
    b.onpointerenter = () => { hover = s; };
    b.onpointerleave = () => { if (hover === s) hover = null; };
    overlay.appendChild(b);
    s._gb = b;
    return b;
  }
  const P = { x: 0, y: 0, face: 0, in: false };
  function declutter() {
    const size = B.clamp(30 + zoom * 9, 36, 72), gap = size * 1.08, placed = [];
    const max = Math.round(B.clamp(10 + zoom * 9 + morph * 10, 12, 60));
    const list = sel ? [sel].concat(hover && hover !== sel ? [hover] : [], order) : (hover ? [hover].concat(order) : order);
    const seen = new Set();
    for (const s of list) {
      if (seen.has(s)) continue; seen.add(s);
      if (!shownSet.has(s)) continue;
      project(s, P);
      s._xy = P.in && P.face > 0.05 ? [P.x, P.y] : null;
      let ok = s._xy && P.face > 0.22 && placed.length < max;
      if (ok) for (const q of placed) if ((q[0] - P.x) ** 2 + (q[1] - P.y) ** 2 < gap * gap) { ok = false; break; }
      if (ok || s === sel) {
        const b = bubble(s);
        if (!b._ph) { b._ph = 1; B.photo.fill(b.querySelector('.gb-ph'), s); }
        b.style.transform = `translate3d(${P.x}px, ${P.y}px, 0) translate(-50%, -50%) scale(${(size / 56) * (0.75 + 0.25 * B.clamp(P.face, 0, 1))})`;
        b.classList.add('on'); b.classList.toggle('sel', s === sel); b.classList.toggle('lbl', zoom > 1.8 || s === sel || s === hover);
        b.style.zIndex = s === sel ? 30 : s === hover ? 25 : 10;
        if (s._xy) placed.push([P.x, P.y]);
      } else if (s._gb) s._gb.classList.remove('on');
    }
    // 不在当前筛选中的气泡全部隐藏
    SP().forEach(s => { if (s._gb && !seen.has(s)) s._gb.classList.remove('on'); });
  }

  /* ---------- 主循环 ---------- */
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    frameN++;
    morph += (morphT - morph) * 0.07; if (Math.abs(morphT - morph) < 0.001) morph = morphT;
    introT *= 0.94; if (introT < 0.001) introT = 0;
    if (anim) {
      const k = Math.min(1, (now - anim.t0) / anim.dur), e = d3.easeCubicInOut(k);
      lon0 = anim.l0 + anim.dl * e; lat0 = anim.a0 + anim.da * e; zoom = anim.z0 + (anim.z1 - anim.z0) * e;
      if (k >= 1) anim = null;
    } else if (spin && !drag && now - lastTouch > 3500 && !sel) lon0 += 0.04 * (1 - morph);
    if (morphT && morph > 0.5) { const hw = Math.max(0, 180 * (1 - 0.92 / zoom)), hv = Math.max(0, 90 * (1 - 0.95 / zoom)); lon0 = B.clamp(((lon0 + 540) % 360) - 180, -hw, hw); lat0 = B.clamp(lat0, -hv, hv); }
    placeCamera();
    globe.updateMatrixWorld(true);
    const [sl, sa, d] = sunLL();
    const sv = ll(sl, sa, 1);
    earthMat.uniforms.uSun.value.set(sv[0], sv[1], sv[2]).applyQuaternion(globe.quaternion);
    earthMat.uniforms.uCam.value.copy(camera.position);
    [earthMat, gratMat, ptsMat, migMat].forEach(m => { m.uniforms.uMorph.value = morph; });
    ptsMat.uniforms.uTime.value = migMat.uniforms.uTime.value = now / 1000;
    atmoMat.uniforms.uOp.value = 1 - morph;
    renderer.render(scene, camera);
    if (frameN % 2 === 0 || drag || anim) declutter();
    // 选中标记与探索点
    if (sel && sel._xy) { selEl.style.transform = `translate3d(${sel._xy[0]}px, ${sel._xy[1]}px, 0)`; selEl.classList.add('on'); } else selEl.classList.remove('on');
    if (probe) { project({ p: probe }, P); probeEl.style.transform = `translate3d(${P.x}px, ${P.y}px, 0)`; probeEl.classList.toggle('on', P.in && P.face > 0.05); }
    if (frameN % 60 === 1) sunEl.textContent = `☀ 实时昼夜 · 世界时 ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  }

  /* ---------- 飞行 ---------- */
  function flyTo(lon, lat, z, dur = 1400) {
    const dl = ((lon - lon0) % 360 + 540) % 360 - 180;
    anim = { t0: performance.now(), dur, l0: lon0, dl, a0: lat0, da: B.clamp(lat, -75, 75) - lat0, z0: zoom, z1: z == null ? zoom : z };
    lastTouch = performance.now();
  }

  /* ---------- 过滤 / 列表 / 卡片 ---------- */
  const RANK = { CR: 6, EN: 5, EW: 5, VU: 4, NT: 3, DD: 2, LC: 1, NE: 1 };
  function applyFilter() {
    shown = SP().filter(s => (filter.region === 'all' || s.r === filter.region) && (filter.cat === 'all' || s.c === filter.cat) && (!filter.threat || B.THREATENED.has(s.s)));
    order = shown.slice().sort((a, b) => (b._pri || (b._pri = RANK[b.s] + Math.random() * 2)) - (a._pri || (a._pri = RANK[a.s] + Math.random() * 2)));
    const showSet = shownSet = new Set(shown);
    const attr = ptsGeo.attributes.aShow;
    SP().forEach(s => { attr.array[s._i] = showSet.has(s) ? 1 : 0; });
    attr.needsUpdate = true;
    countEl.innerHTML = `<span>物种名录</span><span><b>${shown.length}</b> / ${SP().length}</span>`;
    listEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    shown.forEach(s => {
      const st = B.STATUS[s.s];
      const it = B.h(`<div class="sp-item" style="--cc:${B.CATS[s.c].c}"><span class="ic"><span>${s.i || ''}</span></span><span class="tx"><b>${B.esc(s.n)}</b><small>${B.esc(s.l)}</small></span><span class="st" style="--sc:${st.c}" title="${st.t}">${s.s}</span></div>`);
      B.photo.fill(it.querySelector('.ic'), s);
      it.onclick = () => select(s, true);
      it.onmouseenter = () => { hover = s; };
      it.onmouseleave = () => { if (hover === s) hover = null; };
      s._li = it;
      frag.appendChild(it);
    });
    listEl.appendChild(frag);
    if (sel && !showSet.has(sel)) select(null);
  }
  function select(s, fly) {
    sel = s;
    SP().forEach(x => x._li && x._li.classList.toggle('on', x === s));
    if (!s) { cardEl.classList.remove('show'); return; }
    if (s._li) s._li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const st = B.STATUS[s.s], col = B.CATS[s.c].c;
    cardEl.style.setProperty('--cc', col);
    cardEl.innerHTML = `<div class="mc-top"><div class="mc-ic"><span>${s.i || ''}</span></div><div><h3>${B.esc(s.n)}</h3><i>${B.esc(s.l)}</i></div></div>
      <div class="m-tags" style="margin-top:12px"><span class="tag" style="--tc:${col}">${B.CATS[s.c].t}</span><span class="tag" style="--tc:var(--line2)">${B.REGIONS[s.r].t}</span><span class="tag solid" style="--tc:${st.c}">${s.s} · ${st.t}</span></div>
      <p>${B.esc(s.d)}</p>
      <div class="mc-foot"><span class="meta">${fmtCoord(s.p)}<br>${B.esc(s.h || '')}</span><button type="button">查看详情</button></div>`;
    cardEl.querySelector('button').onclick = () => B.openDetail(detail(s));
    B.photo.fill(cardEl.querySelector('.mc-ic'), s, { eager: true, priority: true });
    cardEl.classList.add('show');
    selEl.style.setProperty('--cc', col);
    if (fly) flyTo(s.p[0], s.p[1], Math.max(zoom, morphT ? 1.6 : 1.9));
    if (fly && s._xy) B.fx.burst(s._xy[0], s._xy[1], { color: col, count: 50, power: 6, ringSize: 120 });
  }
  function detail(s) {
    const st = B.STATUS[s.s], col = B.CATS[s.c].c;
    return {
      i: s.i, color: col, title: s.n, latin: s.l, en: s.e, photo: s,
      tags: [{ t: B.CATS[s.c].t, c: col }, { t: B.REGIONS[s.r].t }, { t: `IUCN ${s.s} · ${st.t}`, c: st.c, solid: true }],
      stats: [['体型', s.z], ['栖息地', s.h], ['保护等级', `${st.t}（${s.s}）`], ['位置', fmtCoord(s.p)]],
      desc: s.d, fact: s.f,
      actions: [{ label: '探索这里的更多生物', fn: () => B.go('map', () => V.explore(s.p[0], s.p[1])) }].concat(B.current === 'map' ? [] : [{ label: '在地球上定位', fn: () => B.go('map', () => V.focus(s)) }])
    };
  }
  V.detail = detail;
  V.focus = s => { if (filter.region !== 'all' && filter.region !== s.r) setRegion('all', true); if (filter.cat !== 'all' && filter.cat !== s.c) setCat('all'); if (filter.threat && !B.THREATENED.has(s.s)) setThreat(false); select(s, true); };
  function setRegion(r, quiet) {
    filter.region = r;
    B.$$('.chips.regions .chip', root).forEach(c => c.classList.toggle('on', c.dataset.k === r));
    applyFilter();
    if (quiet) return;
    const c = REG_CENTER[r];
    if (c) flyTo(c[0], c[1], 1.45); else flyTo(lon0, 15, 1);
  }
  function setCat(k) { filter.cat = k; B.$$('.chips.cats .chip', root).forEach(c => c.classList.toggle('on', c.dataset.k === k)); applyFilter(); }
  function setThreat(v) { filter.threat = v; B.$('#map-threat', root).checked = v; applyFilter(); }

  /* ---------- 实时探索：iNaturalist 当地物种 ---------- */
  const XT = [['all', '全部', ''], ['Plantae', '植物', 'iconic_taxa=Plantae'], ['Fungi', '真菌', 'iconic_taxa=Fungi'], ['Insecta', '昆虫', 'iconic_taxa=Insecta'], ['Aves', '鸟类', 'iconic_taxa=Aves'],
    ['Mammalia', '哺乳', 'iconic_taxa=Mammalia'], ['Reptilia', '爬行', 'iconic_taxa=Reptilia'], ['Amphibia', '两栖', 'iconic_taxa=Amphibia'], ['Actinopterygii', '鱼类', 'iconic_taxa=Actinopterygii'],
    ['Mollusca', '软体', 'iconic_taxa=Mollusca'], ['Arachnida', '蛛形', 'iconic_taxa=Arachnida'], ['Protozoa', '原生生物', 'iconic_taxa=Protozoa,Chromista'], ['Bacteria', '细菌', 'taxon_id=67333']];
  let xt = 'all', xToken = 0;
  V.explore = function (lon, lat) {
    probe = [lon, lat];
    expEl.classList.add('show'); root.classList.add('xon');
    B.$('.gx-loc', expEl).textContent = `${fmtCoord([lon, lat])} · 半径 ${xRadius()} 公里`;
    loadExplore();
  };
  const xRadius = () => Math.round(B.clamp(320 / zoom, 25, 300));
  function loadExplore() {
    if (!probe) return;
    const token = ++xToken, grid = B.$('.gx-grid', expEl), q = XT.find(x => x[0] === xt)[2];
    grid.innerHTML = '<div class="gx-msg">正在向 iNaturalist 查询这里被记录到的物种…</div>';
    const url = `https://api.inaturalist.org/v1/observations/species_counts?lat=${probe[1].toFixed(3)}&lng=${probe[0].toFixed(3)}&radius=${xRadius()}&per_page=48&quality_grade=research&locale=zh-CN${q ? '&' + q : ''}`;
    fetch(url).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(j => {
      if (token !== xToken) return;
      const res = (j.results || []).filter(r => r.taxon);
      B.$('.gx-sum', expEl).textContent = res.length ? `共 ${j.total_results.toLocaleString('zh-CN')} 种被记录，按观测次数显示前 ${res.length} 种` : '';
      if (!res.length) { grid.innerHTML = '<div class="gx-msg">这里暂时没有研究级观测记录，换个地方或类群试试。海洋和极地的记录通常较少。</div>'; return; }
      grid.innerHTML = '';
      res.forEach((r, i) => {
        const t = r.taxon, ph = t.default_photo;
        const card = B.h(`<button class="gx-card" type="button" style="--d:${Math.min(i, 24) * 30}ms">
          <span class="gx-ph">${ph ? `<img src="${B.esc(ph.square_url.replace('/square.', '/small.'))}" alt="" loading="lazy">` : ''}</span>
          <b>${B.esc(t.preferred_common_name || t.name)}</b><i>${B.esc(t.name)}</i><small>${r.count.toLocaleString('zh-CN')} 次观测</small></button>`);
        card.onclick = () => B.openTaxon(t);
        grid.appendChild(card);
      });
    }).catch(() => { if (token === xToken) grid.innerHTML = '<div class="gx-msg">无法连接 iNaturalist，请检查网络后重试。</div>'; });
  }

  /* ---------- 全部生物：iNaturalist 全球观测热度图（3.6 亿条记录，墨卡托瓦片 → 等距圆柱贴图） ---------- */
  let heat = 'all', heatTok = 0;
  const heatQ = () => (XT.find(x => x[0] === heat) || XT[0])[2];
  function loadHeat() {
    const tok = ++heatTok, u = earthMat.uniforms;
    if (heat === 'off') { u.uHeatOn.value = 0; heatNote(); return; }
    const Z = 2, N = 1 << Z, T = 512, merc = document.createElement('canvas');
    merc.width = merc.height = N * T;
    const mctx = merc.getContext('2d'), jobs = [];
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) jobs.push(new Promise(res => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => { mctx.drawImage(im, x * T, y * T); res(); }; im.onerror = res;
      im.src = `https://api.inaturalist.org/v1/heatmap/${Z}/${x}/${y}.png?verifiable=true${heatQ() ? '&' + heatQ() : ''}`;
    }));
    heatNote('正在载入全球观测热度…');
    Promise.all(jobs).then(() => {
      if (tok !== heatTok) return;
      const W2 = N * T, H2 = W2 / 2, eq = document.createElement('canvas');
      eq.width = W2; eq.height = H2;
      const ectx = eq.getContext('2d');
      for (let y = 0; y < H2; y++) {
        const lat = B.clamp(90 - (y + 0.5) / H2 * 180, -85.05, 85.05) * D2R;
        const my = (1 - Math.log(Math.tan(Math.PI / 4 + lat / 2)) / Math.PI) / 2 * W2;
        ectx.drawImage(merc, 0, Math.floor(my), W2, 1, 0, y, W2, 1);
      }
      const t = new THREE.CanvasTexture(eq); t.anisotropy = 4;
      u.uHeat.value = t; u.uHeatOn.value = 1;
      heatNote();
    });
  }
  function heatNote(msg) {
    const n = B.$('.heat-note', root);
    if (msg) { n.textContent = msg; return; }
    const x = XT.find(v => v[0] === heat) || XT[0];
    mapCta.set({ title: `全球的全部${x[0] === 'all' ? '生物' : x[1]}`, n: heat === 'off' ? '—' : null });
    if (heat === 'off') { n.textContent = '热度图已关闭'; return; }
    n.innerHTML = '统计中…';
    const tok = heatTok, q = heatQ();
    Promise.all([fetch(`https://api.inaturalist.org/v1/observations?per_page=0&verifiable=true${q ? '&' + q : ''}`).then(r => r.json()), fetch(`https://api.inaturalist.org/v1/observations/species_counts?per_page=0&verifiable=true${q ? '&' + q : ''}`).then(r => r.json())])
      .then(([o, sp]) => { if (tok !== heatTok) return; mapCta.set({ n: sp.total_results }); n.innerHTML = `<span class="heat-bar"><i></i>观测稀少 → 密集</span>共 <b>${B.live.fmt(o.total_results)}</b> 条观测记录`; })
      .catch(() => { if (tok === heatTok) n.textContent = '亮处表示观测记录密集'; });
  }
  function listHeat() {
    const x = XT.find(v => v[0] === heat) || XT[0], q = x[2];
    panel.show({ color: '#3cf0c8', kicker: 'LIVE · iNaturalist 全球', title: `全球的全部${x[0] === 'all' ? '生物' : x[1]}`, sub: '按观测次数排序',
      source: '数据与照片来自 iNaturalist 全球公民科学观测，仅统计可验证记录。在地球上点击任意地点，可查看当地的生物。',
      summary: n => `全球共记录到 <b>${B.live.fmt(n)}</b> 种（最多可翻阅前 10,000 种，更多请用搜索）`,
      load: B.live.inatCounts(`verifiable=true${q ? '&' + q : ''}`) });
  }

  /* ---------- 交互 ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), inv = new THREE.Matrix4();
  function lonLatAt(cx, cy) {
    const r = cv.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    inv.copy(globe.matrixWorld).invert();
    const o = ray.ray.origin.clone().applyMatrix4(inv), d = ray.ray.direction.clone().transformDirection(inv);
    if (morph < 0.5) {
      const b = o.dot(d), c = o.dot(o) - R * R, disc = b * b - c;
      if (disc < 0) return null;
      const p = o.add(d.multiplyScalar(-b - Math.sqrt(disc)));
      return [Math.atan2(p.x, p.z) / D2R, Math.asin(B.clamp(p.y / R, -1, 1)) / D2R];
    }
    if (Math.abs(d.z) < 1e-6) return null;
    const p = o.add(d.multiplyScalar(-o.z / d.z));
    const lon = p.x / (Math.PI * R) * 180, lat = p.y / (Math.PI * R) * 180;
    return Math.abs(lon) <= 180 && Math.abs(lat) <= 90 ? [lon, lat] : null;
  }
  function nearest(x, y) {
    let best = null, bd = 12 * 12;
    for (const s of shown) { if (!s._xy) continue; const d = (s._xy[0] - x) ** 2 + (s._xy[1] - y) ** 2; if (d < bd) { bd = d; best = s; } }
    return best;
  }
  function bind() {
    cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, l: lon0, a: lat0 }; moved = false; anim = null; cv.setPointerCapture(e.pointerId); cv.classList.add('dragging'); lastTouch = performance.now(); });
    cv.addEventListener('pointermove', e => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        const k = (morph > 0.5 ? 0.15 : 0.2) / zoom;
        lon0 = drag.l - dx * k; lat0 = B.clamp(drag.a + dy * k, -75, 75);
        lastTouch = performance.now(); B.untip(); return;
      }
      const h = nearest(e.clientX - cv.getBoundingClientRect().left, e.clientY - cv.getBoundingClientRect().top);
      cv.classList.toggle('pointing', !!h);
      if (h) { const ph = B.photo.peek(h); B.tip(`${ph ? `<img class="tip-ph" src="${B.esc(ph.src)}" alt="">` : ''}<b>${h.i || ''} ${B.esc(h.n)}</b><small>${B.esc(h.l)} · ${B.CATS[h.c].t} · ${B.STATUS[h.s].t}</small>`, e.clientX, e.clientY); }
      else B.untip();
    });
    cv.addEventListener('pointerup', e => {
      cv.classList.remove('dragging');
      if (drag && !moved) {
        const r = cv.getBoundingClientRect(), h = nearest(e.clientX - r.left, e.clientY - r.top);
        if (h) select(h, true);
        else { const p = lonLatAt(e.clientX, e.clientY); if (p) { B.fx.burst(e.clientX, e.clientY, { color: '#3cf0c8', count: 40, power: 5, ringSize: 90 }); V.explore(p[0], p[1]); } }
      }
      drag = null;
    });
    cv.addEventListener('pointerleave', () => { B.untip(); });
    cv.addEventListener('wheel', e => { e.preventDefault(); anim = null; zoom = B.clamp(zoom * Math.exp(-B.wheel(e) * 0.0008), 0.7, 9); lastTouch = performance.now(); }, { passive: false });
  }
  function resize() {
    W = root.clientWidth; H = root.clientHeight;
    if (!renderer || W < 10) return;
    renderer.setSize(W, H, false);
    layout();
  }

  /* ---------- 构建界面 ---------- */
  V.init = function (el) {
    root = el;
    const regionChips = Object.entries(B.REGIONS).map(([k, r]) => `<button class="chip ${k === 'all' ? 'on' : ''}" data-k="${k}">${r.t}</button>`).join('');
    const catChips = `<button class="chip on" data-k="all">全部</button>` + Object.entries(B.CATS).map(([k, c]) => `<button class="chip" data-k="${k}" style="--cc:${c.c}"><span class="sw"></span>${c.t}</button>`).join('');
    el.innerHTML = `
      <canvas class="map-canvas"></canvas>
      <div class="globe-ov"><div class="gsel"><i></i><i></i><b></b></div><div class="gprobe"><i></i><i></i><i></i></div></div>
      <aside class="map-side glass">
        <h2><small>01 · WHERE LIFE LIVES</small>地球 · 生命分布</h2>
        <p class="side-hint">拖动旋转 · 滚轮缩放 · 点照片看物种 · 点地面探索当地生物</p>
        <div class="side-group"><label>区域</label><div class="chips regions">${regionChips}</div></div>
        <div class="side-group"><label>类群</label><div class="chips cats">${catChips}</div></div>
        <div class="side-group"><label>全部生物 · 全球观测热度</label><div class="chips heat-chips"><button class="chip" data-k="off">关闭</button>${XT.map(x => `<button class="chip ${x[0] === 'all' ? 'on' : ''}" data-k="${x[0]}">${x[1]}</button>`).join('')}</div><div class="heat-note"></div></div>
        <label class="toggle"><input type="checkbox" id="map-threat"><span class="sw2"></span>仅显示受威胁物种（易危及以上）</label>
        <div class="sp-count"></div>
        <div class="sp-list"></div>
      </aside>
      <div class="map-hud">
        <span class="map-sun glass"></span>
        <button class="glass" data-a="mode">◐ 平面地图</button>
        <button class="glass on" data-a="spin">⟳ 自转</button>
        <button class="glass" data-a="reset">⌖ 复位</button>
      </div>
      <div class="map-card glass"></div>
      <div class="gx glass">
        <div class="gx-h"><div><small>LIVE · iNaturalist</small><b>这里生活着什么？</b><span class="gx-loc"></span></div><button type="button" class="gx-x" aria-label="关闭">✕</button></div>
        <div class="chips gx-chips">${XT.map(x => `<button class="chip ${x[0] === 'all' ? 'on' : ''}" data-k="${x[0]}">${x[1]}</button>`).join('')}</div>
        <div class="gx-sum"></div>
        <div class="gx-grid"></div>
        <p class="gx-src">数据与照片实时来自 iNaturalist 公民科学观测，不在本地保存</p>
      </div>
      <div class="map-legend">${Object.values(B.CATS).map(c => `<span style="--cc:${c.c}"><i></i>${c.t}</span>`).join('')}<span><b class="mig"></b>迁徙路线</span></div>`;
    cv = B.$('.map-canvas', el); overlay = B.$('.globe-ov', el); selEl = B.$('.gsel', el); probeEl = B.$('.gprobe', el); sunEl = B.$('.map-sun', el);
    listEl = B.$('.sp-list', el); cardEl = B.$('.map-card', el); countEl = B.$('.sp-count', el); expEl = B.$('.gx', el);
    B.$$('.chips.regions .chip', el).forEach(c => c.onclick = () => setRegion(c.dataset.k));
    B.$$('.chips.cats .chip', el).forEach(c => c.onclick = () => setCat(c.dataset.k));
    B.$$('.gx-chips .chip', el).forEach(c => c.onclick = () => { xt = c.dataset.k; B.$$('.gx-chips .chip', el).forEach(x => x.classList.toggle('on', x === c)); loadExplore(); });
    B.$('.gx-x', el).onclick = () => { expEl.classList.remove('show'); root.classList.remove('xon'); probe = null; probeEl.classList.remove('on'); };
    B.$('#map-threat', el).onchange = e => setThreat(e.target.checked);
    B.$$('.heat-chips .chip', el).forEach(c => c.onclick = () => { heat = c.dataset.k; B.$$('.heat-chips .chip', el).forEach(x => x.classList.toggle('on', x === c)); loadHeat(); });
    panel = B.live.panel(el);
    mapCta = B.live.cta({ kicker: 'LIVE · iNaturalist 全球', title: '全球的全部生物', unit: '种', color: '#3cf0c8', cls: 'cta-block' });
    mapCta.onclick = listHeat;
    B.$('.heat-note', el).after(mapCta);
    B.$$('.map-hud button', el).forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'mode') { morphT = morphT ? 0 : 1; b.textContent = morphT ? '◑ 三维地球' : '◐ 平面地图'; flyTo(morphT ? 0 : lon0, morphT ? 0 : 22, 1, 1000); }
      if (a === 'spin') { spin = !spin; b.classList.toggle('on', spin); }
      if (a === 'reset') { select(null); flyTo(105, 22, 1); }
    });
    try { buildScene(); } catch (err) { el.insertAdjacentHTML('beforeend', '<p class="gx-msg" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)">此浏览器不支持 WebGL，无法显示三维地球。</p>'); return; }
    loadRemote(); loadHeat();
    resize(); bind(); applyFilter();
    introT = 1;
    addEventListener('resize', () => { if (B.current === 'map') resize(); });
  };
  V.enter = function () { if (!renderer) return; resize(); if (!running) { running = true; raf = requestAnimationFrame(frame); } };
  V.leave = function () { running = false; cancelAnimationFrame(raf); B.untip(); };
  V.key = function (e) { if (e.key !== 'Escape') return; if (panel && panel.isOpen()) panel.hide(); else select(null); };
  V.index = () => SP().map(s => ({ title: s.n, en: s.e, latin: s.l, sub: `${s.l} · ${B.REGIONS[s.r].t} · ${B.CATS[s.c].t}`, i: s.i, ph: s, go: () => V.focus(s) }));
  B.views.map = V;
})();
