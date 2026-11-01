// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { analyzeSource } from "../src/analyzer/analyzer.js";
import { generateFlowcharts } from "../src/flowchart/flow-generator.js";
import { layoutDiagram } from "../src/flowchart/flow-layout.js";
import { SimulationController } from "../src/simulator/simulation-controller.js";
import { SimulationEngine } from "../src/simulator/simulation-engine.js";
import { createSimulatorPanel } from "../src/ui/simulator-panel.js";

function createPanel() {
  const panel = document.createElement("section");
  panel.innerHTML = `
    <button id="simulation-start"></button>
    <button id="simulation-next"></button>
    <button id="simulation-previous"></button>
    <button id="simulation-run"></button>
    <button id="simulation-pause"></button>
    <button id="simulation-restart"></button>
    <button id="simulation-clear-console"></button>
    <button id="simulation-toggle-io" aria-expanded="true"></button>
    <button id="simulation-console-tab" role="tab"></button>
    <button id="simulation-pins-tab" role="tab"></button>
    <div id="simulation-io-content"></div>
    <section id="simulation-console-view" role="tabpanel"></section>
    <section id="simulation-pins-view" role="tabpanel" hidden></section>
    <select id="simulation-speed"><option value="500" selected>Normal</option></select>
    <input id="simulation-max-steps" value="500">
    <p id="simulation-status"></p>
    <span id="simulation-step"></span>
    <div id="simulation-current"></div>
    <div id="simulation-variables"></div>
    <p id="simulation-condition"></p>
    <p id="simulation-iterations"></p>
    <pre id="simulation-console-output"></pre>
    <p id="simulation-console-empty"></p>
    <ol id="simulation-event-log"></ol>
    <span id="simulation-serial-speed"></span>
    <div id="simulation-pin-list"></div>
    <p id="simulation-pins-empty"></p>
    <form id="simulation-input-form">
      <label id="simulation-input-label"></label>
      <input id="simulation-input-value">
    </form>
    <p id="simulation-error"></p>
  `;
  panel.dataset.available = "true";
  document.body.append(panel);
  return panel;
}

function createSimulator(source) {
  const analysis = analyzeSource(source);
  const result = generateFlowcharts(analysis.ast, source);
  result.diagrams.forEach(layoutDiagram);
  const diagram = result.diagrams.find((item) => item.functionName === "setup");
  const engine = new SimulationEngine({ ast: analysis.ast, source, diagram });
  const controller = new SimulationController(engine);
  const panel = createPanel();
  const ui = createSimulatorPanel(panel, controller);
  controller.onStateChange = (state) => ui.render(state);
  return { panel, engine, controller, ui };
}

describe("simulation console and pin monitor", () => {
  it("renders engine console, chronological events, and pin state and restores them on rewind", () => {
    const { panel, controller, engine } = createSimulator(`void setup() {
  Serial.begin(9600);
  Serial.println("ready");
  pinMode(13, OUTPUT);
  digitalWrite(13, HIGH);
}`);

    panel.querySelector("#simulation-start").click();
    panel.querySelector("#simulation-next").click();
    expect(panel.querySelector("#simulation-serial-speed").textContent).toBe("Serial: 9600 baudios");
    panel.querySelector("#simulation-next").click();
    panel.querySelector("#simulation-next").click();
    panel.querySelector("#simulation-next").click();
    expect(panel.querySelector("#simulation-console-output").textContent).toBe("ready\n");
    expect(panel.querySelector("#simulation-event-log").textContent).toContain("[SIMULACIÓN INICIADA]");
    expect(panel.querySelector("#simulation-event-log").textContent).toContain("línea 5");

    panel.querySelector("#simulation-pins-tab").click();
    expect(panel.querySelector("#simulation-pins-view").hidden).toBe(false);
    expect(panel.querySelector("#simulation-pin-list").textContent).toContain("Pin 13");
    expect(panel.querySelector("#simulation-pin-list").textContent).toContain("HIGH");

    controller.previous();
    expect(engine.state.pins["13"].value).toBeNull();
    expect(panel.querySelector("#simulation-pin-list").textContent).toContain("Desconocido");
    controller.next();
    expect(panel.querySelector("#simulation-pin-list").textContent).toContain("HIGH");
    expect(new Set(engine.state.events.map((event) => event.id)).size).toBe(engine.state.events.length);
  });

  it("provides an accessible collapsible panel, clear action, and empty states", () => {
    const { panel } = createSimulator("void setup() { Serial.print(\"hello\"); }");
    panel.querySelector("#simulation-start").click();
    expect(panel.querySelector("#simulation-console-empty").hidden).toBe(false);
    expect(panel.querySelector("#simulation-event-log").textContent).toContain("[SIMULACIÓN INICIADA]");
    expect(panel.querySelector("#simulation-pins-empty").hidden).toBe(false);

    const toggle = panel.querySelector("#simulation-toggle-io");
    toggle.click();
    expect(panel.querySelector("#simulation-io-content").hidden).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    toggle.click();
    expect(panel.querySelector("#simulation-io-content").hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    panel.querySelector("#simulation-next").click();
    expect(panel.querySelector("#simulation-console-output").textContent).toBe("hello");
    panel.querySelector("#simulation-clear-console").click();
    expect(panel.querySelector("#simulation-console-output").textContent).toBe("");
    expect(panel.querySelector("#simulation-event-log").textContent).toContain("Los eventos aparecerán");
  });

  it("supports keyboard navigation between the console and pin tabs", () => {
    const { panel } = createSimulator("void setup() {}");
    const consoleTab = panel.querySelector("#simulation-console-tab");
    const pinsTab = panel.querySelector("#simulation-pins-tab");

    consoleTab.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(pinsTab.getAttribute("aria-selected")).toBe("true");
    expect(panel.querySelector("#simulation-pins-view").hidden).toBe(false);
    pinsTab.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(consoleTab.getAttribute("aria-selected")).toBe("true");
    expect(panel.querySelector("#simulation-console-view").hidden).toBe(false);
  });
});
