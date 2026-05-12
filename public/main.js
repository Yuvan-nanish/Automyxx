'use strict';

/* ══════════════════════════════════════════════════════════
   UpfrontSolutions v2 — main.js
   Interactive draggable neural net · Sky aesthetic · Flow animations
   ══════════════════════════════════════════════════════════ */

/* ── Utilities ──────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function dist2(ax, ay, bx, by) { const dx = ax-bx, dy = ay-by; return dx*dx+dy*dy; }

/* ══════════════════════════════════════════════════════════
   1. LOADER
   ══════════════════════════════════════════════════════════ */
(function initLoader() {
  const loader = $('loader');
  if (!loader) return;

  // inject SVG gradient defs inline
  const svg = loader.querySelector('.loader-logo-svg');
  if (svg) {
    const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
    defs.innerHTML = `<linearGradient id="loaderGrad" x1="0" y1="0" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7dd3fc"/>
      <stop offset="100%" stop-color="#0369a1"/>
    </linearGradient>`;
    svg.prepend(defs);
  }

  const hide = () => loader.classList.add('gone');
  window.addEventListener('load', () => setTimeout(hide, 2300));
  setTimeout(hide, 3500);
})();

/* ══════════════════════════════════════════════════════════
   2. INTERACTIVE NEURAL CANVAS WITH DRAGGABLE NODES
   ══════════════════════════════════════════════════════════ */
