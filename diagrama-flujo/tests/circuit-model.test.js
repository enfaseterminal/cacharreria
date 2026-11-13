import { describe, expect, it } from "vitest";
import {
  circuitStorageKey,
  createCircuitModel,
  createDemoCircuit,
  resistorBands,
} from "../src/lab/circuit-model.js";
import { getArduinoTerminals, getComponentTerminals } from "../src/lab/circuit-catalog.js";

function createMemoryStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    entries,
  };
}

describe("circuit model", () => {
  it("creates the supported component types with independent properties", () => {
    const model = createCircuitModel(createMemoryStorage());
    const led = model.addComponent("led").component;
    const resistor = model.addComponent("resistor").component;
    const button = model.addComponent("button").component;
    const potentiometer = model.addComponent("potentiometer").component;

    expect([led.type, resistor.type, button.type, potentiometer.type])
      .toEqual(["led", "resistor", "button", "potentiometer"]);
    expect(led.properties.color).toBe("rojo");
    expect(resistor.properties).toMatchObject({ ohms: 220, bandCount: 4, tolerance: 5 });
    expect(button.properties.pressed).toBe(false);
    expect(potentiometer.properties.value).toBe(512);
  });

  it.each([
    [220, ["rojo", "rojo", "marrón", "dorado"]],
    [330, ["naranja", "naranja", "marrón", "dorado"]],
    [1000, ["marrón", "negro", "rojo", "dorado"]],
  ])("converts %s ohms into standard resistor bands", (ohms, expected) => {
    expect(resistorBands(ohms)).toEqual(expected);
  });

  it("supports three- and five-band resistor representations and rejects invalid values", () => {
    expect(resistorBands(220, 3)).toEqual(["rojo", "rojo", "marrón"]);
    expect(resistorBands(10000, 5)).toEqual(["marrón", "negro", "negro", "rojo", "dorado"]);
    expect(resistorBands(1000, 4, 1)).toEqual(["marrón", "negro", "rojo", "marrón"]);
    expect(() => resistorBands(123)).toThrow(RangeError);
  });

  it("uses one terminal catalog for the model and renderer-facing anchors", () => {
    expect(getComponentTerminals("led")).toEqual([
      { id: "anode", anchor: "left" },
      { id: "cathode", anchor: "right" },
    ]);
    expect(getComponentTerminals("potentiometer").map(({ id }) => id))
      .toEqual(["end1", "wiper", "end2"]);
    expect(getComponentTerminals("future-component")).toEqual([]);
    expect(getArduinoTerminals().map(({ id }) => id)).toEqual([
      ...Array.from({ length: 12 }, (_unused, index) => `D${index + 2}`),
      ...Array.from({ length: 6 }, (_unused, index) => `A${index}`),
      "5V",
      "GND",
    ]);
  });

  it("allows component colors, resistor tolerance, and potentiometer values to be updated", () => {
    const model = createCircuitModel(createMemoryStorage());
    const resistor = model.addComponent("resistor").component;
    const pot = model.addComponent("potentiometer").component;
    model.updateProperty(resistor.id, "tolerance", 2);
    model.updateProperty(pot.id, "value", 1023);

    expect(model.getComponents().find((item) => item.id === resistor.id).properties.tolerance).toBe(2);
    expect(model.getInitialInputs()[pot.id]).toBe(1023);
    expect(() => model.updateProperty(pot.id, "value", 1024)).toThrow(RangeError);
  });

  it("connects terminals, lists wires, removes connections, and cascades component removal", () => {
    const model = createCircuitModel(createMemoryStorage());
    const led = model.addComponent("led").component;
    const wire = model.addWire("arduino:D13", `${led.id}:anode`).wire;
    model.addWire(`${led.id}:cathode`, "arduino:GND");

    expect(model.getWires()).toHaveLength(2);
    expect(model.getWarnings()).toContain(`${led.id}: conecta el ánodo a una salida a través de una resistencia y el cátodo a GND.`);
    model.removeWire(wire.id);
    expect(model.getWires()).toHaveLength(1);
    model.removeComponent(led.id);
    expect(model.getComponents()).toEqual([]);
    expect(model.getWires()).toEqual([]);
  });

  it("shows a connected LED only for an OUTPUT pin, series resistor and known digital level", () => {
    const model = createCircuitModel(createMemoryStorage());
    model.loadDemo();
    expect(model.getWarnings()).toEqual([]);
    expect(model.getLedStates({ 13: { mode: "OUTPUT", value: 1 } })["component-2"])
      .toMatchObject({ connected: true, state: "on", pin: "13" });
    expect(model.getLedStates({ 13: { mode: "OUTPUT", value: 0 } })["component-2"].state).toBe("off");
    expect(model.getLedStates({ 13: { mode: "INPUT", value: 1 } })["component-2"].state).toBe("unknown");
    expect(model.getLedStates({ 13: { mode: "OUTPUT", value: null } })["component-2"].state).toBe("unknown");
  });

  it("resolves INPUT_PULLUP button states only when the pin and GND are wired", () => {
    const model = createCircuitModel(createMemoryStorage());
    const button = model.addComponent("button").component;
    model.addWire("arduino:D2", `${button.id}:contact1`);
    model.addWire(`${button.id}:contact2`, "arduino:GND");
    const pins = { 2: { mode: "INPUT_PULLUP" } };
    const inputs = model.getInitialInputs();

    expect(model.readInput("digitalRead", 2, pins, inputs)).toEqual({ known: true, value: 1 });
    model.updateProperty(button.id, "pressed", true);
    expect(model.readInput("digitalRead", 2, pins, model.getInitialInputs())).toEqual({ known: true, value: 0 });
    expect(model.readInput("digitalRead", 2, { 2: { mode: "INPUT" } }, inputs).known).toBe(false);
  });

  it("resolves analogRead from a potentiometer connected to the pin and both rails", () => {
    const model = createCircuitModel(createMemoryStorage());
    const pot = model.addComponent("potentiometer").component;
    model.addWire("arduino:5V", `${pot.id}:end1`);
    model.addWire(`${pot.id}:wiper`, "arduino:A0");
    model.addWire(`${pot.id}:end2`, "arduino:GND");
    model.updateProperty(pot.id, "value", 734);

    expect(model.readInput("analogRead", "A0", {}, model.getInitialInputs()))
      .toEqual({ known: true, value: 734 });
    expect(model.readInput("analogRead", "A1", {}, model.getInitialInputs()).known).toBe(false);
  });

  it("persists and restores the versioned circuit without overwriting existing code keys", () => {
    const storage = createMemoryStorage({ "arduino-flowchart-code": "int original = 7;" });
    const first = createCircuitModel(storage);
    const button = first.addComponent("button").component;
    first.addWire("arduino:D2", `${button.id}:contact1`);
    const restored = createCircuitModel(storage);

    const saved = JSON.parse(storage.getItem(circuitStorageKey));
    expect(saved.version).toBe(2);
    expect(saved.components.every((component) => !Object.hasOwn(component, "position"))).toBe(true);
    expect(saved.visual.positions[button.id]).toEqual(first.getComponentPosition(button.id));
    expect(restored.getComponents()).toEqual(first.getComponents());
    expect(restored.getWires()).toEqual(first.getWires());
    expect(storage.getItem("arduino-flowchart-code")).toBe("int original = 7;");
  });

  it("migrates v1 positions into visual state and preserves unknown records through save and reload", () => {
    const legacy = {
      version: 1,
      components: [
        {
          id: "legacy-led",
          type: "led",
          position: { x: 520, y: 205 },
          properties: { color: "azul" },
        },
        {
          id: "future-1",
          type: "future-sensor",
          position: { x: 640, y: 310 },
          properties: { calibration: { zero: 7 } },
          vendorData: { revision: 3 },
        },
      ],
      wires: [
        { id: "legacy-wire", from: "arduino:D13", to: "legacy-led:anode", gauge: "thin" },
        { id: "future-wire", from: "future-1:signal", to: "arduino:A0" },
      ],
    };
    const storage = createMemoryStorage({ [circuitStorageKey]: JSON.stringify(legacy) });
    const model = createCircuitModel(storage);
    const migrated = model.getState();

    expect(JSON.parse(storage.getItem(circuitStorageKey)).version).toBe(2);
    expect(migrated.version).toBe(2);
    expect(migrated.components).toEqual([
      { id: "legacy-led", type: "led", properties: { color: "azul" } },
      {
        id: "future-1",
        type: "future-sensor",
        properties: { calibration: { zero: 7 } },
        vendorData: { revision: 3 },
      },
    ]);
    expect(migrated.visual.positions).toEqual({
      "legacy-led": { x: 520, y: 205 },
      "future-1": { x: 640, y: 310 },
    });
    expect(migrated.wires).toEqual(legacy.wires);
    expect(model.getComponents().find((item) => item.id === "legacy-led"))
      .toMatchObject({ type: "led", properties: { color: "azul" }, position: { x: 520, y: 205 } });
    expect(model.getWarnings().join(" ")).toContain("future-wire");

    model.setComponentPosition("legacy-led", { x: 540, y: 220 });
    const saved = JSON.parse(storage.getItem(circuitStorageKey));
    const restored = createCircuitModel(storage);
    expect(saved.components.every((component) => !Object.hasOwn(component, "position"))).toBe(true);
    expect(restored.getState()).toEqual(model.getState());
    expect(restored.getWires()).toEqual(legacy.wires);
    expect(restored.getComponents().find((item) => item.id === "future-1").vendorData)
      .toEqual({ revision: 3 });
  });

  it("assigns valid initial positions when legacy layout data is missing", () => {
    const legacy = {
      version: 1,
      components: [
        { id: "component-8", type: "led", properties: { color: "rojo" } },
        { id: "component-9", type: "button", position: { x: -1, y: 20 }, properties: { pressed: false } },
      ],
      wires: [],
    };
    const model = createCircuitModel(createMemoryStorage({
      [circuitStorageKey]: JSON.stringify(legacy),
    }));

    expect(model.getComponentPosition("component-8")).toEqual({ x: 405, y: 120 });
    expect(model.getComponentPosition("component-9")).toEqual({ x: 517, y: 120 });
    expect(model.getComponents().every(({ position }) =>
      position.x >= 300 && position.x <= 760 && position.y >= 85 && position.y <= 430,
    )).toBe(true);
  });

  it("keeps coordinates independent from terminals, wires, and electrical results", () => {
    const model = createCircuitModel(createMemoryStorage());
    model.loadDemo();
    const beforeWires = model.getWires();
    const beforeLed = model.getLedStates({ 13: { mode: "OUTPUT", value: 1 } });
    const beforeEndpoints = model.getEndpoints();
    const result = model.setComponentPosition("component-2", { x: 680, y: 330 });

    expect(result.changeType).toBe("visual");
    expect(model.getComponentPosition("component-2")).toEqual({ x: 680, y: 330 });
    expect(model.getWires()).toEqual(beforeWires);
    expect(model.getEndpoints()).toEqual(beforeEndpoints);
    expect(model.getLedStates({ 13: { mode: "OUTPUT", value: 1 } })).toEqual(beforeLed);
    expect(model.readInput("digitalRead", 2, {}, model.getInitialInputs()).known).toBe(false);
  });

  it("returns independent snapshots and compatibility projections", () => {
    const model = createCircuitModel(createMemoryStorage());
    model.loadDemo();
    const state = model.getState();
    const visual = model.getVisualState();
    const components = model.getComponents();
    const wires = model.getWires();

    state.visual.positions["component-2"].x = 700;
    visual.positions["component-2"].y = 400;
    components[0].position.x = 700;
    components[0].properties.ohms = 10000;
    wires[0].from = "arduino:A0";

    expect(model.getComponentPosition("component-2")).toEqual({ x: 517, y: 120 });
    expect(model.getComponents()[0].position.x).toBe(405);
    expect(model.getComponents()[0].properties.ohms).toBe(220);
    expect(model.getWires()[0].from).toBe("arduino:D13");
  });

  it("warns about incompatible stored data and leaves it untouched until a user saves changes", () => {
    const invalid = JSON.stringify({ version: 99, components: [], wires: [] });
    const storage = createMemoryStorage({ [circuitStorageKey]: invalid });
    const errors = [];
    const model = createCircuitModel(storage, (error) => errors.push(error.message));

    expect(model.getComponents()).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(storage.getItem(circuitStorageKey)).toBe(invalid);
    model.addComponent("led");
    expect(JSON.parse(storage.getItem(circuitStorageKey)).version).toBe(2);
  });

  it("loads the documented demonstration circuit with its three valid connections", () => {
    const demo = createDemoCircuit();
    expect(demo.components.map((component) => component.type)).toEqual(["resistor", "led"]);
    expect(demo.wires).toEqual([
      { id: "wire-3", from: "arduino:D13", to: "component-1:lead1" },
      { id: "wire-4", from: "component-1:lead2", to: "component-2:anode" },
      { id: "wire-5", from: "component-2:cathode", to: "arduino:GND" },
    ]);
  });
});
