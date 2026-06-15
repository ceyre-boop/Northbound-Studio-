/* ============================================================
   ui/form.js — application form (Formspree).
   Ported verbatim in behavior from the stable script.js:
   package-CTA budget prefill, validation, honeypot, send states.
   Endpoint and markup unchanged.
   ============================================================ */
export function initForm() {
  const form = document.getElementById("applyForm");
  if (!form) return false;
  const status = form.querySelector(".form__status");
  const budget = form.querySelector("#budgetSelect");

  document.querySelectorAll(".pkg__cta[data-budget]").forEach((cta) => {
    cta.addEventListener("click", () => {
      if (budget) {
        const want = cta.dataset.budget;
        [...budget.options].forEach((o) => {
          if (o.value === want || o.text === want) budget.value = o.value;
        });
      }
    });
  });

  function setStatus(msg, type) {
    status.textContent = msg;
    status.classList.remove("is-error", "is-success");
    if (type) status.classList.add(type);
  }

  function validate() {
    let ok = true;
    form.querySelectorAll("[required]").forEach((field) => {
      const valid = field.value.trim() !== "";
      field.classList.toggle("is-invalid", !valid);
      if (!valid && ok) {
        ok = false;
        field.focus();
      }
    });
    return ok;
  }

  form.querySelectorAll(".field__input").forEach((field) => {
    field.addEventListener("input", () => field.classList.remove("is-invalid"));
    field.addEventListener("change", () => field.classList.remove("is-invalid"));
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (form.querySelector('[name="_gotcha"]').value) {
      setStatus("Thanks — we'll be in touch.", "is-success");
      return;
    }
    if (!validate()) {
      setStatus("Please fill in the highlighted fields.", "is-error");
      return;
    }
    form.classList.add("is-sending");
    setStatus("Sending…", "");
    try {
      const res = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });
      form.classList.remove("is-sending");
      if (res.ok) {
        form.classList.add("is-sent");
        setStatus("Application sent — we'll reply within 24 hours.", "is-success");
        form.reset();
        setTimeout(() => form.classList.remove("is-sent"), 4000);
      } else {
        const data = await res.json().catch(() => ({}));
        const msg =
          data.errors && data.errors.length
            ? data.errors.map((x) => x.message).join(", ")
            : "Something went wrong. Please try again or email us directly.";
        setStatus(msg, "is-error");
      }
    } catch {
      form.classList.remove("is-sending");
      setStatus("Network error — check your connection and try again.", "is-error");
    }
  });
  return true;
}
