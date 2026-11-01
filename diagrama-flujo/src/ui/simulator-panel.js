function buttonState(button, disabled) {
  button.disabled = disabled;
}

function displayValue(entry) {
  if (!entry.known) return "Desconocido";
  if (typeof entry.value === "string") return JSON.stringify(entry.value);
  return String(entry.value);
}

function collectVariables(state) {
  const variables = new Map(Object.entries(state.globalVariables).map(([name, value]) => [name, { name, ...value }]));
  for (const scope of state.scopes) {
    for (const [name, value] of Object.entries(scope.variables)) {
      variables.set(name, { name, scope: scope.name, ...value });
    }
  }
  return [...variables.values()];
}

export function createSimulatorPanel(panel, controller, onError = () => {}) {
  const start = panel.querySelector("#simulation-start");
  const next = panel.querySelector("#simulation-next");
  const previous = panel.querySelector("#simulation-previous");
  const run = panel.querySelector("#simulation-run");
  const pause = panel.querySelector("#simulation-pause");
  const restart = panel.querySelector("#simulation-restart");
  const speed = panel.querySelector("#simulation-speed");
  const maxSteps = panel.querySelector("#simulation-max-steps");
  const status = panel.querySelector("#simulation-status");
  const step = panel.querySelector("#simulation-step");
  const current = panel.querySelector("#simulation-current");
  const variables = panel.querySelector("#simulation-variables");
  const condition = panel.querySelector("#simulation-condition");
  const iterations = panel.querySelector("#simulation-iterations");
  const consoleOutput = panel.querySelector("#simulation-console-output");
  const consoleEmpty = panel.querySelector("#simulation-console-empty");
  const eventLog = panel.querySelector("#simulation-event-log");
  const serialSpeed = panel.querySelector("#simulation-serial-speed");
  const pinList = panel.querySelector("#simulation-pin-list");
  const pinsEmpty = panel.querySelector("#simulation-pins-empty");
  const consoleTab = panel.querySelector("#simulation-console-tab");
  const pinsTab = panel.querySelector("#simulation-pins-tab");
  const consoleView = panel.querySelector("#simulation-console-view");
  const pinsView = panel.querySelector("#simulation-pins-view");
  const ioContent = panel.querySelector("#simulation-io-content");
  const toggleIo = panel.querySelector("#simulation-toggle-io");
  const inputForm = panel.querySelector("#simulation-input-form");
  const inputLabel = panel.querySelector("#simulation-input-label");
  const inputValue = panel.querySelector("#simulation-input-value");
  const error = panel.querySelector("#simulation-error");

  function reportError(reason) {
    error.textContent = reason instanceof Error ? reason.message : String(reason);
    error.hidden = false;
  }

  function perform(action) {
    error.hidden = true;
    try {
      action();
    } catch (reason) {
      reportError(reason);
      onError(reason);
    }
  }

  start.addEventListener("click", () => perform(() => controller.start()));
  next.addEventListener("click", () => perform(() => controller.next()));
  previous.addEventListener("click", () => perform(() => controller.previous()));
  run.addEventListener("click", () => perform(() => controller.run(Number(speed.value))));
  pause.addEventListener("click", () => controller.pause());
  restart.addEventListener("click", () => perform(() => controller.restart()));
  panel.querySelector("#simulation-clear-console").addEventListener("click", () =>
    perform(() => controller.clearConsole()),
  );
  toggleIo.addEventListener("click", () => {
    ioContent.hidden = !ioContent.hidden;
    toggleIo.setAttribute("aria-expanded", String(!ioContent.hidden));
    toggleIo.textContent = ioContent.hidden ? "Mostrar panel" : "Ocultar panel";
  });

  function selectIoTab(tab) {
    const showConsole = tab === consoleTab;
    consoleTab.classList.toggle("is-active", showConsole);
    pinsTab.classList.toggle("is-active", !showConsole);
    consoleTab.setAttribute("aria-selected", String(showConsole));
    pinsTab.setAttribute("aria-selected", String(!showConsole));
    consoleTab.tabIndex = showConsole ? 0 : -1;
    pinsTab.tabIndex = showConsole ? -1 : 0;
    consoleView.hidden = !showConsole;
    pinsView.hidden = showConsole;
    consoleView.classList.toggle("is-active", showConsole);
    pinsView.classList.toggle("is-active", !showConsole);
  }

  consoleTab.addEventListener("click", () => selectIoTab(consoleTab));
  pinsTab.addEventListener("click", () => selectIoTab(pinsTab));
  for (const [tab, other] of [[consoleTab, pinsTab], [pinsTab, consoleTab]]) {
    tab.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft" || event.key === "Home" || event.key === "End") {
        event.preventDefault();
        const nextTab = event.key === "Home" ? consoleTab : event.key === "End" ? pinsTab : other;
        selectIoTab(nextTab);
        nextTab.focus();
      }
    });
  }
  maxSteps.addEventListener("change", () => perform(() => controller.setMaxSteps(maxSteps.value)));

  inputForm.addEventListener("submit", (event) => {
    event.preventDefault();
    perform(() => {
      controller.provideInput(inputValue.value);
      inputValue.value = "";
    });
  });

  variables.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-variable-form]");
    if (!form) return;
    event.preventDefault();
    perform(() => {
      controller.setVariable(form.dataset.variable, new FormData(form).get("value"));
    });
  });

  function render(state) {
    panel.hidden = state.status === "idle" && !panel.dataset.available;
    status.textContent = state.message;
    status.dataset.state = state.status;
    step.textContent = `Paso ${state.step} · límite ${state.maxSteps}`;
    current.replaceChildren();
    if (state.currentInstruction) {
      const location = document.createElement("p");
      location.className = "simulation-current-location";
      location.textContent = state.currentLine ? `Línea ${state.currentLine}` : "Sin línea de código";
      const source = document.createElement("pre");
      source.className = "simulation-current-source";
      source.textContent = state.currentInstruction;
      current.append(location, source);
    } else {
      current.textContent = state.status === "idle"
        ? "Inicia la simulación para ver la instrucción activa."
        : state.lastOperation;
    }

    condition.textContent = state.conditionResult
      ? `Última condición: ${state.conditionResult}.`
      : "Todavía no se ha evaluado una condición.";
    const iterationEntries = Object.entries(state.loopIterations);
    iterations.textContent = iterationEntries.length
      ? iterationEntries.map(([id, count], index) => `Bucle ${index + 1}: ${count}`).join(" · ")
      : "Sin iteraciones registradas.";

    variables.replaceChildren();
    const knownVariables = collectVariables(state);
    if (!knownVariables.length) {
      const empty = document.createElement("p");
      empty.className = "simulation-empty";
      empty.textContent = "Las variables aparecerán cuando comience la ejecución.";
      variables.append(empty);
    } else {
      const table = document.createElement("table");
      table.className = "simulation-variable-table";
      const head = document.createElement("tr");
      for (const label of ["Variable", "Tipo", "Valor"]) {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.textContent = label;
        head.append(cell);
      }
      const thead = document.createElement("thead");
      thead.append(head);
      const tbody = document.createElement("tbody");
      for (const item of knownVariables) {
        const row = document.createElement("tr");
        const name = document.createElement("th");
        name.scope = "row";
        name.textContent = item.name;
        const type = document.createElement("td");
        type.textContent = item.type ?? "—";
        const value = document.createElement("td");
        value.textContent = item.known ? displayValue(item) : `${displayValue(item)} · ${item.reason}`;
        row.append(name, type, value);
        if (!item.known) {
          const editRow = document.createElement("tr");
          const formCell = document.createElement("td");
          formCell.colSpan = 3;
          const form = document.createElement("form");
          form.dataset.variableForm = "";
          form.dataset.variable = item.name;
          form.className = "simulation-variable-form";
          const input = document.createElement("input");
          input.name = "value";
          input.type = item.type === "String" || item.type === "string" ? "text" : "text";
          input.placeholder = `Valor inicial para ${item.name}`;
          input.setAttribute("aria-label", `Valor inicial para ${item.name}`);
          const submit = document.createElement("button");
          submit.type = "submit";
          submit.className = "tool-button";
          submit.textContent = "Definir";
          form.append(input, submit);
          formCell.append(form);
          editRow.append(formCell);
          tbody.append(row, editRow);
        } else {
          tbody.append(row);
        }
      }
      table.append(thead, tbody);
      variables.append(table);
    }

    consoleOutput.textContent = state.serialOutput;
    consoleEmpty.hidden = Boolean(state.serialOutput);
    consoleOutput.hidden = !state.serialOutput;
    if (state.serialOutput) consoleOutput.scrollTop = consoleOutput.scrollHeight;
    serialSpeed.textContent = state.serialBaudRate
      ? `Serial: ${state.serialBaudRate} baudios`
      : "Serial: sin configurar";

    eventLog.replaceChildren();
    if (!state.events.length) {
      const empty = document.createElement("li");
      empty.className = "simulation-io-empty";
      empty.textContent = "Los eventos aparecerán cuando avance la simulación.";
      eventLog.append(empty);
    } else {
      for (const event of state.events) {
        const item = document.createElement("li");
        item.className = "simulation-event";
        item.dataset.type = event.type;
        const location = document.createElement("span");
        location.className = "simulation-event-location";
        location.textContent = [
          `Paso ${event.step}`,
          event.line ? `línea ${event.line}` : "",
          event.blockLabel ? `bloque: ${event.blockLabel}` : "",
        ].filter(Boolean).join(" · ");
        const message = document.createElement("span");
        message.className = "simulation-event-message";
        message.textContent = event.message;
        item.append(location, message);
        eventLog.append(item);
      }
      eventLog.scrollTop = eventLog.scrollHeight;
    }

    const pins = Object.values(state.pins);
    pinList.replaceChildren();
    pinsEmpty.hidden = pins.length > 0;
    for (const pin of pins) {
      const card = document.createElement("article");
      card.className = "simulation-pin-card";
      const heading = document.createElement("h4");
      heading.textContent = `Pin ${pin.pin}`;
      const mode = document.createElement("p");
      mode.textContent = `Modo: ${pin.mode ?? "Desconocido"}`;
      const value = document.createElement("p");
      const logic = pin.value === 1 ? "HIGH" : pin.value === 0 ? "LOW" : "Desconocido";
      value.textContent = `Estado lógico: ${logic}`;
      value.dataset.state = logic.toLowerCase();
      const operation = document.createElement("p");
      operation.textContent = `Última operación: ${pin.lastOperation}`;
      const location = document.createElement("p");
      location.className = "simulation-pin-location";
      location.textContent = pin.lastLine
        ? `Paso ${pin.lastStep} · línea ${pin.lastLine}`
        : "Sin operación registrada";
      card.append(heading, mode, value, operation, location);
      pinList.append(card);
    }

    const waiting = state.status === "waiting-input" && state.waitingInput;
    inputForm.hidden = !waiting;
    if (waiting) {
      inputLabel.textContent = state.waitingInput.type === "digital"
        ? `Valor para ${state.waitingInput.callName}(${state.waitingInput.pin}) · HIGH o LOW`
        : `Valor analógico para ${state.waitingInput.callName}(${state.waitingInput.pin})`;
      inputValue.type = state.waitingInput.type === "digital" ? "text" : "number";
      inputValue.step = state.waitingInput.type === "digital" ? "1" : "any";
      inputValue.placeholder = state.waitingInput.type === "digital" ? "HIGH / LOW" : "0–1023";
    }

    const running = state.status === "running";
    const canStep = ["paused"].includes(state.status);
    buttonState(start, !panel.dataset.available || !["idle", "completed", "uncertain", "limit"].includes(state.status));
    buttonState(next, !canStep);
    buttonState(
      previous,
      state.step === 0 || ["idle", "running", "waiting-input"].includes(state.status),
    );
    buttonState(run, !canStep);
    buttonState(pause, !running);
    buttonState(restart, !panel.dataset.available || state.status === "idle");
    maxSteps.disabled = running;
  }

  return { render, reportError };
}
