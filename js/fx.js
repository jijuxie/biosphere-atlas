/* 全局特效层：鼠标粒子尾迹、爆裂粒子、冲击波光环、页面切换、3D 滚动入场、文字解码 */
window.BIO = window.BIO || {};
(function () {
  const B = BIO;
  const F = {};
  const coarse = matchMedia('(pointer: coarse)').matches;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let c, ctx, W = 0, H = 0, D = 1, parts = [], rings = [], raf = 0, running = false;
  let mx = -1, my = -1, pmx = -1, pmy = -1, lastMove = 0;

  const hex = h => { h = (h || '#5ef2ff').trim().replace('#', ''); if (h.length === 3) h = h.split('').map(x => x + x).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  F.accent = () => getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#5ef2ff';
  F.accent2 = () => getComputedStyle(document.body).getPropertyValue('--accent2').trim() || '#a17bff';

  function resize() {
    D = Math.min(devicePixelRatio || 1, 1.5);
    W = innerWidth; H = innerHeight;
    c.width = W * D; c.height = H * D;
    ctx.setTransform(D, 0, 0, D, 0, 0);
  }
  function kick() { if (!running) { running = true; raf = requestAnimationFrame(loop); } }

  /* ---------- 爆裂粒子 ---------- */
  F.burst = function (x, y, o = {}) {
    if (reduce) return;
    const cols = (o.colors || [o.color || F.accent(), F.accent2(), '#ffffff']).map(hex);
    const n = o.count || 70, power = o.power || 7, mode = o.mode || 'radial';
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = power * (0.25 + Math.random() * 0.9);
      let vx = Math.cos(a) * s, vy = Math.sin(a) * s;
      if (mode === 'fountain') { vx *= 0.5; vy = -Math.abs(vy) * 1.4 - power * 0.3; }
      if (mode === 'vortex') { const t = vx; vx = -vy * 0.9 + vx * 0.3; vy = t * 0.9 + vy * 0.3; }
      parts.push({ x, y, px: x, py: y, vx, vy, life: 0, max: (o.life || 70) * (0.6 + Math.random() * 0.6), size: (o.size || 2.2) * (0.5 + Math.random()), c: cols[i % cols.length], g: o.gravity || 0.05, drag: o.drag || 0.955, spark: Math.random() < 0.6 });
    }
    if (o.ring !== false) F.ring(x, y, o.color, o.ringSize);
    kick();
  };
  F.ring = function (x, y, color, size) {
    if (reduce) return;
    rings.push({ x, y, r: 4, max: size || 160, c: hex(color || F.accent()), life: 0 });
    rings.push({ x, y, r: 2, max: (size || 160) * 0.6, c: [255, 255, 255], life: -6 });
    kick();
  };
  F.burstAt = (el, o) => { if (!el) return; const r = el.getBoundingClientRect(); F.burst(r.left + r.width / 2, r.top + r.height / 2, o); };

  /* ---------- 页面切换 ---------- */
  F.transition = function (color) {
    if (reduce) return;
    const x = W / 2, y = H / 2;
    rings.push({ x, y, r: 10, max: Math.hypot(W, H) * 0.6, c: hex(color), life: 0, thick: 3 });
    rings.push({ x, y, r: 6, max: Math.hypot(W, H) * 0.45, c: [255, 255, 255], life: -5, thick: 1.5 });
    F.burst(x, y, { color, count: 140, power: 16, life: 60, size: 2.6, gravity: 0, ring: false, mode: Math.random() < 0.5 ? 'radial' : 'vortex' });
  };

  function loop() {
    ctx.clearRect(0, 0, W, H);
    // 鼠标尾迹
    if (!coarse && mx >= 0 && (Math.abs(mx - pmx) + Math.abs(my - pmy) > 1)) {
      const col = hex(F.accent()), sp = Math.min(6, Math.hypot(mx - pmx, my - pmy) / 6);
      for (let i = 0; i < 2; i++) parts.push({ x: mx, y: my, px: mx, py: my, vx: (Math.random() - 0.5) * sp, vy: (Math.random() - 0.5) * sp, life: 0, max: 26 + Math.random() * 20, size: 1 + Math.random() * 1.6, c: Math.random() < 0.3 ? [255, 255, 255] : col, g: -0.01, drag: 0.94, spark: false });
      pmx = mx; pmy = my;
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.px = p.x; p.py = p.y;
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.g;
      p.x += p.vx; p.y += p.vy; p.life++;
      const k = 1 - p.life / p.max;
      if (k <= 0) { parts.splice(i, 1); continue; }
      const [r, g, b] = p.c;
      if (p.spark) {
        ctx.strokeStyle = `rgba(${r},${g},${b},${k})`; ctx.lineWidth = p.size * k;
        ctx.beginPath(); ctx.moveTo(p.px - p.vx * 2, p.py - p.vy * 2); ctx.lineTo(p.x, p.y); ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(${r},${g},${b},${k * 0.9})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, 6.283); ctx.fill();
      }
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const q = rings[i];
      q.life++;
      if (q.life < 0) continue;
      q.r += (q.max - q.r) * 0.09;
      const k = 1 - q.r / q.max;
      if (k < 0.02) { rings.splice(i, 1); continue; }
      const [r, g, b] = q.c;
      ctx.strokeStyle = `rgba(${r},${g},${b},${k})`; ctx.lineWidth = (q.thick || 2) * (0.5 + k);
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 6.283); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    // 鼠标停下、粒子也散尽时就停：之前只要鼠标进过页面，这一层全屏画布会一直每帧重绘
    if (parts.length || rings.length || (!coarse && performance.now() - lastMove < 120)) raf = requestAnimationFrame(loop);
    else { running = false; ctx.clearRect(0, 0, W, H); }
  }

  /* ---------- 3D 滚动入场 ---------- */
  F.reveal = function (root, scrollRoot) {
    const els = B.$$('[data-reveal]', root);
    if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('rv-in')); return; }
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      e.target.classList.add('rv-in');
      if (e.target.dataset.scramble != null) F.scramble(e.target.querySelector('[data-scr]') || e.target);
    }), { root: scrollRoot || null, threshold: 0.15 });
    els.forEach((e, i) => { if (!e.style.getPropertyValue('--rd')) e.style.setProperty('--rd', ((i % 6) * 70) + 'ms'); io.observe(e); });
  };

  /* ---------- 文字解码效果 ---------- */
  const GLYPHS = '生命演化万物深海尺度灭绝共生细胞基因星球ACGT0123456789◆◇▲△●○';
  F.scramble = function (el, text, dur = 900) {
    if (!el) return;
    const target = text != null ? text : (el.dataset.text || (el.dataset.text = el.textContent));
    if (reduce) { el.textContent = target; return; }
    const t0 = performance.now(), n = target.length;
    cancelAnimationFrame(el._scr);
    (function tick(now) {
      const k = Math.min(1, (now - t0) / dur);
      let out = '';
      for (let i = 0; i < n; i++) {
        const ch = target[i];
        if (ch === ' ' || i / n < k * 1.15 - 0.15) out += ch;
        else out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
      if (k < 1) el._scr = requestAnimationFrame(tick); else el.textContent = target;
    })(t0);
  };

  F.init = function () {
    c = document.createElement('canvas');
    c.id = 'fx-layer'; c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    ctx = c.getContext('2d');
    resize();
    addEventListener('resize', resize);
    if (!coarse && !reduce) {
      addEventListener('pointermove', e => { if (pmx < 0) { pmx = e.clientX; pmy = e.clientY; } mx = e.clientX; my = e.clientY; lastMove = performance.now(); kick(); }, { passive: true });
      document.addEventListener('pointerleave', () => { mx = my = -1; });
    }
    // 点击按钮、卡片时迸发粒子
    addEventListener('click', e => {
      const t = e.target.closest('button, .btn, .portal, .chip, .rl-node, .nav-links a, .sp-item, .rl-card, .tl-card, .critter, .rl-rec');
      if (t) F.burst(e.clientX, e.clientY, { count: 36, power: 5, life: 44, size: 1.8, ringSize: 70 });
    }, true);
  };
  B.fx = F;
})();
