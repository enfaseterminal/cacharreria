// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { circuitStorageKey, createCircuitModel } from "../src/lab/circuit-model.js";
import { createCircuitLab } from "../src/lab/circuit-lab.js";
import { getComponentTerminals } from "../src/lab/circuit-catalog.js";

function createMemoryStorage() {
  const entries = new Map();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    entries,
  };
}

function dispatchPointer(target, type, { pointerId = 1, x = 0, y = 0 } = {}) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    isPrimary: { value: true },
  });
  target.dispatchEvent(event);
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

  it("drags each component type, saves positions, and restores them without changing properties", () => {
    const root = createRoot();
    const storage = createMemoryStorage();
    const model = createCircuitModel(storage);
    const componentTypes = ["led", "resistor", "button", "potentiometer"];
    const originalComponents = componentTypes.map((type) => model.addComponent(type).component);
    const changes = [];
    const lab = createCircuitLab(root, model, {
      onChange: (change) => changes.push(change),
    });

    expect([...root.querySelectorAll("[data-terminal]")]
      .filter((terminal) => terminal.dataset.terminal.startsWith("component-1:"))
      .map((terminal) => terminal.dataset.terminal))
      .toEqual(getComponentTerminals("led").map(({ id }) => `component-1:${id}`));

    for (const [index, component] of originalComponents.entries()) {
      const element = root.querySelector(`[data-component-id="${component.id}"]`);
      dispatchPointer(element, "pointerdown", { x: 100, y: 100 });
      dispatchPointer(root.querySelector("#circuit-canvas"), "pointermove", {
        x: 135,
        y: 125,
      });
      dispatchPointer(root.querySelector("#circuit-canvas"), "pointerup", {
        x: 135,
        y: 125,
      });
      expect(model.getComponentPosition(component.id)).toEqual({
        x: component.position.x + 35,
        y: component.position.y + 25,
      });
      expect(changes.at(-1).changeType).toBe("visual");
      expect(model.getComponents()[index]).toMatchObject({
        id: component.id,
        type: component.type,
        properties: component.properties,
      });
    }

    const saved = JSON.parse(storage.entries.get(circuitStorageKey));
    expect(saved.version).toBe(2);
    expect(saved.components.every((component) => !Object.hasOwn(component, "position"))).toBe(true);
    const restored = createCircuitModel(storage);
    for (const component of originalComponents) {
      expect(restored.getComponentPosition(component.id)).toEqual({
        x: component.position.x + 35,
        y: component.position.y + 25,
      });
    }
    lab.render();
  });

  it("previews cable movement while dragging and exports the committed visual position", () => {
    const root = createRoot();
    const storage = createMemoryStorage();
    const model = createCircuitModel(storage);
    model.loadDemo();
    const changes = [];
    const lab = createCircuitLab(root, model, {
      onChange: (change) => changes.push(change),
    });
    const originalWires = model.getWires();
    const originalPath = root.querySelector(".circuit-wire").getAttribute("d");
    const originalStoredState = storage.entries.get(circuitStorageKey);
    const component = root.querySelector('[data-component-id="component-1"]');

    dispatchPointer(component, "pointerdown", { x: 100, y: 200 });
    dispatchPointer(root.querySelector("#circuit-canvas"), "pointermove", { x: 120, y: 230 });

    const previewPath = root.querySelector(".circuit-wire").getAttribute("d");
    expect(previewPath).not.toBe(originalPath);
    expect(previewPath).toContain("391 150");
    expect(model.getComponentPosition("component-1")).toEqual({ x: 405, y: 120 });
    expect(storage.entries.get(circuitStorageKey)).toBe(originalStoredState);

    dispatchPointer(root.querySelector("#circuit-canvas"), "pointerup", { x: 120, y: 230 });
    expect(model.getComponentPosition("component-1")).toEqual({ x: 425, y: 150 });
    expect(model.getWires()).toEqual(originalWires);
    expect(changes.at(-1).changeType).toBe("visual");
    expect(root.querySelector(".circuit-wire").getAttribute("d")).not.toBe(originalPath);

    const changeCount = changes.length;
    root.querySelector('[data-component-id="component-1"]').dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 1 }),
    );
    expect(changes).toHaveLength(changeCount);

    const exported = lab.getSvgForExport();
    expect(exported.querySelector(".circuit-wire").getAttribute("d"))
      .toBe(root.querySelector(".circuit-wire").getAttribute("d"));
    expect(exported.querySelector('[data-component-id="component-1"] .circuit-resistor-body')
      .getAttribute("x")).toBe("401");
  });

  it("clamps dragged components to the valid work-area bounds", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    model.loadDemo();
    createCircuitLab(root, model);
    const canvas = root.querySelector("#circuit-canvas");

    dispatchPointer(root.querySelector('[data-component-id="component-1"]'), "pointerdown");
    dispatchPointer(canvas, "pointermove", { x: 1000, y: 1000 });
    dispatchPointer(canvas, "pointerup", { x: 1000, y: 1000 });
    expect(model.getComponentPosition("component-1")).toEqual({ x: 760, y: 430 });

    dispatchPointer(root.querySelector('[data-component-id="component-1"]'), "pointerdown", {
      pointerId: 2,
      x: 1000,
      y: 1000,
    });
    dispatchPointer(canvas, "pointermove", { pointerId: 2, x: 0, y: 0 });
    dispatchPointer(canvas, "pointerup", { pointerId: 2, x: 0, y: 0 });
    expect(model.getComponentPosition("component-1")).toEqual({ x: 300, y: 85 });
  });

  it("leaves terminal clicks and component selection intact when no drag occurs", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    const changes = [];
    const lab = createCircuitLab(root, model, { onChange: (change) => changes.push(change) });
    const component = model.addComponent("led").component;
    lab.render();
    const terminal = root.querySelector(`[data-terminal="${component.id}:anode"]`);
    const initialPosition = model.getComponentPosition(component.id);

    dispatchPointer(terminal, "pointerdown", { x: 10, y: 10 });
    dispatchPointer(root.querySelector("#circuit-canvas"), "pointermove", { x: 90, y: 90 });
    dispatchPointer(root.querySelector("#circuit-canvas"), "pointerup", { x: 90, y: 90 });
    terminal.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(model.getComponentPosition(component.id)).toEqual(initialPosition);
    expect(root.querySelector("#circuit-wire-from").value).toBe(`${component.id}:anode`);
    expect(changes).toHaveLength(0);

    const componentElement = root.querySelector(`[data-component-id="${component.id}"]`);
    dispatchPointer(componentElement, "pointerdown", { x: 100, y: 100 });
    dispatchPointer(root.querySelector("#circuit-canvas"), "pointerup", { x: 100, y: 100 });
    componentElement.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(root.querySelector(`[data-component-id="${component.id}"]`).classList.contains("is-selected")).toBe(true);
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
