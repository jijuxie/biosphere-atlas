/* 扫码访问：把当前网址生成二维码，手机扫一下就能打开（二维码在本地生成，离线可用） */
(function () {
  const B = BIO;
  const box = document.getElementById('qr'), input = document.getElementById('qr-url'), code = document.getElementById('qr-code'), note = document.getElementById('qr-note'), keep = document.getElementById('qr-view');
  const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

  const pageUrl = () => location.origin + location.pathname + (keep.checked ? location.hash : '');
  function make(text) {
    const q = qrcode(0, 'M');
    q.addData(text, 'Byte');
    q.make();
    return q;
  }
  function render() {
    const url = input.value.trim();
    if (!url) { code.innerHTML = ''; return; }
    let q;
    try { q = make(url); } catch (e) { code.innerHTML = '<p class="qr-err">网址太长，无法生成二维码</p>'; return; }
    code.innerHTML = q.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
    const local = (() => { try { return LOCAL.test(new URL(url).hostname); } catch (e) { return false; } })();
    note.className = 'qr-note' + (local ? ' warn' : '');
    note.textContent = local ? '这是本机地址，手机扫了打不开。请把上面的网址改成局域网地址（如 http://192.168.x.x:8080）或外网地址。' : '用手机相机或微信扫一扫即可打开';
  }
  // 下载 PNG：在 canvas 上逐格绘制，白底留边，方便打印或发到群里
  function download() {
    const url = input.value.trim(); if (!url) return;
    const q = make(url), n = q.getModuleCount(), cell = 12, pad = cell * 4, size = n * cell + pad * 2;
    const c = document.createElement('canvas'); c.width = c.height = size;
    const o = c.getContext('2d');
    o.fillStyle = '#fff'; o.fillRect(0, 0, size, size); o.fillStyle = '#02040a';
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) o.fillRect(pad + k * cell, pad + r * cell, cell, cell);
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png'); a.download = '万物-二维码.png'; a.click();
  }

  B.openQR = function () {
    input.value = pageUrl();
    render();
    box.classList.add('open'); box.setAttribute('aria-hidden', 'false');
  };
  B.closeQR = () => { box.classList.remove('open'); box.setAttribute('aria-hidden', 'true'); };

  input.addEventListener('input', render);
  keep.addEventListener('change', () => { input.value = pageUrl(); render(); });
  document.getElementById('open-qr').onclick = B.openQR;
  box.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) B.closeQR();
    if (e.target.closest('[data-copy]')) {
      const b = e.target.closest('[data-copy]');
      (navigator.clipboard ? navigator.clipboard.writeText(input.value.trim()) : Promise.reject()).then(() => { b.textContent = '已复制 ✓'; }, () => { input.select(); b.textContent = '请按 ⌘/Ctrl + C'; });
      setTimeout(() => { b.textContent = '复制链接'; }, 1600);
    }
    if (e.target.closest('[data-dl]')) download();
  });
})();
