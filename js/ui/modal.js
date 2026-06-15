/* ============================================================
   ui/modal.js — portfolio case-study modal.
   Ported verbatim in behavior from the stable script.js (data,
   focus trap, ESC/backdrop close). Content is unchanged.
   ============================================================ */
import { reduceMotion } from "../core/util.js";

const CASES = {
  keystone: {
    title: "Keystone South Construction",
    tag: "Web Design · Local Business",
    blurb:
      "Keystone needed a web presence that matched the quality of their build work — " +
      "clear, professional, and quick to turn a visitor into an estimate request.",
    stats: [
      ["1 week", "Concept to launch"],
      ["100%", "Mobile-ready"],
    ],
    list: [
      "Service-first messaging with strong local trust signals",
      "Responsive layout that reads cleanly on every device",
      "Fast load and basic SEO so they're findable locally",
      "Clear path to request an estimate from any section",
    ],
    url: "https://keystonesouthconstruction.com/",
  },
  taboost: {
    title: "TABOOST Shop",
    tag: "E-Commerce · Product Experience",
    blurb:
      "A product-first storefront that puts the brand and the buying flow front and " +
      "center — built to feel fast and convert browsers into buyers.",
    stats: [
      ["Product-first", "Layout system"],
      ["Brand-forward", "Visual identity"],
    ],
    list: [
      "Clean, distraction-free buying flow",
      "Brand-forward hero and product presentation",
      "Snappy interactions tuned for conversion",
      "Responsive from phone to desktop",
    ],
    url: "https://shop.taboost.me/",
  },
};

export function initModal() {
  const modal = document.getElementById("caseModal");
  const content = document.getElementById("caseContent");
  if (!modal || !content) return false;
  let lastFocus = null;

  function open(key, trigger) {
    const c = CASES[key];
    if (!c) return;
    lastFocus = trigger || null;
    content.innerHTML = `
      <span class="case__tag">${c.tag}</span>
      <h3 id="caseTitle">${c.title}</h3>
      <p>${c.blurb}</p>
      <div class="case__stats">
        ${c.stats
          .map(
            ([num, lbl]) =>
              `<div class="case__stat"><div class="case__num">${num}</div><div class="case__lbl">${lbl}</div></div>`
          )
          .join("")}
      </div>
      <ul class="case__list">
        ${c.list.map((li) => `<li>${li}</li>`).join("")}
      </ul>
      <p style="margin-top:1.6rem">
        <a class="project__open" href="${c.url}" target="_blank" rel="noopener noreferrer">
          Visit the live site <span aria-hidden="true">↗</span>
        </a>
      </p>`;
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add("is-open"));
    if (trigger) trigger.setAttribute("aria-expanded", "true");
    modal.querySelector(".modal__close").focus();
    document.addEventListener("keydown", onKey);
  }

  function close() {
    modal.classList.remove("is-open");
    document.removeEventListener("keydown", onKey);
    document
      .querySelectorAll('.project__open[aria-expanded="true"]')
      .forEach((b) => b.setAttribute("aria-expanded", "false"));
    const finish = () => {
      modal.hidden = true;
      modal.removeEventListener("transitionend", finish);
      if (lastFocus) lastFocus.focus();
    };
    if (reduceMotion) finish();
    else modal.addEventListener("transitionend", finish);
  }

  function onKey(e) {
    if (e.key === "Escape") {
      close();
      return;
    }
    if (e.key === "Tab") {
      const f = modal.querySelectorAll(
        'button, a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  document.querySelectorAll(".project__open[data-project]").forEach((btn) => {
    btn.addEventListener("click", () => open(btn.dataset.project, btn));
  });
  modal
    .querySelectorAll("[data-close]")
    .forEach((el) => el.addEventListener("click", close));
  return true;
}
