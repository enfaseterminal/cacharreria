// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeSource } from "../src/analyzer/analyzer.js";
import { generateFlowcharts } from "../src/flowchart/flow-generator.js";
import { layoutDiagram } from "../src/flowchart/flow-layout.js";
import { renderFlowchart, highlightSimulationFlow } from "../src/flowchart/svg-renderer.js";
import { createExportSvg } from "../src/export/export-manager.js";
import { SimulationEngine } from "../src/simulator/simulation-engine.js";
import { SimulationController } from "../src/simulator/simulation-controller.js";

function createEngine(source, functionName = "setup", options = {}) {
  const analysis = analyzeSource(source);
  const generated = generateFlowcharts(analysis.ast, source);
  generated.diagrams.forEach(layoutDiagram);
  const diagram = generated.diagrams.find((item) => item.functionName === functionName);
  const engine = new SimulationEngine({
    ast: analysis.ast,
    source,
    diagram,
  });
  if (options.maxSteps) engine.setMaxSteps(options.maxSteps);
  return { analysis, diagram, engine };
}

function runToStop(engine, maxAdvances = 300) {
  for (let index = 0; index < maxAdvances; index += 1) {
    if (!["paused", "running"].includes(engine.state.status)) break;
    engine.stepForward();
  }
  return engine.state;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("simulator", () => {
  it("evaluates assignments, follows if/else, and supports backward and restart", () => {
    const source = `void setup() {
  int count = 1;
  count = count + 2;
  if (count == 3) {
    digitalWrite(13, HIGH);
  } else {
    digitalWrite(13, LOW);
  }
}`;
    const { engine } = createEngine(source);
    engine.start();
    expect(engine.stepForward().step).toBe(1);
    expect(engine.stepForward().step).toBe(2);
    expect(engine.findVariable("count").scope.variables.count.value).toBe(3);
    engine.stepForward();
    expect(engine.state.conditionResult).toBe("verdadera");
    const beforeBack = engine.state.step;
    engine.stepBackward();
    expect(engine.state.step).toBe(beforeBack - 1);
    engine.restart();
    expect(engine.state.step).toBe(0);
    expect(engine.state.status).toBe("paused");
  });

  it("initializes global values before stepping setup()", () => {
    const source = "int led = 13;\nvoid setup() { digitalWrite(led, HIGH); }";
    const { engine } = createEngine(source);
    engine.start();
    expect(engine.findVariable("led").scope.variables.led.value).toBe(13);
    runToStop(engine);
    expect(engine.state.events.join("\n")).toContain("pin 13");
  });

  it("walks for, while, and do-while loops with an iteration and step limit", () => {
    const source = `void setup() {
  int count = 0;
  for (int i = 0; i < 2; i++) { count++; }
  while (count < 3) { count++; }
  do { count--; } while (count > 2);
}`;
    const { engine } = createEngine(source, "setup", { maxSteps: 80 });
    engine.start();
    const state = runToStop(engine);
    expect(state.status).toBe("completed");
    expect(engine.findVariable("count").scope.variables.count.value).toBe(2);
    expect(Object.values(state.loopIterations)).toContain(2);
    expect(state.step).toBeGreaterThan(10);

    const limited = createEngine("void setup() { while (true) { } }", "setup", { maxSteps: 4 }).engine;
    limited.start();
    expect(runToStop(limited).status).toBe("limit");
    limited.setMaxSteps(6);
    expect(limited.state.status).toBe("paused");
    expect(runToStop(limited).status).toBe("limit");
  });

  it("applies break, continue, and switch case selection without running skipped branches", () => {
    const source = `void setup() {
  int total = 0;
  for (int i = 0; i < 5; i++) {
    if (i == 2) continue;
    if (i == 4) break;
    total++;
  }
  switch (total) {
    case 3: digitalWrite(13, HIGH); break;
    default: digitalWrite(13, LOW);
  }
}`;
    const { engine } = createEngine(source);
    engine.start();
    expect(runToStop(engine).status).toBe("completed");
    expect(engine.findVariable("total").scope.variables.total.value).toBe(3);
    expect(engine.state.events.join("\n")).toContain("HIGH");
    expect(engine.state.events.join("\n")).not.toContain("LOW");
  });

  it("repeats loop() and stops at the configured step limit", () => {
    const { engine } = createEngine("void loop() { digitalWrite(13, HIGH); }", "loop", { maxSteps: 8 });
    engine.start();
    const state = runToStop(engine);
    expect(state.status).toBe("limit");
    expect(state.loopIterations["arduino-loop"]).toBeGreaterThan(0);
    expect(state.events.filter((event) => event.includes("digitalWrite")).length).toBeGreaterThan(1);
  });

  it("simulates Arduino I/O as events and asks for sensor values instead of guessing", () => {
    const source = `void setup() {
  int sensor = analogRead(A0);
  if (sensor > 500) digitalWrite(13, HIGH);
  delay(1000);
  Serial.println("Hola");
}`;
    const { engine } = createEngine(source);
    engine.start();
    engine.stepForward();
    expect(engine.state.status).toBe("waiting-input");
    expect(engine.state.waitingInput).toMatchObject({ callName: "analogRead", pin: "A0" });
    expect(engine.state.currentInstruction).toContain("analogRead(A0)");
    engine.provideInput("700");
    engine.stepForward();
    expect(engine.findVariable("sensor").scope.variables.sensor.value).toBe(700);
    runToStop(engine);
    expect(engine.state.status).toBe("completed");
    expect(engine.state.events.join("\n")).toContain("digitalWrite");
    expect(engine.state.events.join("\n")).toContain("espera simulada de 1000 ms");
    expect(engine.state.events.join("\n")).toContain("Hola");
  });

  it("uses HIGH and LOW input for digitalRead in a condition", () => {
    const source = `void setup() {
  if (digitalRead(2) == HIGH) digitalWrite(13, HIGH);
  else digitalWrite(13, LOW);
}`;
    const { engine } = createEngine(source);
    engine.start();
    engine.stepForward();
    expect(engine.state.status).toBe("waiting-input");
    engine.provideInput("LOW");
    runToStop(engine);
    expect(engine.state.status).toBe("completed");
    expect(engine.state.events.join("\n")).toContain("LOW");
    expect(engine.state.events.join("\n")).not.toContain("solicita el valor HIGH");
  });

  it("stops rather than choosing an unknown branch and can run user functions", () => {
    const source = `void helper() { digitalWrite(13, HIGH); }
void setup() { helper(); if (missingValue) { helper(); } }`;
    const { engine } = createEngine(source);
    engine.start();
    engine.stepForward();
    expect(engine.state.scopes.at(-1).name).toBe("helper");
    runToStop(engine);
    expect(engine.state.status).toBe("uncertain");
    expect(engine.state.message).toContain("No se puede determinar la rama");
    expect(engine.state.events.join("\n")).toContain("digitalWrite");
  });

  it("allows an unknown declared variable to be initialized before retrying its condition", () => {
    const source = `void setup() {
  int input;
  if (input > 0) digitalWrite(13, HIGH);
}`;
    const { engine } = createEngine(source);
    engine.start();
    engine.stepForward();
    engine.stepForward();
    expect(engine.state.status).toBe("uncertain");
    expect(engine.findVariable("input").scope.variables.input.known).toBe(false);
    engine.setVariable("input", "1");
    expect(engine.state.status).toBe("paused");
    expect(runToStop(engine).status).toBe("completed");
    expect(engine.state.events.join("\n")).toContain("solicita el valor HIGH");
  });

  it("binds known arguments while stepping through a user-defined function", () => {
    const source = `void setLed(int pin) { digitalWrite(pin, HIGH); }
void setup() { setLed(7); }`;
    const { engine } = createEngine(source);
    engine.start();
    engine.stepForward();
    expect(engine.state.scopes.at(-1).name).toBe("setLed");
    expect(engine.state.scopes.at(-1).variables.pin.value).toBe(7);
    runToStop(engine);
    expect(engine.state.status).toBe("completed");
    expect(engine.state.events.join("\n")).toContain("pin 7");
  });

  it("invalidates old execution references and resets state", () => {
    const { engine } = createEngine("void setup() { int value = 2; }");
    engine.start();
    engine.stepForward();
    engine.invalidate("El código cambió.");
    expect(engine.state.status).toBe("idle");
    expect(engine.state.tasks).toEqual([]);
    expect(engine.state.message).toBe("El código cambió.");
  });

  it("supports pause and automatic execution without blocking the browser", () => {
    vi.useFakeTimers();
    const { engine } = createEngine("void setup() { int x = 0; x++; x++; }");
    const controller = new SimulationController(engine);
    controller.start();
    controller.run(100);
    expect(engine.state.status).toBe("running");
    vi.advanceTimersByTime(110);
    controller.pause();
    expect(engine.state.status).toBe("paused");
    expect(engine.state.step).toBeGreaterThan(0);
    controller.run(100);
    vi.advanceTimersByTime(1000);
    expect(engine.state.status).toBe("completed");
  });

  it("highlights the current SVG node without changing editor-independent export content", () => {
    const source = "void setup() { pinMode(13, OUTPUT); digitalWrite(13, HIGH); }";
    const { diagram, engine } = createEngine(source);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.innerHTML = `
      <defs><marker id="flow-arrow"><path d="M0 0"></path></marker></defs>
      <title id="svg-title"></title><desc id="svg-description"></desc>
    `;
    renderFlowchart(svg, diagram);
    engine.start();
    engine.stepForward();
    highlightSimulationFlow(svg, engine.state.currentNodeId, engine.state.currentEdgeId);
    const activeNode = svg.querySelector(".flow-node.is-simulation-active");
    expect(activeNode?.dataset.nodeId).toBe(engine.state.currentNodeId);
    expect(svg.querySelector(".flow-edge.is-simulation-traversed")?.dataset.edgeId)
      .toBe(engine.state.currentEdgeId);
    const exported = createExportSvg(svg, diagram.bounds);
    expect(exported.querySelector(".is-simulation-active, .is-simulation-traversed")).toBeNull();
    expect(engine.state.currentInstruction).toContain("pinMode");
  });
});
