const revealItems = document.querySelectorAll('.reveal');
const parallaxTarget = document.getElementById('parallax-target');

window.addEventListener('load', () => {
  document.body.classList.add('loaded');
});

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  },
  { threshold: 0.12 }
);

revealItems.forEach((item) => observer.observe(item));

window.addEventListener('scroll', () => {
  if (!parallaxTarget) {
    return;
  }

  const offset = window.scrollY * 0.12;
  parallaxTarget.style.transform = `translateY(${Math.min(offset, 80)}px)`;
});

const slider = document.querySelector('[data-slider]');
if (slider) {
  const reviews = slider.querySelectorAll('.review');
  const prev = slider.querySelector('[data-prev]');
  const next = slider.querySelector('[data-next]');
  let index = 0;
  let autoAdvanceId;

  const show = (target) => {
    index = (target + reviews.length) % reviews.length;
    reviews.forEach((review, i) => {
      review.classList.toggle('active', i === index);
    });
  };

  prev?.addEventListener('click', () => show(index - 1));
  next?.addEventListener('click', () => show(index + 1));

  const startAutoAdvance = () => {
    if (autoAdvanceId || document.hidden) {
      return;
    }
    autoAdvanceId = window.setInterval(() => show(index + 1), 6000);
  };

  const stopAutoAdvance = () => {
    if (!autoAdvanceId) {
      return;
    }
    window.clearInterval(autoAdvanceId);
    autoAdvanceId = undefined;
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAutoAdvance();
      return;
    }
    startAutoAdvance();
  });

  startAutoAdvance();
}
