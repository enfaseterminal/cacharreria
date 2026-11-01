import { resistorBands, resistorValues } from "./circuit-model.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const COMPONENT_LABELS = {
  led: "LED",
  resistor: "Resistencia",
  button: "Pulsador",
  potentiometer: "Potenciómetro",
};
const COLOR_VALUES = {
  rojo: "#e04438",
  verde: "#329665",
  amarillo: "#e9c63f",
  azul: "#387fc1",
};

function svgElement(name, attributes = {}, text = "") {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text) element.textContent = text;
  return element;
}

function htmlElement(name, className, text = "") {
  const element = document.createElement(name);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function endpointTitle(endpoint) {
  if (endpoint.startsWith("arduino:")) return `Arduino ${endpoint.slice("arduino:".length)}`;
  const [componentId, terminal] = endpoint.split(":");
  return `${componentId} · ${terminal}`;
}

function componentDescription(component) {
  switch (component.type) {
    case "led": return `LED ${component.properties.color}`;
    case "resistor": return `Resistencia ${component.properties.ohms} Ω`;
    case "button": return `Pulsador ${component.properties.pressed ? "presionado" : "liberado"}`;
    case "potentiometer": return `Potenciómetro ${component.properties.value}/1023`;
    default: return "Componente";
  }
}

function terminalPosition(component, terminal) {
  const { x, y } = component.position;
  const offsets = {
    led: { anode: [-19, 0], cathode: [19, 0] },
    resistor: { lead1: [-34, 0], lead2: [34, 0] },
    button: { contact1: [-32, 0], contact2: [32, 0] },
    potentiometer: { end1: [-38, 0], wiper: [0, -42], end2: [38, 0] },
  };
  const [offsetX, offsetY] = offsets[component.type][terminal];
  return { x: x + offsetX, y: y + offsetY };
}

function endpointPosition(endpoint, components) {
  if (endpoint.startsWith("arduino:")) {
    const pin = endpoint.slice("arduino:".length);
    if (/^D\d+$/.test(pin)) return { x: 254, y: 82 + (Number(pin.slice(1)) - 2) * 18 };
    if (/^A\d$/.test(pin)) return { x: 254, y: 315 + Number(pin.slice(1)) * 18 };
    return { x: 254, y: pin === "5V" ? 435 : 453 };
  }
  const separator = endpoint.lastIndexOf(":");
  const component = components.find((item) => item.id === endpoint.slice(0, separator));
  return component ? terminalPosition(component, endpoint.slice(separator + 1)) : null;
}

function makeSelect(labelText, name, options, selectedValue = "") {
  const label = htmlElement("label", "circuit-field", labelText);
  const select = htmlElement("select", "circuit-select");
  select.name = name;
  for (const [value, text] of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    select.append(option);
  }
  select.value = String(selectedValue || options[0]?.[0] || "");
  label.append(select);
  return { label, control: select };
}

export function createCircuitLab(root, model, { onChange = () => {}, onLoadDemo = () => {} } = {}) {
  let selectedComponentId = null;
  let currentSimulationInputs = null;
  const canvas = root.querySelector("#circuit-canvas");
  const componentList = root.querySelector("#circuit-component-list");
  const wireList = root.querySelector("#circuit-wire-list");
  const properties = root.querySelector("#circuit-properties");
  const warnings = root.querySelector("#circuit-warnings");
  const status = root.querySelector("#circuit-status");
  const fromSelect = root.querySelector("#circuit-wire-from");
  const toSelect = root.querySelector("#circuit-wire-to");
  const wireForm = root.querySelector("#circuit-wire-form");

  function announceChange(change) {
    render();
    onChange(change);
  }

  function addOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }

  function renderCanvas() {
    const components = model.getComponents();
    const wires = model.getWires();
    canvas.replaceChildren();
    canvas.append(svgElement("title", { id: "circuit-canvas-title" }, "Arduino Uno y protoboard"));
    canvas.append(svgElement("desc", {}, "Circuito educativo. Selecciona componentes o terminales para editarlos y conectarlos."));
    canvas.append(svgElement("rect", { x: 18, y: 42, width: 246, height: 420, rx: 20, class: "circuit-uno" }));
    canvas.append(svgElement("text", { x: 141, y: 70, "text-anchor": "middle", class: "circuit-uno-title" }, "Arduino Uno"));
    canvas.append(svgElement("rect", { x: 52, y: 91, width: 138, height: 87, rx: 10, class: "circuit-chip" }));
    canvas.append(svgElement("text", { x: 121, y: 139, "text-anchor": "middle", class: "circuit-label" }, "ATmega328P"));
    canvas.append(svgElement("rect", { x: 299, y: 42, width: 483, height: 420, rx: 12, class: "circuit-breadboard" }));
    canvas.append(svgElement("text", { x: 320, y: 66, class: "circuit-board-label" }, "Protoboard"));
    for (const x of [322, 342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582, 602, 622, 642, 662, 682, 702, 722, 742, 762]) {
      for (const y of [86, 104, 122, 140, 158, 176, 194, 212, 230, 248, 266, 284, 302, 320, 338, 356, 374, 392, 410, 428, 446]) {
        canvas.append(svgElement("circle", { cx: x, cy: y, r: 2, class: "circuit-hole" }));
      }
    }

    for (let pin = 2; pin <= 13; pin += 1) {
      const y = 82 + (pin - 2) * 18;
      canvas.append(svgElement("line", { x1: 228, y1: y, x2: 254, y2: y, class: "circuit-pin-line" }));
      canvas.append(svgElement("circle", { cx: 254, cy: y, r: 5, class: "circuit-terminal", "data-terminal": `arduino:D${pin}`, tabindex: 0, role: "button", "aria-label": `Terminal Arduino D${pin}` }));
      canvas.append(svgElement("text", { x: 216, y: y + 3, "text-anchor": "end", class: "circuit-pin-label" }, `D${pin}`));
    }
    for (let pin = 0; pin <= 5; pin += 1) {
      const y = 315 + pin * 18;
      canvas.append(svgElement("line", { x1: 228, y1: y, x2: 254, y2: y, class: "circuit-pin-line" }));
      canvas.append(svgElement("circle", { cx: 254, cy: y, r: 5, class: "circuit-terminal", "data-terminal": `arduino:A${pin}`, tabindex: 0, role: "button", "aria-label": `Terminal Arduino A${pin}` }));
      canvas.append(svgElement("text", { x: 216, y: y + 3, "text-anchor": "end", class: "circuit-pin-label" }, `A${pin}`));
    }
    for (const [rail, y] of [["5V", 435], ["GND", 453]]) {
      canvas.append(svgElement("line", { x1: 228, y1: y, x2: 254, y2: y, class: "circuit-pin-line" }));
      canvas.append(svgElement("circle", { cx: 254, cy: y, r: 5, class: "circuit-terminal", "data-terminal": `arduino:${rail}`, tabindex: 0, role: "button", "aria-label": `Terminal Arduino ${rail}` }));
      canvas.append(svgElement("text", { x: 216, y: y + 3, "text-anchor": "end", class: "circuit-pin-label" }, rail));
    }

    for (const wire of wires) {
      const from = endpointPosition(wire.from, components);
      const to = endpointPosition(wire.to, components);
      if (from && to) canvas.append(svgElement("path", {
        d: `M ${from.x} ${from.y} C ${(from.x + to.x) / 2} ${from.y}, ${(from.x + to.x) / 2} ${to.y}, ${to.x} ${to.y}`,
        class: "circuit-wire",
      }));
    }

    const ledStates = model.getLedStates();
    for (const component of components) {
      const group = svgElement("g", {
        class: `circuit-component circuit-component-${component.type}${component.id === selectedComponentId ? " is-selected" : ""}`,
        "data-component-id": component.id,
        tabindex: 0,
        role: "button",
        "aria-label": `${componentDescription(component)}. Seleccionar componente.`,
      });
      const { x, y } = component.position;
      if (component.type === "led") {
        const ledState = ledStates[component.id] ?? { state: "unknown" };
        group.setAttribute("data-state", ledState.state);
        group.append(svgElement("line", { x1: x - 19, y1: y, x2: x - 9, y2: y, class: "circuit-lead" }));
        group.append(svgElement("line", { x1: x + 9, y1: y, x2: x + 19, y2: y, class: "circuit-lead" }));
        group.append(svgElement("path", { d: `M ${x - 9} ${y} Q ${x} ${y - 25} ${x + 9} ${y} Q ${x} ${y + 10} ${x - 9} ${y}Z`, class: "circuit-led-bulb", fill: COLOR_VALUES[component.properties.color] }));
        group.append(svgElement("line", { x1: x + 5, y1: y - 10, x2: x + 5, y2: y + 5, class: "circuit-led-cathode" }));
        if (ledState.state === "on") {
          group.append(svgElement("path", { d: `M ${x + 12} ${y - 18} l 10 -10 m -6 0 h 6 v 6 M ${x + 17} ${y - 7} l 10 -10 m -6 0 h 6 v 6`, class: "circuit-led-rays" }));
        }
      } else if (component.type === "resistor") {
        group.append(svgElement("line", { x1: x - 34, y1: y, x2: x - 24, y2: y, class: "circuit-lead" }));
        group.append(svgElement("rect", { x: x - 24, y: y - 9, width: 48, height: 18, rx: 4, class: "circuit-resistor-body" }));
        const bands = resistorBands(component.properties.ohms, component.properties.bandCount, component.properties.tolerance);
        const colors = { negro: "#252525", marrón: "#8b4b28", rojo: "#e04438", naranja: "#ec8428", amarillo: "#e9c63f", verde: "#329665", azul: "#387fc1", violeta: "#8457ad", gris: "#8b929b", blanco: "#f4f4f4", dorado: "#c5a13b", plateado: "#c6cbd1" };
        bands.forEach((band, index) => group.append(svgElement("rect", {
          x: x - 16 + index * (32 / Math.max(1, bands.length - 1)),
          y: y - 9,
          width: 3,
          height: 18,
          fill: colors[band],
          class: "circuit-resistor-band",
        })));
        group.append(svgElement("line", { x1: x + 24, y1: y, x2: x + 34, y2: y, class: "circuit-lead" }));
      } else if (component.type === "button") {
        group.setAttribute("data-state", component.properties.pressed ? "pressed" : "released");
        group.append(svgElement("line", { x1: x - 32, y1: y, x2: x - 16, y2: y, class: "circuit-lead" }));
        group.append(svgElement("rect", { x: x - 16, y: y - 11, width: 32, height: 22, rx: 4, class: "circuit-button-body" }));
        group.append(svgElement("circle", { cx: x, cy: y, r: 5, class: "circuit-button-cap" }));
        group.append(svgElement("line", { x1: x + 16, y1: y, x2: x + 32, y2: y, class: "circuit-lead" }));
      } else {
        group.append(svgElement("line", { x1: x - 38, y1: y, x2: x + 38, y2: y, class: "circuit-lead" }));
        const knobX = x - 26 + (Number(component.properties.value) / 1023) * 52;
        group.append(svgElement("line", { x1: x - 26, y1: y - 25, x2: x + 26, y2: y - 25, class: "circuit-pot-track" }));
        group.append(svgElement("line", { x1: knobX, y1: y - 30, x2: x, y2: y - 42, class: "circuit-pot-wiper-line" }));
        group.append(svgElement("circle", { cx: knobX, cy: y - 25, r: 6, class: "circuit-pot-knob", "data-pot-knob": "" }));
      }
      group.append(svgElement("text", { x, y: y + 28, "text-anchor": "middle", class: "circuit-component-label" }, componentDescription(component)));
      for (const terminal of component.type === "led"
        ? ["anode", "cathode"]
        : component.type === "resistor"
          ? ["lead1", "lead2"]
          : component.type === "button"
            ? ["contact1", "contact2"]
            : ["end1", "wiper", "end2"]) {
        const point = terminalPosition(component, terminal);
        group.append(svgElement("circle", {
          cx: point.x,
          cy: point.y,
          r: 5,
          class: "circuit-terminal",
          "data-terminal": `${component.id}:${terminal}`,
          tabindex: 0,
          role: "button",
          "aria-label": `Terminal ${terminal} de ${componentDescription(component)}`,
        }));
      }
      canvas.append(group);
    }
    canvas.setAttribute("aria-labelledby", "circuit-canvas-title");
  }

  function renderWireControls() {
    const endpoints = model.getEndpoints();
    const previousFrom = fromSelect.value;
    const previousTo = toSelect.value;
    fromSelect.replaceChildren();
    toSelect.replaceChildren();
    addOption(fromSelect, "", "Seleccionar terminal");
    addOption(toSelect, "", "Seleccionar terminal");
    for (const endpoint of endpoints) {
      addOption(fromSelect, endpoint.id, endpoint.label);
      addOption(toSelect, endpoint.id, endpoint.label);
    }
    if (endpoints.some(({ id }) => id === previousFrom)) fromSelect.value = previousFrom;
    if (endpoints.some(({ id }) => id === previousTo)) toSelect.value = previousTo;

    wireList.replaceChildren();
    for (const wire of model.getWires()) {
      const item = htmlElement("li", "circuit-wire-item", `${endpointTitle(wire.from)} ↔ ${endpointTitle(wire.to)}`);
      const remove = htmlElement("button", "tool-button circuit-remove-wire", "Quitar");
      remove.type = "button";
      remove.dataset.removeWire = wire.id;
      remove.setAttribute("aria-label", `Quitar conexión ${endpointTitle(wire.from)} con ${endpointTitle(wire.to)}`);
      item.append(remove);
      wireList.append(item);
    }
  }

  function renderComponentList() {
    componentList.replaceChildren();
    for (const component of model.getComponents()) {
      const button = htmlElement(
        "button",
        `circuit-component-item${component.id === selectedComponentId ? " is-selected" : ""}`,
        `${COMPONENT_LABELS[component.type]} · ${componentDescription(component)}`,
      );
      button.type = "button";
      button.dataset.selectComponent = component.id;
      componentList.append(button);
    }
  }

  function appendComponentProperties(component) {
    properties.replaceChildren();
    if (!component) {
      properties.append(htmlElement("p", "circuit-empty", "Selecciona un componente en el montaje para ver sus propiedades."));
      return;
    }
    properties.append(htmlElement("h3", "", `${COMPONENT_LABELS[component.type]} · ${component.id}`));
    properties.append(htmlElement("p", "circuit-help", "La visualización representa conexiones educativas; no calcula magnitudes eléctricas."));

    if (component.type === "led") {
      const { label, control } = makeSelect("Color", "color", Object.keys(COLOR_VALUES).map((color) => [color, color]), component.properties.color);
      control.dataset.property = "color";
      properties.append(label);
    } else if (component.type === "resistor") {
      const value = makeSelect("Valor", "ohms", resistorValues.map((ohms) => [String(ohms), `${ohms} Ω`]), component.properties.ohms);
      value.control.dataset.property = "ohms";
      const bandCount = makeSelect("Bandas", "bandCount", [["3", "3 bandas"], ["4", "4 bandas"], ["5", "5 bandas"]], component.properties.bandCount);
      bandCount.control.dataset.property = "bandCount";
      const tolerance = makeSelect("Tolerancia", "tolerance", [["1", "±1 %"], ["2", "±2 %"], ["5", "±5 %"], ["10", "±10 %"]], component.properties.tolerance);
      tolerance.control.dataset.property = "tolerance";
      tolerance.control.disabled = component.properties.bandCount === 3;
      properties.append(value.label, bandCount.label, tolerance.label);
      properties.append(htmlElement("p", "circuit-resistor-colors", `Código de colores: ${resistorBands(component.properties.ohms, component.properties.bandCount, component.properties.tolerance).join(" · ")}`));
      properties.append(htmlElement("p", "circuit-help", "La tolerancia es descriptiva; no se calcula corriente."));
    } else if (component.type === "button") {
      const pressed = htmlElement("button", "tool-button button-primary circuit-input-toggle", component.properties.pressed ? "Liberar pulsador" : "Presionar pulsador");
      pressed.type = "button";
      pressed.dataset.property = "pressed";
      pressed.setAttribute("aria-pressed", String(component.properties.pressed));
      properties.append(pressed, htmlElement("p", "circuit-help", "La entrada solo se determina con una conexión válida al pin y una referencia GND o 5V."));
    } else {
      const label = htmlElement("label", "circuit-field", "Valor analógico (0–1023)");
      const range = document.createElement("input");
      range.type = "range";
      range.name = "value";
      range.min = "0";
      range.max = "1023";
      range.step = "1";
      range.value = String(component.properties.value);
      range.dataset.property = "value";
      label.append(range);
      const output = htmlElement("output", "circuit-pot-value", `${component.properties.value}/1023`);
      properties.append(label, output, htmlElement("p", "circuit-help", "El valor alimenta analogRead() cuando el wiper y los extremos están conectados correctamente."));
    }

    const remove = htmlElement("button", "tool-button tool-button-danger", "Eliminar componente");
    remove.type = "button";
    remove.dataset.removeComponent = component.id;
    properties.append(remove);
  }

  function renderWarnings() {
    const list = model.getWarnings();
    warnings.replaceChildren();
    if (!list.length) {
      warnings.append(htmlElement("p", "circuit-success", "Sin advertencias: el montaje tiene terminales conectados."));
      return;
    }
    warnings.append(htmlElement("p", "circuit-warning-title", `${list.length} aviso(s) de conexión`));
    const items = document.createElement("ul");
    for (const warning of list) items.append(htmlElement("li", "", warning));
    warnings.append(items);
  }

  function render() {
    renderCanvas();
    renderWireControls();
    renderComponentList();
    const selected = model.getComponents().find((item) => item.id === selectedComponentId);
    if (selected && currentSimulationInputs && Object.hasOwn(currentSimulationInputs, selected.id)) {
      selected.properties = {
        ...selected.properties,
        ...(selected.type === "button" ? { pressed: Boolean(currentSimulationInputs[selected.id]) } : {}),
        ...(selected.type === "potentiometer" ? { value: Number(currentSimulationInputs[selected.id]) } : {}),
      };
    }
    appendComponentProperties(selected);
    renderWarnings();
    status.textContent = model.getComponents().length
      ? `${model.getComponents().length} componentes · ${model.getWires().length} conexiones`
      : "Añade componentes o carga el circuito de ejemplo.";
  }

  function addWire(from, to) {
    try {
      announceChange(model.addWire(from, to));
    } catch (error) {
      status.textContent = error.message;
    }
  }

  root.addEventListener("click", (event) => {
    const add = event.target.closest("[data-add-component]");
    if (add) {
      try {
        const result = model.addComponent(add.dataset.addComponent);
        selectedComponentId = result.component.id;
        announceChange(result);
      } catch (error) {
        status.textContent = error.message;
      }
      return;
    }
    if (event.target.closest("#circuit-load-demo")) {
      const result = model.loadDemo();
      selectedComponentId = "component-2";
      onLoadDemo();
      announceChange(result);
      return;
    }
    if (event.target.closest("#circuit-clear")) {
      selectedComponentId = null;
      announceChange(model.clear());
      return;
    }
    const terminal = event.target.closest("[data-terminal]");
    if (terminal) {
      if (!fromSelect.value) {
        fromSelect.value = terminal.dataset.terminal;
        status.textContent = `Terminal inicial: ${endpointTitle(fromSelect.value)}. Selecciona otro terminal para conectar.`;
      } else if (terminal.dataset.terminal === fromSelect.value) {
        fromSelect.value = "";
      } else {
        toSelect.value = terminal.dataset.terminal;
        addWire(fromSelect.value, toSelect.value);
        fromSelect.value = "";
        toSelect.value = "";
      }
      return;
    }
    const select = event.target.closest("[data-select-component], .circuit-component[data-component-id]");
    if (select) {
      selectedComponentId = select.dataset.selectComponent ?? select.dataset.componentId;
      render();
      return;
    }
    const removeComponent = event.target.closest("[data-remove-component]");
    if (removeComponent) {
      const result = model.removeComponent(removeComponent.dataset.removeComponent);
      selectedComponentId = null;
      if (result) announceChange(result);
      return;
    }
    const removeWire = event.target.closest("[data-remove-wire]");
    if (removeWire) {
      const result = model.removeWire(removeWire.dataset.removeWire);
      if (result) announceChange(result);
      return;
    }
    const toggle = event.target.closest('[data-property="pressed"]');
    if (toggle && selectedComponentId) {
      const component = model.getComponents().find((item) => item.id === selectedComponentId);
      const currentPressed = currentSimulationInputs &&
        Object.hasOwn(currentSimulationInputs, selectedComponentId)
        ? Boolean(currentSimulationInputs[selectedComponentId])
        : component.properties.pressed;
      const result = model.updateProperty(selectedComponentId, "pressed", !currentPressed);
      announceChange(result);
      return;
    }
  });

  root.addEventListener("keydown", (event) => {
    const terminal = event.target.closest("[data-terminal]");
    if (terminal && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      terminal.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
  });

  root.addEventListener("change", (event) => {
    const property = event.target.dataset.property;
    if (!property || !selectedComponentId) return;
    try {
      const value = property === "value" ? Number(event.target.value) : event.target.value;
      announceChange(model.updateProperty(selectedComponentId, property, value));
    } catch (error) {
      status.textContent = error.message;
    }
  });

  root.addEventListener("input", (event) => {
    if (event.target.dataset.property !== "value" || !selectedComponentId) return;
    const output = properties.querySelector(".circuit-pot-value");
    if (output) output.value = `${event.target.value}/1023`;
  });

  wireForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addWire(fromSelect.value, toSelect.value);
    fromSelect.value = "";
    toSelect.value = "";
  });

  render();
  return {
    render,
    getModel: () => model,
    getSvgForExport() {
      const exported = canvas.cloneNode(true);
      const sourceElements = [canvas, ...canvas.querySelectorAll("*")];
      const exportElements = [exported, ...exported.querySelectorAll("*")];
      const propertiesToCopy = [
        "fill",
        "stroke",
        "stroke-width",
        "stroke-linecap",
        "stroke-linejoin",
        "stroke-dasharray",
        "opacity",
        "font-family",
        "font-size",
        "font-weight",
        "text-anchor",
      ];
      sourceElements.forEach((element, index) => {
        const computed = getComputedStyle(element);
        const declarations = propertiesToCopy
          .map((property) => {
            let value = computed.getPropertyValue(property);
            if (property === "font-weight" && /^\d+$/.test(value)) {
              value = Number(value) >= 600 ? "700" : "400";
            }
            return [property, value];
          })
          .filter(([, value]) => value && value !== "none" && value !== "normal");
        if (declarations.length) {
          exportElements[index].setAttribute(
            "style",
            declarations.map(([property, value]) => `${property}:${value}`).join(";"),
          );
        }
      });
      exported.querySelectorAll(".is-selected").forEach((element) => element.classList.remove("is-selected"));
      for (const board of exported.querySelectorAll(".circuit-breadboard")) {
        board.style.setProperty("fill", "#f7f1df");
        board.style.setProperty("stroke", "#d7cba8");
      }
      exported.querySelectorAll(".circuit-board-label, .circuit-pin-label, .circuit-component-label")
        .forEach((label) => label.style.setProperty("fill", "#566276"));
      return exported;
    },
    updateSimulation(state) {
      currentSimulationInputs = { ...state.circuitInputs };
      const ledStates = model.getLedStates(state.pins, state.circuitInputs);
      for (const [componentId, ledState] of Object.entries(ledStates)) {
        const group = [...canvas.querySelectorAll("[data-component-id]")]
          .find((element) => element.dataset.componentId === componentId);
        if (group) {
          group.dataset.state = ledState.state;
          group.setAttribute(
            "aria-label",
            `${componentDescription(model.getComponents().find((item) => item.id === componentId))}; estado ${ledState.state}; ${ledState.pin ? `pin ${ledState.pin}` : "sin salida válida"}. Seleccionar componente.`,
          );
        }
      }
      for (const component of model.getComponents()) {
        if (component.type !== "button" && component.type !== "potentiometer") continue;
        const group = [...canvas.querySelectorAll("[data-component-id]")]
          .find((element) => element.dataset.componentId === component.id);
        const input = state.circuitInputs[component.id];
        if (group && component.type === "button" && typeof input === "boolean") {
          group.dataset.state = input ? "pressed" : "released";
          group.setAttribute(
            "aria-label",
            `Pulsador ${input ? "presionado" : "liberado"}. Seleccionar componente.`,
          );
        }
        if (component.id !== selectedComponentId) continue;
        if (component.type === "button" && typeof input === "boolean") {
          const toggle = properties.querySelector('[data-property="pressed"]');
          if (toggle) {
            toggle.setAttribute("aria-pressed", String(input));
            toggle.textContent = input ? "Liberar pulsador" : "Presionar pulsador";
          }
        } else if (component.type === "potentiometer" && Number.isInteger(input)) {
          const range = properties.querySelector('[data-property="value"]');
          const output = properties.querySelector(".circuit-pot-value");
          const knob = group?.querySelector("[data-pot-knob]");
          if (range) range.value = String(input);
          if (output) output.value = `${input}/1023`;
          if (knob) knob.setAttribute("cx", String(component.position.x - 26 + (input / 1023) * 52));
        }
      }
    },
    selectComponent(id) {
      selectedComponentId = id;
      render();
    },
  };
}
