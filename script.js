// ─── Page load ───────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  document.body.classList.add('loaded');
});

// ─── Scroll reveal ───────────────────────────────────────────────────────────
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1 }
);

document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// ─── Review slider ───────────────────────────────────────────────────────────
const slider = document.querySelector('[data-slider]');
if (slider) {
  const reviews = slider.querySelectorAll('.review');
  const prev = slider.querySelector('[data-prev]');
  const next = slider.querySelector('[data-next]');
  let index = 0;
  let intervalId = null;

  const show = (target) => {
    reviews[index].classList.remove('active');
    index = (target + reviews.length) % reviews.length;
    reviews[index].classList.add('active');
  };

  prev?.addEventListener('click', () => { stopAuto(); show(index - 1); });
  next?.addEventListener('click', () => { stopAuto(); show(index + 1); });

  const startAuto = () => {
    if (intervalId || document.hidden || reducedMotion.matches) return;
    intervalId = setInterval(() => show(index + 1), 6000);
  };
  const stopAuto = () => {
    clearInterval(intervalId);
    intervalId = null;
  };

  document.addEventListener('visibilitychange', () => {
    document.hidden ? stopAuto() : startAuto();
  });

  startAuto();
}

// ─── Package card: pre-fill budget select from CTA click ─────────────────────
document.querySelectorAll('[data-package]').forEach((link) => {
  link.addEventListener('click', () => {
    const budgetSelect = document.getElementById('budget-select');
    if (!budgetSelect) return;
    const pkg = link.dataset.package;
    for (const opt of budgetSelect.options) {
      if (opt.text.startsWith(pkg.split(' ')[0])) {
        opt.selected = true;
        break;
      }
    }
  });
});

// ─── Application form ────────────────────────────────────────────────────────
const intakeForm = document.getElementById('intake-form');
const formMessage = document.querySelector('.form-message');

function validateField(field) {
  const errorEl = field.closest('label')?.querySelector('.field-error');
  const empty = !field.value.trim();

  if (field.required && empty) {
    field.classList.add('invalid');
    if (errorEl) errorEl.textContent = 'This field is required.';
    return false;
  }
  field.classList.remove('invalid');
  if (errorEl) errorEl.textContent = '';
  return true;
}

if (intakeForm) {
  // Live validation on blur
  intakeForm.querySelectorAll('input, select, textarea').forEach((field) => {
    field.addEventListener('blur', () => validateField(field));
    field.addEventListener('input', () => {
      if (field.classList.contains('invalid')) validateField(field);
    });
  });

  intakeForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validate all required fields
    const fields = intakeForm.querySelectorAll('input:not([name="_gotcha"]), select, textarea');
    let valid = true;
    fields.forEach((f) => {
      if (!validateField(f)) valid = false;
    });
    if (!valid) return;

    const submitBtn = intakeForm.querySelector('#form-submit');
    const btnLabel = submitBtn.querySelector('.btn-label');
    const btnSpinner = submitBtn.querySelector('.btn-spinner');

    submitBtn.disabled = true;
    btnLabel.textContent = 'Sending…';
    btnSpinner.hidden = false;

    try {
      const data = new FormData(intakeForm);
      const res = await fetch(intakeForm.action, {
        method: 'POST',
        body: data,
        headers: { Accept: 'application/json' },
      });

      if (res.ok) {
        formMessage.textContent = "Application received — we'll be in touch within 24 hours.";
        formMessage.className = 'form-message success';
        intakeForm.reset();
      } else {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Submission failed');
      }
    } catch (err) {
      formMessage.textContent = 'Something went wrong. Email us directly at hello@northboundstudio.co';
      formMessage.className = 'form-message error';
    } finally {
      submitBtn.disabled = false;
      btnLabel.textContent = 'Submit Application';
      btnSpinner.hidden = true;
    }
  });
}