(function initHeroCanvas() {
  const canvas = $('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H;
  let nodes = [];
  let raf;
  let mouse = { x: -999, y: -999, down: false };
  let dragging = null;   // node being dragged
  let repelRadius = 120; // passive mouse repel when not dragging
  let hovered = null;

  /* ─ Node class ─ */
  class Node {
    constructor(id) {
      this.id = id;
      this.x  = Math.random() * W;
      this.y  = Math.random() * H;
      this.vx = (Math.random() - 0.5) * 0.3;
      this.vy = (Math.random() - 0.5) * 0.3;
      this.baseR = Math.random() < 0.15 ? 6 : (Math.random() < 0.4 ? 4 : 2.5);
      this.r     = this.baseR;
      this.targetR = this.baseR;
      this.hue     = Math.random() < 0.6 ? 200 : 220; // sky blues
      this.lit     = false;
      this.label   = Math.random() < 0.08 ? ['Input','Hidden','Output','Layer','Bias','Weight'][Math.floor(Math.random()*6)] : null;
      this.activity = 0; // 0..1 activation animation
      this.actDir   = 0; // pulse direction
    }

    // soft bounce off walls
    bounceWalls() {
      const pad = 30;
      if (this.x < pad)  { this.vx += 0.05; }
      if (this.x > W-pad){ this.vx -= 0.05; }
      if (this.y < pad)  { this.vy += 0.05; }
      if (this.y > H-pad){ this.vy -= 0.05; }
    }

    update(dt) {
      if (this === dragging) return;

      // passive mouse repel
      const mdx = this.x - mouse.x, mdy = this.y - mouse.y;
      const md2 = mdx*mdx + mdy*mdy;
      if (md2 < repelRadius*repelRadius && md2 > 0) {
        const md = Math.sqrt(md2);
        const strength = (1 - md/repelRadius) * 1.2;
        this.vx += (mdx/md) * strength;
        this.vy += (mdy/md) * strength;
      }

      // node-node repulsion (light)
      for (let j = 0; j < nodes.length; j++) {
        if (j === this.id) continue;
        const o = nodes[j];
        const nx = this.x - o.x, ny = this.y - o.y;
        const d2 = nx*nx+ny*ny;
        if (d2 < 2500 && d2 > 0) { // 50px
          const d = Math.sqrt(d2);
          const f = (1 - d/50) * 0.4;
          this.vx += (nx/d)*f; this.vy += (ny/d)*f;
        }
      }

      this.bounceWalls();

      // damping
      this.vx *= 0.96;
      this.vy *= 0.96;
      this.vx = clamp(this.vx, -3, 3);
      this.vy = clamp(this.vy, -3, 3);

      this.x += this.vx * dt * 60;
      this.y += this.vy * dt * 60;

      // activity pulse
      this.activity += this.actDir * dt * 0.8;
      if (this.activity >= 1) { this.activity = 1; this.actDir = -1; }
      if (this.activity <= 0) { this.activity = 0; this.actDir = 0; }

      // spontaneous activation
      if (this.actDir === 0 && Math.random() < 0.002) {
        this.actDir = 1;
      }

      // radius lerp
      this.targetR = this.baseR + this.activity * 3;
      this.r = lerp(this.r, this.targetR, 0.1);
    }

    isNear(px, py) {
      return dist2(this.x, this.y, px, py) < (this.r + 10) * (this.r + 10);
    }
  }

  /* ─ Init ─ */
  function init() {
    W = canvas.width  = canvas.parentElement.offsetWidth;
    H = canvas.height = canvas.parentElement.offsetHeight;
    repelRadius = Math.min(W, H) * 0.15;
    const count = clamp(Math.floor((W * H) / 14000), 30, 75);
    nodes = Array.from({length: count}, (_, i) => new Node(i));
  }

  /* ─ Draw edges ─ */
  function drawEdges() {
    const maxDist  = Math.min(W, H) * 0.22;
    const maxDist2 = maxDist * maxDist;

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i+1; j < nodes.length; j++) {
        const b = nodes[j];
        const d2 = dist2(a.x, a.y, b.x, b.y);
        if (d2 > maxDist2) continue;

        const d = Math.sqrt(d2);
        const proximity = 1 - d/maxDist;
        const lift = (a.activity + b.activity) * 0.5;
        const baseAlpha = proximity * 0.18;
        const alpha = clamp(baseAlpha + lift * 0.3, 0, 0.7);

        // gradient edge based on proximity to dragged node
        let liftColor = false;
        if (dragging && (a === dragging || b === dragging)) liftColor = true;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);

        // slight curve for organic feel
        const cx = (a.x + b.x) / 2 + (Math.sin(a.id + b.id) * 20 * proximity);
        const cy = (a.y + b.y) / 2 + (Math.cos(a.id * b.id) * 15 * proximity);
        ctx.quadraticCurveTo(cx, cy, b.x, b.y);

        if (liftColor) {
          ctx.strokeStyle = `rgba(125,211,252,${clamp(alpha*2.5, 0, 0.9)})`;
          ctx.lineWidth   = proximity * 1.8;
        } else {
          const r = Math.round(lerp(56,  14, 1-proximity));
          const g = Math.round(lerp(189, 165, 1-proximity));
          const bl= Math.round(lerp(248, 233, 1-proximity));
          ctx.strokeStyle = `rgba(${r},${g},${bl},${alpha})`;
          ctx.lineWidth   = proximity * 1.2;
        }
        ctx.stroke();

        // signal travelling along an active edge
        if (lift > 0.4 && d < maxDist * 0.7) {
          const t = (Date.now() % 2000) / 2000;
          const sx = a.x + (b.x - a.x) * t;
          const sy = a.y + (b.y - a.y) * t;
          ctx.beginPath();
          ctx.arc(sx, sy, 2, 0, Math.PI*2);
          ctx.fillStyle = `rgba(125,211,252,${lift * 0.7})`;
          ctx.fill();
        }
      }
    }
  }

  /* ─ Draw nodes ─ */
  function drawNodes() {
    nodes.forEach(n => {
      const isDragged  = n === dragging;
      const isHovered  = n === hovered;
      const highlight  = isDragged || isHovered;

      // outer glow
      if (highlight || n.activity > 0.2) {
        const glowR = n.r * (highlight ? 5 : 3 + n.activity * 3);
        const glowA = highlight ? 0.25 : n.activity * 0.18;
        const grd   = ctx.createRadialGradient(n.x, n.y, n.r*0.5, n.x, n.y, glowR);
        grd.addColorStop(0, `rgba(56,189,248,${glowA})`);
        grd.addColorStop(1, `rgba(56,189,248,0)`);
        ctx.beginPath(); ctx.arc(n.x, n.y, glowR, 0, Math.PI*2);
        ctx.fillStyle = grd; ctx.fill();
      }

      // ring for large nodes
      if (n.baseR >= 5) {
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 5, 0, Math.PI*2);
        ctx.strokeStyle = `rgba(56,189,248,${0.15 + n.activity*0.2})`;
        ctx.lineWidth = 1; ctx.stroke();
      }

      // node body
      const nodeGrd = ctx.createRadialGradient(n.x-n.r*0.3, n.y-n.r*0.3, n.r*0.1, n.x, n.y, n.r);
      if (isDragged) {
        nodeGrd.addColorStop(0, '#e0f2fe');
        nodeGrd.addColorStop(1, '#38bdf8');
      } else {
        const base = highlight ? 0.95 : (0.5 + n.activity * 0.4);
        const l    = Math.round(base * 248);
        nodeGrd.addColorStop(0, `rgba(${l},${l},${l},0.95)`);
        nodeGrd.addColorStop(1, `rgba(56,189,248,${0.6 + n.activity*0.4})`);
      }
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI*2);
      ctx.fillStyle = nodeGrd; ctx.fill();

      // label for special nodes
      if (n.label && (isHovered || isDragged || n.baseR >= 5)) {
        ctx.font = `${clamp(n.r * 1.8, 9, 12)}px Inter, sans-serif`;
        ctx.fillStyle = `rgba(125,211,252,${isHovered||isDragged?0.9:0.4})`;
        ctx.textAlign = 'center';
        ctx.fillText(n.label, n.x, n.y - n.r - 6);
      }
    });
  }

  /* ─ Render loop ─ */
  let last = 0;
  function render(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    ctx.clearRect(0, 0, W, H);
    nodes.forEach(n => n.update(dt));
    drawEdges();
    drawNodes();

    raf = requestAnimationFrame(render);
  }

  /* ─ Mouse / Touch events ─ */
  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    };
  }

  function findNodeAt(px, py) {
    // closest node within hit radius
    let best = null, bestD = Infinity;
    nodes.forEach(n => {
      const d2 = dist2(n.x, n.y, px, py);
      if (n.isNear(px, py) && d2 < bestD) { best = n; bestD = d2; }
    });
    return best;
  }

  canvas.addEventListener('mousemove', e => {
    const {x, y} = getCanvasPos(e);
    mouse.x = x; mouse.y = y;
    if (dragging) {
      dragging.x = x; dragging.y = y;
      dragging.vx = 0; dragging.vy = 0;
      document.body.classList.add('cur-drag');
    } else {
      hovered = findNodeAt(x, y);
      document.body.classList.toggle('cur-hover', !!hovered);
      document.body.classList.remove('cur-drag');
    }
  }, {passive: true});

  canvas.addEventListener('mousedown', e => {
    const {x, y} = getCanvasPos(e);
    dragging = findNodeAt(x, y);
    if (dragging) {
      dragging.vx = 0; dragging.vy = 0;
      dragging.activity = 1; dragging.actDir = -1;
      document.body.classList.add('cur-drag');
      e.preventDefault();
    }
  });

  window.addEventListener('mouseup', () => {
    if (dragging) {
      // fling on release
      dragging.vx = (mouse.x - dragging.x) * 0.05;
      dragging.vy = (mouse.y - dragging.y) * 0.05;
      dragging = null;
    }
    document.body.classList.remove('cur-drag');
  });

  canvas.addEventListener('mouseleave', () => {
    mouse.x = -999; mouse.y = -999;
    hovered = null;
  });

  // Touch support
  canvas.addEventListener('touchstart', e => {
    const {x,y} = getCanvasPos(e);
    dragging = findNodeAt(x,y);
    if (dragging) { dragging.vx=0; dragging.vy=0; e.preventDefault(); }
  }, {passive:false});

  canvas.addEventListener('touchmove', e => {
    const {x,y} = getCanvasPos(e);
    mouse.x=x; mouse.y=y;
    if (dragging) { dragging.x=x; dragging.y=y; e.preventDefault(); }
  }, {passive:false});

  canvas.addEventListener('touchend', () => { dragging = null; });

  // Double-click: spawn a new node
  canvas.addEventListener('dblclick', e => {
    const {x,y} = getCanvasPos(e);
    if (nodes.length < 80) {
      const n = new Node(nodes.length);
      n.x = x; n.y = y; n.activity = 1; n.actDir = -1;
      nodes.push(n);
    }
  });

  /* ─ Resize ─ */
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    init();
    raf = requestAnimationFrame(render);
  });
  ro.observe(canvas.parentElement);

  // Pause when hero not visible
  const io = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      if (!raf) raf = requestAnimationFrame(render);
    } else {
      cancelAnimationFrame(raf); raf = null;
    }
  }, {threshold: 0});
  io.observe(canvas);

  init();
  raf = requestAnimationFrame(render);
})();

