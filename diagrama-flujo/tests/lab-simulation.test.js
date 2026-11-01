import { describe, expect, it } from "vitest";
import { analyzeSource } from "../src/analyzer/analyzer.js";
import { generateFlowcharts } from "../src/flowchart/flow-generator.js";
import { layoutDiagram } from "../src/flowchart/flow-layout.js";
import { createCircuitModel } from "../src/lab/circuit-model.js";
import { SimulationEngine } from "../src/simulator/simulation-engine.js";

function createEngine(source, circuit, functionName = "setup") {
  const analysis = analyzeSource(source);
  const generated = generateFlowcharts(analysis.ast, source);
  generated.diagrams.forEach(layoutDiagram);
  const diagram = generated.diagrams.find((item) => item.functionName === functionName);
  return new SimulationEngine({ ast: analysis.ast, source, diagram, circuit });
}

function createStorage() {
  const items = new Map();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
  };
}

describe("circuit lab simulation integration", () => {
  it("updates a correctly wired LED from executed digitalWrite instructions and snapshots", () => {
    const circuit = createCircuitModel(createStorage());
    circuit.loadDemo();
    const source = `void loop() {
  pinMode(13, OUTPUT);
  digitalWrite(13, HIGH);
  digitalWrite(13, LOW);
}`;
    const engine = createEngine(source, circuit, "loop");
    engine.start();

    engine.stepForward();
    expect(circuit.getLedStates(engine.state.pins)["component-2"].state).toBe("unknown");
    engine.stepForward();
    expect(circuit.getLedStates(engine.state.pins)["component-2"].state).toBe("on");
    engine.stepForward();
    expect(circuit.getLedStates(engine.state.pins)["component-2"].state).toBe("off");
    engine.stepBackward();
    expect(circuit.getLedStates(engine.state.pins)["component-2"].state).toBe("on");
    engine.restart();
    expect(circuit.getLedStates(engine.state.pins)["component-2"].state).toBe("unknown");
    expect(circuit.getWires()).toHaveLength(3);
  });

  it("uses a connected pull-up button for digitalRead and snapshots its input state", () => {
    const circuit = createCircuitModel(createStorage());
    const button = circuit.addComponent("button").component;
    circuit.addWire("arduino:D2", `${button.id}:contact1`);
    circuit.addWire(`${button.id}:contact2`, "arduino:GND");
    const engine = createEngine(
      "void setup() { pinMode(2, INPUT_PULLUP); int pressed = digitalRead(2); }",
      circuit,
    );
    engine.start();
    engine.stepForward();
    engine.setCircuitInput(button.id, true);
    engine.stepForward();
    engine.stepForward();

    expect(engine.state.status).toBe("completed");
    expect(engine.findVariable("pressed").scope.variables.pressed.value).toBe(0);
    expect(engine.state.events.some((event) => event.message === "[PIN 2] Lectura simulada: LOW")).toBe(true);

    engine.stepBackward();
    expect(engine.state.circuitInputs[button.id]).toBe(true);
    engine.stepBackward();
    expect(engine.state.circuitInputs[button.id]).toBe(true);
    engine.stepBackward();
    expect(engine.state.circuitInputs[button.id]).toBe(false);
  });

  it("uses a connected potentiometer value for analogRead", () => {
    const circuit = createCircuitModel(createStorage());
    const potentiometer = circuit.addComponent("potentiometer").component;
    circuit.addWire("arduino:5V", `${potentiometer.id}:end1`);
    circuit.addWire(`${potentiometer.id}:wiper`, "arduino:A0");
    circuit.addWire(`${potentiometer.id}:end2`, "arduino:GND");
    circuit.updateProperty(potentiometer.id, "value", 734);

    const engine = createEngine("void setup() { int sensor = analogRead(A0); }", circuit);
    engine.start();
    engine.stepForward();
    engine.stepForward();

    expect(engine.state.status).toBe("completed");
    expect(engine.findVariable("sensor").scope.variables.sensor.value).toBe(734);
    expect(engine.state.events.some((event) => event.message.includes("734"))).toBe(true);
  });

  it("keeps disconnected sensor values unknown and falls back to explicit manual input", () => {
    const circuit = createCircuitModel(createStorage());
    circuit.addComponent("potentiometer");
    const engine = createEngine("void setup() { int sensor = analogRead(A0); }", circuit);
    engine.start();
    engine.stepForward();

    expect(engine.state.status).toBe("waiting-input");
    expect(engine.state.waitingInput.callName).toBe("analogRead");
    engine.provideInput("512");
    engine.stepForward();
    expect(engine.findVariable("sensor").scope.variables.sensor.value).toBe(512);
  });
});
