/* Timegrapher landing: motion + canvases.
   Robustness contract: page is fully visible with no JS / frozen
   rendering. html.anim (added after a live rAF tick) gates all
   hidden pre-reveal states and loops. */
'use strict';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── Reveals: scroll-position based ──────────────────────── */
function checkReveals() {
  if (!document.documentElement.classList.contains('anim')) return;
  const vh = innerHeight;
  document.querySelectorAll('.rv:not(.in)').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.top < vh * 0.9 && r.bottom > 0) el.classList.add('in');
  });
  document.querySelectorAll('[data-count]:not(.counted)').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.top < vh * 0.84 && r.bottom > 0) { el.classList.add('counted'); runCount(el); }
  });
}
addEventListener('scroll', checkReveals, { passive: true });
addEventListener('resize', checkReveals, { passive: true });

/* ── Count-up numerals (markup holds final values) ───────── */
const fmtCount = (v, dec, thousands, plus) => {
  let s = v.toFixed(dec);
  if (thousands) s = Number(s).toLocaleString('en').replace(/,/g, '\u2009');
  if (plus && v > 0) s = '+' + s;
  return s;
};
function runCount(el) {
  if (reduced) return;
  const raw = el.dataset.count, target = parseFloat(raw);
  const dec = raw.includes('.') ? 1 : 0, plus = raw.startsWith('+');
  const thousands = !!el.dataset.thousands;
  const t0 = performance.now(), dur = 1300;
  (function tick(t) {
    const p = Math.min((t - t0) / dur, 1);
    el.textContent = fmtCount(target * (1 - Math.pow(1 - p, 4)), dec, thousands, plus);
    if (p < 1) requestAnimationFrame(tick);
  })(t0);
}

/* ── Chapter-II strip canvas: scroll-driven reveal ───────── */
const stripCv = document.getElementById('strip-canvas');
let stripProgress = 1; /* full pattern when static */
function paintStrip() {
  if (!stripCv || !stripCv.clientWidth) return;
  const dpr = devicePixelRatio || 1, w = stripCv.clientWidth, h = stripCv.clientHeight;
  stripCv.width = w * dpr; stripCv.height = h * dpr;
  const ctx = stripCv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(240,234,222,0.045)'; ctx.lineWidth = 1;
  for (let y = 0; y < h; y += 34) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  const x0 = w * 0.76, x1 = w * 0.88;
  const rows = Math.floor(h / 13);
  ctx.fillStyle = '#C9A45C'; ctx.globalAlpha = 0.8;
  for (let i = 0; i < rows * stripProgress; i++) {
    const y = i * 13 + 8, lean = i * 0.4;
    ctx.fillRect(x0 + lean, y, 2.5, 2.5);
    ctx.fillRect(x1 + lean, y, 2.5, 2.5);
  }
  ctx.globalAlpha = 1;
}
function onStripScroll() {
  if (!stripCv) return;
  const card = stripCv.closest('.strip-card');
  const r = card.getBoundingClientRect();
  const p = Math.min(Math.max((innerHeight - r.top) / (innerHeight + r.height * 0.5), 0), 1);
  if (Math.abs(p - stripProgress) > 0.01) { stripProgress = p; paintStrip(); }
}

/* ── FAQ: smooth open / close ────────────────────────────── */
(function faqAccordion() {
  const EASE = 'cubic-bezier(0.33, 1, 0.68, 1)';

  document.querySelectorAll('.faq-item').forEach(item => {
    const summary = item.querySelector('.faq-q');
    const answer = item.querySelector('.faq-a');
    if (!summary || !answer) return;

    let anim = null;
    let expanding = false;
    let closing = false;

    function settle(open) {
      item.open = open;
      anim = null;
      expanding = closing = false;
      item.classList.remove('faq-closing');
      item.style.height = '';
      item.style.overflow = '';
      answer.getAnimations().forEach(a => a.cancel());
    }

    function expand() {
      expanding = true;
      const start = item.offsetHeight;
      const end = summary.offsetHeight + answer.offsetHeight;
      if (anim) anim.cancel();
      anim = item.animate(
        { height: [start + 'px', end + 'px'] },
        { duration: 360, easing: EASE }
      );
      answer.getAnimations().forEach(a => a.cancel());
      answer.animate(
        { opacity: [0, 1], transform: ['translateY(-6px)', 'translateY(0)'] },
        { duration: 300, delay: 80, easing: 'ease-out', fill: 'backwards' }
      );
      anim.onfinish = () => settle(true);
      anim.oncancel = () => { expanding = false; };
    }

    function shrink() {
      closing = true;
      item.classList.add('faq-closing');
      const start = item.offsetHeight;
      const end = summary.offsetHeight;
      if (anim) anim.cancel();
      anim = item.animate(
        { height: [start + 'px', end + 'px'] },
        { duration: 280, easing: EASE }
      );
      answer.getAnimations().forEach(a => a.cancel());
      answer.animate({ opacity: [1, 0] }, { duration: 150, easing: 'ease-in', fill: 'forwards' });
      anim.onfinish = () => settle(false);
      anim.oncancel = () => { closing = false; };
    }

    summary.addEventListener('click', e => {
      e.preventDefault();
      if (reduced) { item.open = !item.open; return; }
      item.style.overflow = 'hidden';
      if (closing || !item.open) {
        item.style.height = item.offsetHeight + 'px';
        item.open = true;
        requestAnimationFrame(expand);
      } else if (expanding || item.open) {
        shrink();
      }
    });
  });
})();

/* ── Boot ────────────────────────────────────────────────── */
paintStrip(); /* full pattern for frozen contexts */
addEventListener('resize', paintStrip, { passive: true });

if (!reduced) {
  requestAnimationFrame(() => {
    document.documentElement.classList.add('anim');
    stripProgress = 0;
    addEventListener('scroll', onStripScroll, { passive: true });
    onStripScroll();
    requestAnimationFrame(checkReveals);
  });
}