/* ══════════════════════════════════════════════════════════
   3. CUSTOM CURSOR
   ══════════════════════════════════════════════════════════ */
(function initCursor() {
  const dot  = $('cursor');
  const ring = $('cursor-ring');
  if (!dot || !ring) return;
  if (window.matchMedia('(pointer:coarse)').matches) return;

  let mx=-100,my=-100, rx=-100,ry=-100;

  document.addEventListener('mousemove', e => { mx=e.clientX; my=e.clientY; }, {passive:true});

  function loop() {
    dot.style.left = mx+'px'; dot.style.top = my+'px';
    rx = lerp(rx,mx,0.14); ry = lerp(ry,my,0.14);
    ring.style.left = rx+'px'; ring.style.top = ry+'px';
    requestAnimationFrame(loop);
  }
  loop();

  $$('a,button,.svc-card,.proj-card,.testi-card,.why-feat').forEach(el => {
    el.addEventListener('mouseenter', () => document.body.classList.add('cur-hover'));
    el.addEventListener('mouseleave', () => document.body.classList.remove('cur-hover'));
  });
})();

/* ══════════════════════════════════════════════════════════
   4. SCROLL PROGRESS
   ══════════════════════════════════════════════════════════ */
(function initProgress() {
  const bar = $('scroll-progress');
  if (!bar) return;
  const update = () => {
    const pct = window.scrollY / (document.body.scrollHeight - innerHeight);
    bar.style.transform = `scaleX(${clamp(pct,0,1)})`;
  };
  window.addEventListener('scroll', update, {passive:true});
})();

/* ══════════════════════════════════════════════════════════
   5. NAVBAR
   ══════════════════════════════════════════════════════════ */
