export function createStatusPanel(indicator, label, message) {
  function setStatus(text, kind = "success") {
    indicator.dataset.kind = kind;
    label.textContent = kind === "error" ? "Error" : kind === "warning" ? "Aviso" : "Listo";
    message.textContent = text;
  }

  return { setStatus };
}
