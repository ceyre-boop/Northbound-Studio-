/* templates.js — Scene 5 template picker. Single-select cards; selection
   auto-fills the form's template + budget selects and scrolls to #apply. */
(function () {
  window.NB = window.NB || {};

  NB.templates = {
    init() {
      const cards = Array.from(document.querySelectorAll(".tpl"));
      if (!cards.length) return false;

      cards.forEach((card) => {
        card.addEventListener("click", () => {
          cards.forEach((c) => c.classList.toggle("is-selected", c === card));
          NB.selectedTemplate = card.dataset.template || "";
          if (NB.form && NB.form.setTemplate) NB.form.setTemplate(card.dataset.template, card.dataset.budget);
          if (NB.scrollTo) NB.scrollTo(document.querySelector("#apply"));
        });
      });
      return true;
    },
  };
})();