(function initNav() {
  const nav  = $('navbar');
  const ham  = $('hamburger');
  const menu = $('nav-links');
  if (!nav) return;

  window.addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 30), {passive:true});

  // Active link
  const sections = $$('section[id]');
  const links    = $$('.nl');
  const linkMap  = {};
  links.forEach(l => { const h=l.getAttribute('href'); if(h) linkMap[h.slice(1)]=l; });

  new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        links.forEach(l=>l.classList.remove('active'));
        const l = linkMap[e.target.id];
        if (l) l.classList.add('active');
      }
    });
  }, {threshold:0.4}).observe(document.getElementById('hero') ?? sections[0]);
  sections.forEach(s => {
    new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        links.forEach(l=>l.classList.remove('active'));
        const l = linkMap[entries[0].target.id];
        if(l) l.classList.add('active');
      }
    }, {threshold:0.3}).observe(s);
  });

  // Mobile menu
  if (ham && menu) {
    ham.addEventListener('click', () => {
      const open = menu.classList.toggle('open');
      ham.classList.toggle('open', open);
      ham.setAttribute('aria-expanded', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      menu.classList.remove('open');
      ham.classList.remove('open');
      ham.setAttribute('aria-expanded','false');
      document.body.style.overflow='';
    }));
  }
})();

/* ══════════════════════════════════════════════════════════
   6. SCROLL REVEAL
   ══════════════════════════════════════════════════════════ */
(function initReveal() {
  const els = $$('.reveal-up,.reveal-left,.reveal-right,.reveal-scale');
  const io  = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('revealed');
        io.unobserve(e.target);
      }
    });
  }, {threshold:0.12, rootMargin:'0px 0px -30px 0px'});
  els.forEach(el => io.observe(el));
})();

/* ══════════════════════════════════════════════════════════
   7. STAT COUNTERS
   ══════════════════════════════════════════════════════════ */
(function initCounters() {
  $$('[data-target]').forEach(el => {
    new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return;
      const target = +el.dataset.target;
      const dur    = 1600;
      const start  = performance.now();
      const tick   = now => {
        const p = Math.min((now-start)/dur, 1);
        const e = 1 - Math.pow(1-p, 3);
        el.textContent = Math.floor(e * target);
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = target;
      };
      requestAnimationFrame(tick);
    }, {threshold:0.5}).observe(el);
  });
})();

/* ══════════════════════════════════════════════════════════
   8. SMOOTH ANCHOR SCROLL
   ══════════════════════════════════════════════════════════ */
(function initScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href').slice(1);
      const el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      const offset = ($('navbar')?.offsetHeight ?? 70) + 8;
      window.scrollTo({top: el.getBoundingClientRect().top + scrollY - offset, behavior:'smooth'});
    });
  });
})();

/* ══════════════════════════════════════════════════════════
   9. PROCESS STEPS — staggered animation
   ══════════════════════════════════════════════════════════ */
(function initProcess() {
  const steps = $$('.proc-step');
  steps.forEach((s,i) => {
    s.style.opacity = '0';
    s.style.transform = 'translateY(24px)';
    s.style.transition = `opacity 0.65s ${0.1*i}s ease, transform 0.65s ${0.1*i}s ease`;
    new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        s.style.opacity='1'; s.style.transform='none';
      }
    }, {threshold:0.2}).observe(s);
  });
})();

/* ══════════════════════════════════════════════════════════
   10. WHY FEATS — hover line lift
   ══════════════════════════════════════════════════════════ */
(function initWhyFeats() {
  $$('.why-feat').forEach(f => {
    f.addEventListener('mouseenter', () => {
      const num = f.querySelector('.wf-num');
      if (num) num.style.opacity='1';
    });
    f.addEventListener('mouseleave', () => {
      const num = f.querySelector('.wf-num');
      if (num) num.style.opacity='';
    });
  });
})();

/* ══════════════════════════════════════════════════════════
   11. CONTACT FORM — powered by Formspree
   ══════════════════════════════════════════════════════════
   SETUP: Replace YOUR_FORM_ID below with your Formspree ID.
   1. Go to https://formspree.io and sign up (free)
   2. Click "New Form", name it "UpfrontSolutions Contact"
   3. Copy the form ID (e.g. xpwzrqkd) and paste below
   ══════════════════════════════════════════════════════════ */
const FORMSPREE_ID = 'mpqbyqgp'; // ← replace this

