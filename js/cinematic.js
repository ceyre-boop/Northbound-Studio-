/* js/cinematic.js — dev: cinematic hero cursor parallax + scroll.
 * Vanilla, no deps, matches dream.js style. Adds body.cinematic so css
 * only applies when this runs. Respects reduced-motion. */
(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.body.classList.add('cinematic');

  var root = document.documentElement;
  var hero = document.querySelector('.hero');
  if (!hero) return;

  // --- cursor parallax on the hero (desktop, fine pointer only) -------------
  var fine = window.matchMedia('(pointer: fine)').matches;
  if (fine && !reduced) {
    var tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    function onMove(e) {
      var r = hero.getBoundingClientRect();
      // -1..1 from hero centre
      tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
      ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
      if (!raf) raf = requestAnimationFrame(tick);
    }
    function tick() {
      raf = 0;
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      hero.style.setProperty('--px', cx.toFixed(3));
      hero.style.setProperty('--py', cy.toFixed(3));
      if (Math.abs(tx - cx) > 0.002 || Math.abs(ty - cy) > 0.002) raf = requestAnimationFrame(tick);
    }
    hero.addEventListener('pointermove', onMove, { passive: true });
    hero.addEventListener('pointerleave', function () {
      tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
  }

  // --- "watch the machines work" --------------------------------------------
  var wrap = document.querySelector('[data-machines]');
  if (!wrap) return;
  var track = wrap.querySelector('.machines-track');
  var panels = [].slice.call(wrap.querySelectorAll('.machine'));
  var dots = [].slice.call(wrap.querySelectorAll('.machines-rail li'));
  var mqMobile = window.matchMedia('(max-width: 860px)');

  function setActive(i) {
    panels.forEach(function (p, n) { p.classList.toggle('is-active', n === i); });
    dots.forEach(function (d, n) { d.classList.toggle('on', n === i); });
  }

  var desktopScroll = null, io = null;

  function teardown() {
    if (desktopScroll) { window.removeEventListener('scroll', desktopScroll); desktopScroll = null; }
    if (io) { io.disconnect(); io = null; }
    panels.forEach(function (p) { p.classList.remove('is-active', 'is-in'); });
    dots.forEach(function (d) { d.classList.remove('on'); });
  }

  function initDesktop() {
    var n = panels.length, ticking = false, cur = -1;
    setActive(0);
    function update() {
      ticking = false;
      var r = track.getBoundingClientRect();
      var span = r.height - window.innerHeight;
      var prog = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
      var i = Math.min(n - 1, Math.floor(prog * n));
      if (i !== cur) { cur = i; setActive(i); }
    }
    desktopScroll = function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', desktopScroll, { passive: true });
    update();
  }

  function initMobile() {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) e.target.classList.add('is-in'); });
    }, { threshold: 0.3, rootMargin: '0px 0px -8% 0px' });
    panels.forEach(function (p) {
      io.observe(p);
      // tap to replay the little animation
      p.addEventListener('click', function () {
        p.classList.remove('is-in');
        // force reflow so the animations restart
        void p.offsetWidth;
        p.classList.add('is-in');
      });
    });
  }

  function apply() { teardown(); (mqMobile.matches ? initMobile : initDesktop)(); }
  apply();
  (mqMobile.addEventListener ? mqMobile.addEventListener.bind(mqMobile, 'change') : mqMobile.addListener.bind(mqMobile))(apply);
})();
