/* Hero graphic — oscillating balance wheel with breathing hairspring.
   The watch's heartbeat, drawn in brand ink + brass on canvas.
   Honors prefers-reduced-motion (draws one static frame); pauses off-screen. */
'use strict';
(function () {
  const canvas = document.getElementById('hg-balance');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function colors() {
    const s = getComputedStyle(document.body);
    return {
      ink: s.getPropertyValue('--text').trim() || '#2A241A',
      soft: s.getPropertyValue('--text3').trim() || '#9A9078',
      brass: s.getPropertyValue('--brass').trim() || '#8F6F36'
    };
  }

  let W = 0, H = 0;
  function fit() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(t) {
    fit();
    const c = colors();
    ctx.clearRect(0, 0, W, H);
    const cx = W * 0.5, cy = H * 0.5;
    const R = Math.min(W, H) * 0.30;
    const theta = reduced ? 0.7 : Math.sin(t * 2 * Math.PI * 0.42) * (135 * Math.PI / 180);

    // swing arc scale beneath
    ctx.strokeStyle = c.soft; ctx.globalAlpha = 0.25; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R + 34, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();
    // travelling marker on the arc
    const ma = Math.PI * 0.5 + theta * 0.235;
    ctx.fillStyle = c.brass; ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ma) * (R + 34), cy + Math.sin(ma) * (R + 34), 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(theta);

    // hairspring — Archimedean spiral, breathing with the swing
    const breathe = 1 + Math.cos(t * 2 * Math.PI * 0.42) * 0.05;
    ctx.strokeStyle = c.ink; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.2;
    ctx.beginPath();
    const turns = 5.5, b = (R * 0.62) / (turns * 2 * Math.PI) * breathe;
    for (let p = 0; p <= turns * 2 * Math.PI; p += 0.08) {
      const r = 6 + b * p;
      const x = Math.cos(p) * r, y = Math.sin(p) * r;
      if (p === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // rim
    ctx.strokeStyle = c.ink; ctx.globalAlpha = 0.9; ctx.lineWidth = R * 0.075;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();

    // spokes (two straight bars through center)
    ctx.lineWidth = R * 0.05; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(-R, 0); ctx.lineTo(R, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -R); ctx.lineTo(0, R); ctx.stroke();

    // timing screws on the rim
    ctx.fillStyle = c.brass; ctx.globalAlpha = 1;
    for (let k = 0; k < 8; k++) {
      const ang = k * Math.PI / 4 + Math.PI / 8;
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * R, Math.sin(ang) * R, R * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }

    // staff
    ctx.fillStyle = c.ink;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c.brass;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.025, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  let raf = null, t0 = null;
  function loop(ts) {
    if (t0 === null) t0 = ts;
    draw((ts - t0) / 1000);
    raf = requestAnimationFrame(loop);
  }

  if (reduced) {
    draw(3);
    if ('ResizeObserver' in window) new ResizeObserver(function () { draw(3); }).observe(canvas);
    return;
  }

  // start immediately; IntersectionObserver only pauses/resumes when it fires
  raf = requestAnimationFrame(loop);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        if (!raf) raf = requestAnimationFrame(loop);
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = null;
      }
    }).observe(canvas);
  }
})();
