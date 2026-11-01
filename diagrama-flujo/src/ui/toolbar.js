export function initializeToolbar(buttons, actions) {
  buttons.newProject.addEventListener("click", actions.newProject);
  buttons.openCode.addEventListener("click", actions.openCode);
  buttons.saveCode.addEventListener("click", actions.saveCode);
  buttons.analyzeCode.addEventListener("click", actions.analyzeCode);
  buttons.generateDiagram.addEventListener("click", actions.generateDiagram);

  for (const tab of buttons.mobileTabs) {
    tab.addEventListener("click", () => {
      const view = tab.dataset.view;
      document.querySelector(".workspace").dataset.mobileView = view;
      for (const candidate of buttons.mobileTabs) {
        const isActive = candidate === tab;
        candidate.classList.toggle("is-active", isActive);
        candidate.setAttribute("aria-pressed", String(isActive));
      }
    });
  }
}
