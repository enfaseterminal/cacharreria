const STORAGE_KEY = "arduino-flowchart-theme";

export function initializeTheme(button, onStorageError) {
  let theme = "light";

  try {
    const savedTheme = window.localStorage.getItem(STORAGE_KEY);
    if (savedTheme === "light" || savedTheme === "dark") {
      theme = savedTheme;
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      theme = "dark";
    }
  } catch (error) {
    onStorageError(error);
  }

  function applyTheme() {
    document.documentElement.dataset.theme = theme;
    const nextTheme = theme === "light" ? "oscuro" : "claro";
    button.setAttribute("aria-label", `Cambiar a tema ${nextTheme}`);
    button.title = `Cambiar a tema ${nextTheme}`;
    button.querySelector(".theme-toggle-label").textContent = `Tema ${nextTheme}`;
    button.querySelector("[aria-hidden='true']").textContent = theme === "light" ? "☾" : "☀";
  }

  function toggleTheme() {
    theme = theme === "light" ? "dark" : "light";
    applyTheme();
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {
      onStorageError(error);
    }
  }

  applyTheme();
  button.addEventListener("click", toggleTheme);
  return { getTheme: () => theme };
}
