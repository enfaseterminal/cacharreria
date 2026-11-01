// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createCircuitModel } from "../src/lab/circuit-model.js";
import { createCircuitLab } from "../src/lab/circuit-lab.js";

function createMemoryStorage() {
  const entries = new Map();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  };
}

function createRoot() {
  const root = document.createElement("section");
  root.innerHTML = `
    <svg id="circuit-canvas" viewBox="0 0 800 490"></svg>
    <div id="circuit-component-list"></div>
    <ul id="circuit-wire-list"></ul>
    <section id="circuit-properties"></section>
    <div id="circuit-warnings"></div>
    <p id="circuit-status"></p>
    <select id="circuit-wire-from"></select>
    <select id="circuit-wire-to"></select>
    <form id="circuit-wire-form"></form>
    <button id="circuit-load-demo" type="button"></button>
    <button id="circuit-clear" type="button"></button>
    <button type="button" data-add-component="led"></button>
    <button type="button" data-add-component="button"></button>
  `;
  document.body.append(root);
  return root;
}

describe("circuit lab interface", () => {
  it("renders a demonstrator, lets users select components, and edits component properties", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    const changes = [];
    let demoLoaded = false;
    createCircuitLab(root, model, {
      onChange: (change) => changes.push(change.changeType),
      onLoadDemo: () => { demoLoaded = true; },
    });

    root.querySelector("#circuit-load-demo").click();
    expect(demoLoaded).toBe(true);
    expect(model.getComponents().map((component) => component.type)).toEqual(["resistor", "led"]);
    expect(root.querySelectorAll(".circuit-wire").length).toBe(3);
    expect(root.querySelector("#circuit-warnings").textContent).toContain("Sin advertencias");

    root.querySelector('[data-select-component="component-2"]').click();
    const color = root.querySelector('[data-property="color"]');
    color.value = "azul";
    color.dispatchEvent(new Event("change", { bubbles: true }));
    expect(model.getComponents().find((component) => component.id === "component-2").properties.color).toBe("azul");
    expect(changes).toContain("topology");
  });

  it("supports adding a button, changing its virtual input, and drawing terminal connections", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    const changes = [];
    createCircuitLab(root, model, { onChange: (change) => changes.push(change) });

    root.querySelector('[data-add-component="button"]').click();
    const button = model.getComponents()[0];
    root.querySelector('[data-property="pressed"]').click();
    expect(model.getInitialInputs()[button.id]).toBe(true);
    expect(changes.at(-1).changeType).toBe("input");

    const from = root.querySelector("#circuit-wire-from");
    const to = root.querySelector("#circuit-wire-to");
    from.value = "arduino:D2";
    to.value = `${button.id}:contact1`;
    root.querySelector("#circuit-wire-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(model.getWires()).toHaveLength(1);
    expect(root.querySelector("#circuit-wire-list").textContent).toContain("Arduino D2");
  });

  it("renders simulation outputs without mutating the circuit model", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    const lab = createCircuitLab(root, model);
    root.querySelector('[data-add-component="button"]').click();
    const button = model.getComponents()[0];
    root.querySelector('[data-property="pressed"]').click();
    lab.updateSimulation({ pins: {}, circuitInputs: { [button.id]: false } });

    expect(root.querySelector('[data-component-id="component-1"]').dataset.state).toBe("released");
    expect(root.querySelector('[data-component-id="component-1"]').getAttribute("aria-label")).toContain("Pulsador liberado");
    expect(root.querySelector('[data-property="pressed"]').getAttribute("aria-pressed")).toBe("false");
    expect(root.querySelector('[data-property="pressed"]').textContent).toBe("Presionar pulsador");
    expect(model.getComponents()[0].properties.pressed).toBe(true);
  });

  it("announces the LED state derived from simulator pin snapshots", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    const lab = createCircuitLab(root, model);
    model.loadDemo();
    lab.render();

    lab.updateSimulation({
      pins: { 13: { mode: "OUTPUT", value: 1 } },
      circuitInputs: {},
    });

    const led = root.querySelector('[data-component-id="component-2"]');
    expect(led.dataset.state).toBe("on");
    expect(led.getAttribute("aria-label")).toContain("estado on");
    expect(led.getAttribute("aria-label")).toContain("pin 13");
  });

  it("exports a styled clone of the actual laboratory SVG without changing the displayed mount", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    model.loadDemo();
    const lab = createCircuitLab(root, model);
    const visibleCanvas = root.querySelector("#circuit-canvas");
    visibleCanvas.querySelector(".circuit-uno").style.fill = "#237bba";
    const exported = lab.getSvgForExport();

    expect(exported).not.toBe(visibleCanvas);
    expect(exported.getAttribute("viewBox")).toBe("0 0 800 490");
    expect(exported.querySelectorAll(".circuit-wire")).toHaveLength(3);
    expect(exported.querySelectorAll(".circuit-component")).toHaveLength(2);
    expect(exported.querySelector(".circuit-component-label").textContent).toContain("220 Ω");
    expect(exported.querySelector(".circuit-breadboard").style.fill).toBe("#f7f1df");
    expect(exported.querySelector(".circuit-component-label").style.fill).toBe("#566276");
    expect(visibleCanvas.querySelectorAll(".circuit-wire")).toHaveLength(3);
    expect(exported.querySelector(".circuit-uno").getAttribute("style")).toContain("fill:#237bba");
  });
});