(function initForm() {
  const form = $('contact-form');
  const msg  = $('form-msg');
  const btn  = $('form-submit');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    msg.className = 'form-msg';

    const name    = $('cf-name').value.trim();
    const email   = $('cf-email').value.trim();
    const subject = $('cf-subject')?.value.trim() || '(no subject)';
    const text    = $('cf-message').value.trim();

    // — Client-side validation —
    if (!name)  return showMsg('Please enter your name.', 'err');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                return showMsg('Please enter a valid email.', 'err');
    if (!text)  return showMsg('Please enter a message.', 'err');

    if (FORMSPREE_ID === 'YOUR_FORM_ID') {
      showMsg('⚠ Form not configured yet. See main.js for setup instructions.', 'err');
      return;
    }

    // — Send to Formspree —
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Sending…';

    try {
      const res = await fetch(`https://formspree.io/f/${FORMSPREE_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ name, email, subject, message: text })
      });

      const data = await res.json();

      if (res.ok) {
        form.reset();
        showMsg('✓ Message sent! We\'ll be in touch within 24 hours.', 'ok');
      } else {
        const errMsg = data?.errors?.map(e => e.message).join(', ') || 'Something went wrong.';
        showMsg(`✗ ${errMsg}`, 'err');
      }
    } catch {
      showMsg('✗ Network error. Please try again or email us directly.', 'err');
    } finally {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Send Message';
    }
  });

  function showMsg(text, cls) {
    msg.textContent = text;
    msg.className   = `form-msg ${cls}`;
  }
})();

/* ══════════════════════════════════════════════════════════
   12. CHAT WIDGET
   ══════════════════════════════════════════════════════════ */
(function initChat() {
  const w = $('chat-widget');
  if (!w) return;
  const go = () => $('contact')?.scrollIntoView({behavior:'smooth', block:'start'});
  w.addEventListener('click', go);
  w.addEventListener('keydown', e => (e.key==='Enter'||e.key===' ') && go());
})();

/* ══════════════════════════════════════════════════════════
   13. FOOTER YEAR
   ══════════════════════════════════════════════════════════ */
(function initYear() {
  const el = $('yr');
  if (el) el.textContent = new Date().getFullYear();
})();

/* ══════════════════════════════════════════════════════════
   14. HERO PARALLAX (subtle depth on content)
   ══════════════════════════════════════════════════════════ */
(function initParallax() {
  const heroContent = document.querySelector('.hero-content');
  if (!heroContent) return;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    requestAnimationFrame(() => {
      const y   = window.scrollY;
      const max = document.getElementById('hero')?.offsetHeight || 0;
      if (y < max) {
        heroContent.style.transform = `translateY(${y * 0.15}px)`;
        heroContent.style.opacity   = `${clamp(1 - y/max * 1.4, 0, 1)}`;
      }
      ticking = false;
    });
    ticking = true;
  }, {passive:true});
})();

/* ══════════════════════════════════════════════════════════
   15. SERVICES CARD GLOW FOLLOW MOUSE
   ══════════════════════════════════════════════════════════ */
(function initCardGlow() {
  $$('.svc-card, .proj-card, .testi-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width  * 100).toFixed(1);
      const y = ((e.clientY - rect.top)  / rect.height * 100).toFixed(1);
      card.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(56,189,248,0.07) 0%, transparent 60%), var(--bg-card, rgba(7,30,54,0.6))`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.background = '';
    });
  });
})();

/* ══════════════════════════════════════════════════════════
   16. PROJECT MODALS
   ══════════════════════════════════════════════════════════ */
(function initProjectModals() {
  const LOGOS = {
    'ai-prediction':       `<svg viewBox="0 0 40 40" fill="none"><path d="M20 6C13.4 6 8 11.4 8 18c0 4.2 2 7.9 5.1 10.2L12 34h16l-1.1-5.8C30 25.9 32 22.2 32 18c0-6.6-5.4-12-12-12z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M13 23l3.5-5 3.5 3.5 3.5-7L27 19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    'secure-encryption':   `<svg viewBox="0 0 40 40" fill="none"><path d="M20 4L8 9v11c0 9.4 5.2 16.3 12 18 6.8-1.7 12-8.6 12-18V9L20 4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><rect x="15" y="18" width="10" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M17 18v-2a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    'automation-dashboard':`<svg viewBox="0 0 40 40" fill="none"><rect x="4" y="4" width="14" height="14" rx="3" stroke="currentColor" stroke-width="1.5"/><rect x="22" y="4" width="14" height="14" rx="3" stroke="currentColor" stroke-width="1.5"/><rect x="4" y="22" width="14" height="14" rx="3" stroke="currentColor" stroke-width="1.5"/><rect x="22" y="22" width="14" height="14" rx="3" stroke="currentColor" stroke-width="1.5"/></svg>`,
    'smart-doc':           `<svg viewBox="0 0 40 40" fill="none"><path d="M8 6h16l8 8v20H8V6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M24 6v8h8" stroke="currentColor" stroke-width="1.5"/><circle cx="18" cy="26" r="5" stroke="currentColor" stroke-width="1.5"/><path d="M22 30l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    'neuroops':            `<svg viewBox="0 0 40 40" fill="none"><rect x="4" y="6" width="32" height="8" rx="2" stroke="currentColor" stroke-width="1.5"/><rect x="4" y="18" width="32" height="8" rx="2" stroke="currentColor" stroke-width="1.5"/><circle cx="32" cy="10" r="2" fill="currentColor"/><circle cx="32" cy="22" r="2" fill="currentColor"/><path d="M10 32c2-4 4-2 6 0s4 2 6 0 4-4 6 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    'recruit-iq':          `<svg viewBox="0 0 40 40" fill="none"><circle cx="20" cy="13" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 34c0-6.6 5.4-12 12-12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M28 23l2 5 4-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    'support-iq':          `<svg viewBox="0 0 40 40" fill="none"><path d="M20 6c-7.7 0-14 6.3-14 14 0 3.5 1.3 6.7 3.4 9.2L8 33h4.8c2.1 1.3 4.5 2 7.2 2 7.7 0 14-6.3 14-14S27.7 6 20 6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M15 20a5 5 0 0 1 10 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="12" y="20" width="4" height="5" rx="2" stroke="currentColor" stroke-width="1.5"/><rect x="24" y="20" width="4" height="5" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M29 29l3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="31" cy="31" r="2.5" stroke="currentColor" stroke-width="1.3"/></svg>`,
  };

  const DATA = {
    'ai-prediction': {
      name: 'AI Prediction System',
      tagline: 'ML platform forecasting business outcomes with high accuracy',
      tags: ['Python','TensorFlow','FastAPI','React','Scikit-learn'],
      overview: 'An end-to-end machine learning platform that ingests historical business data and produces accurate predictions for sales, churn, demand, and operational metrics. Built with a FastAPI backend, it serves predictions via REST API to a React dashboard with real-time visualisations.',
      features: [
        {t:'Ensemble Forecasting', d:'Combines gradient boosting, LSTM, and linear regression models for robust multi-horizon predictions.'},
        {t:'Real-time Dashboard', d:'React frontend with live charts updated as new data arrives — no page refresh required.'},
        {t:'Auto Feature Engineering', d:'Automatically extracts lag features, rolling statistics, and seasonality indicators from raw time-series data.'},
        {t:'Model Monitoring', d:'Tracks prediction drift and retrains automatically when accuracy drops below threshold.'},
      ],
      stack: ['Python','TensorFlow','FastAPI','React','PostgreSQL','Docker'],
    },
    'secure-encryption': {
      name: 'Secure Encryption Platform',
      tagline: 'End-to-end encryption infrastructure for regulated industries',
      tags: ['AES-256','Node.js','PostgreSQL','Zero Trust','HIPAA'],
      overview: 'A zero-trust encryption infrastructure built for healthcare and financial sectors. Provides AES-256 field-level encryption, key management, audit logging, and compliance reporting — all without exposing raw data to the application layer.',
      features: [
        {t:'Field-Level Encryption', d:'Encrypt individual database columns — only authorised microservices can decrypt specific fields.'},
        {t:'Key Rotation', d:'Automated key lifecycle management with zero-downtime rotation and backward compatibility.'},
        {t:'Audit Trail', d:'Immutable, tamper-proof logs of every data access event for HIPAA / PCI-DSS compliance.'},
        {t:'Zero-Trust Architecture', d:'Every service must authenticate and be authorised per-request. No implicit trust within the network.'},
      ],
      stack: ['Node.js','PostgreSQL','Redis','Vault (HashiCorp)','Docker','AWS KMS'],
    },
    'automation-dashboard': {
      name: 'Automation Dashboard',
      tagline: 'Real-time control centre for distributed automated workflows',
      tags: ['Vue.js','WebSockets','Redis','Node.js','Kubernetes'],
      overview: 'A live operations dashboard for managing and monitoring complex distributed automation pipelines. Engineers get real-time visibility into workflow health, job queues, failure rates, and throughput — all in a single pane of glass.',
      features: [
        {t:'Live WebSocket Updates', d:'Sub-second dashboard refresh with WebSocket push — no polling, no stale data.'},
        {t:'Workflow DAG Visualiser', d:'Interactive directed acyclic graph showing task dependencies and current execution state.'},
        {t:'Alert & Escalation Engine', d:'Rule-based alerting with on-call rotation and escalation policies built in.'},
        {t:'Multi-Cluster Support', d:'Aggregate metrics from multiple Kubernetes clusters into a single unified view.'},
      ],
      stack: ['Vue.js','Node.js','Redis','WebSockets','Kubernetes','Prometheus'],
    },
    'smart-doc': {
      name: 'Smart Doc Analyzer',
      tagline: 'NLP-powered extraction and classification of unstructured documents',
      tags: ['NLP','spaCy','OCR','AWS','Python'],
      overview: 'An intelligent document processing pipeline that ingests PDFs, scans, and forms — extracts structured data using OCR and NLP — then classifies, routes, and archives documents automatically. Reduces manual document handling by over 90%.',
      features: [
        {t:'Multi-Format OCR', d:'Handles PDFs, scanned images, and handwritten forms using Tesseract and AWS Textract.'},
        {t:'Named Entity Extraction', d:'spaCy-powered NER identifies names, dates, amounts, organisations, and custom entities.'},
        {t:'Auto Classification', d:'ML classifier routes documents to the correct workflow based on content type and metadata.'},
        {t:'Confidence Scoring', d:'Every extraction includes a confidence score — low-confidence items are flagged for human review.'},
      ],
      stack: ['Python','spaCy','AWS Textract','Tesseract','FastAPI','S3','PostgreSQL'],
    },
    'neuroops': {
      name: 'NeuroOps',
      tagline: 'Autonomous SRE platform — monitor, predict, auto-heal, 24/7',
      tags: ['Python','FastAPI','XGBoost','AWS','PostgreSQL','Redis','GitHub Actions'],
      overview: 'NeuroOps is an autonomous Site Reliability Engineering platform that monitors cloud infrastructure 24/7, detects anomalies before they cause outages, predicts hardware failures days in advance, and automatically heals broken systems — all without human intervention. One NeuroOps instance replaces the routine work of 5–10 SRE engineers.',
      features: [
        {t:'InfraMind — Anomaly Detection', d:'Hybrid ML (Isolation Forest + Statistical Z-Score) detects CPU spikes, memory leaks, and unusual patterns within seconds.'},
        {t:'Failure Predictor (XGBoost)', d:'94%+ accuracy failure prediction trained on thousands of real AWS metrics. Outputs: "Failure probability: 92.76%, Risk: CRITICAL".'},
        {t:'RUL — Remaining Useful Life', d:'7-feature Random Forest model estimates remaining cycles before hardware failure for predictive maintenance scheduling.'},
        {t:'Auto-Healing Engine', d:'Automatically restarts EC2, scales up/down, cleans disk, restarts services — with cooldown periods and rollback on failure.'},
        {t:'ScaleWise — Cost Optimiser', d:'Real-time AWS pricing API integration. Detects idle instances and recommends downsizing. Example: "t3.medium → t3.micro: Save $22.78/month".'},
        {t:'OpsGPT — AI Log Analysis', d:'Two-tier rule-based pattern matching + OpenRouter LLM fallback. Reduces debugging from 30 minutes to 30 seconds.'},
        {t:'DeployGuard', d:'ML model assesses deployment risk before push. Output: "Risk: 74% → BLOCKED" or "Risk: 30% → APPROVED".'},
      ],
      metrics: [
        {v:'85',l:'API Endpoints'},{v:'7,800+',l:'Metrics Collected'},{v:'2,110+',l:'Alerts Generated'},
        {v:'94%+',l:'Prediction Accuracy'},{v:'852',l:'Auto-Heal Actions'},{v:'$22.78',l:'Saved / Instance / Month'},
      ],
      stack: ['Python','FastAPI','Scikit-learn','XGBoost','Isolation Forest','PostgreSQL','Redis','AWS EC2/CloudWatch/SNS','GitHub Actions','Docker'],
    },
    'recruit-iq': {
      name: 'Recruit-IQ',
      tagline: 'End-to-end AI recruitment — screen, interview, evaluate, zero bias',
      tags: ['FastAPI','OpenRouter','Supabase','PaddleOCR','MediaPipe','gTTS'],
      overview: 'Recruit-IQ is an end-to-end AI recruitment automation platform that screens, evaluates, and interviews candidates with zero human intervention until final shortlisting. It saves HR teams 80% of their screening time while ensuring 100% proctored, cheat-proof interviews. Built for startups, SMEs, and enterprises across tech, healthcare, finance, and retail.',
      features: [
        {t:'AI Resume Screening', d:'Hybrid scoring: 40% RRF keyword+semantic, 40% Skill Ontology matching, 20% semantic similarity. Outputs 0–100% score + recommendation.'},
        {t:'Multilingual OCR', d:'PaddleOCR processes Tamil, Hindi, and English resumes — eliminating false negatives from non-English CVs.'},
        {t:'Intelligent Interview Engine', d:'Generates 5 adaptive questions per candidate: 2 domain-specific, 2 resume-specific, 1 general. Supports typed, voice, MCQ, and drawing formats.'},
        {t:'5-Layer Anti-Cheat Proctoring', d:'Browser lock + webcam face detection (90% integrity score) + continuous face verification + tab tracking + 15-min grace period.'},
        {t:'Automated Email Reports', d:'Shortlisted and rejected candidates receive instant email with a PDF evaluation report and improvement suggestions.'},
        {t:'HR Dashboard', d:'Streamlit-based dashboard to review scores, shortlist candidates, schedule interviews, and export CSV analytics.'},
      ],
      metrics: [
        {v:'80%',l:'Screening Time Saved'},{v:'$0',l:'Monthly Cost (Free Tier)'},{v:'1000+',l:'Resumes/Month'},
        {v:'5-Layer',l:'Anti-Cheat System'},{v:'90%',l:'Proctoring Integrity'},{v:'30s',l:'Resume Screened In'},
      ],
      stack: ['FastAPI','Python','OpenRouter LLM','Supabase','PaddleOCR','OpenCV','MediaPipe','gTTS','Web Speech API','Gmail SMTP'],
    },
    'support-iq': {
      name: 'SupportIQ',
      tagline: 'AI-powered e-commerce support resolution — triage, retrieve, resolve, verify',
      tags: ['Python','FastAPI','LangGraph','FAISS','Gemini LLMs'],
      overview: 'SupportIQ is a multi-agent AI-powered e-commerce customer support platform that automatically analyzes support tickets, retrieves relevant company policies using semantic search, generates grounded customer resolutions with citations, and validates responses through a compliance-checking agent before final delivery. The system handles refunds, shipping disputes, cancellations, damaged items, payment issues, and policy inquiries while minimizing hallucinations through strict retrieval grounding and verification pipelines.',
      features: [
        {t:'Smart Triage Agent', d:'Automatically classifies customer issues into categories like refunds, cancellations, shipping problems, damaged items, and payment disputes. Extracts key facts, identifies missing information, and generates targeted retrieval queries.'},
        {t:'PolicyMind — Semantic Retrieval', d:'FAISS-powered vector search with Sentence Transformers embeddings retrieves the most relevant policy sections from the company knowledge base in milliseconds.'},
        {t:'Grounded Resolution Writer', d:'Generates professional customer-facing responses strictly from retrieved policy context with mandatory citations for every factual claim.'},
        {t:'ComplianceGuard — Hallucination Detection', d:'Second-pass verification agent checks every generated response for unsupported claims, missing citations, policy violations, and unsafe language before approval.'},
        {t:'Multi-LLM Failover Engine', d:'Automatic provider fallback chain using Gemini 2.5 Flash, Gemini 2.5 Pro, Groq Llama 3.3 70B, and Groq Llama 3.1 8B for high availability and resilience during rate limits or outages.'},
        {t:'LangGraph Workflow Orchestration', d:'State-machine architecture dynamically routes tickets through triage, retrieval, resolution generation, compliance validation, retries, and finalization.'},
        {t:'Evaluation Framework', d:'20 realistic support test cases covering refunds, lost packages, damaged items, wrong shipments, billing disputes, spam detection, and policy inquiries with automated accuracy evaluation.'},
      ],
      metrics: [
        {v:'20',l:'Evaluation Test Cases'},{v:'5+',l:'Policy Domains Indexed'},{v:'4',l:'Autonomous AI Agents'},
        {v:'100%',l:'Citation-Grounded Responses'},{v:'2-Level',l:'Compliance Verification'},{v:'0',l:'Hallucinations Approved'},
      ],
      stack: ['Python','FastAPI','LangGraph','FAISS','Sentence Transformers','Pydantic','Streamlit','Gemini 2.5 Flash','Gemini 2.5 Pro','Groq Llama 3.3 70B','Groq Llama 3.1 8B','RAG','Vector Semantic Search','Multi-Agent AI Workflow'],
    },
  };

  const overlay = $('proj-modal');
  const closeBtn = $('proj-modal-close');
  const logoEl   = $('proj-modal-logo');
  const titleEl  = $('proj-modal-title');
  const taglineEl= $('proj-modal-tagline');
  const tagsEl   = $('proj-modal-tags');
  const bodyEl   = $('proj-modal-body');
  if (!overlay) return;

  function openModal(key) {
    const d = DATA[key];
    if (!d) return;

    logoEl.innerHTML   = LOGOS[key] || '';
    titleEl.textContent= d.name;
    taglineEl.textContent = d.tagline;
    tagsEl.innerHTML   = d.tags.map(t => `<span>${t}</span>`).join('');

    let html = `<div class="pm-section"><div class="pm-section-title">Overview</div><p class="pm-overview">${d.overview}</p></div>`;

    if (d.features?.length) {
      html += `<div class="pm-section"><div class="pm-section-title">Key Features</div><div class="pm-features">`;
      d.features.forEach(f => {
        html += `<div class="pm-feature"><div class="pm-feature-title">${f.t}</div><div class="pm-feature-desc">${f.d}</div></div>`;
      });
      html += `</div></div>`;
    }

    if (d.metrics?.length) {
      html += `<div class="pm-section"><div class="pm-section-title">Results</div><div class="pm-metrics">`;
      d.metrics.forEach(m => {
        html += `<div class="pm-metric"><div class="pm-metric-val">${m.v}</div><div class="pm-metric-label">${m.l}</div></div>`;
      });
      html += `</div></div>`;
    }

    if (d.stack?.length) {
      html += `<div class="pm-section"><div class="pm-section-title">Tech Stack</div><div class="pm-stack">`;
      d.stack.forEach(s => { html += `<span>${s}</span>`; });
      html += `</div></div>`;
    }

    bodyEl.innerHTML = html;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    overlay.querySelector('.proj-modal-inner').scrollTop = 0;
  }

  function closeModal() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  // Open on "View Project" button click
  document.querySelectorAll('.proj-card').forEach(card => {
    card.querySelector('.proj-hover-overlay')?.addEventListener('click', () => {
      const key = card.dataset.project;
      if (key) openModal(key);
    });
  });

  closeBtn?.addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
})();
