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
    expect(engine.state.events.map((event) => event.message).join("\n")).toContain("PIN 13");
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
    expect(engine.state.events.map((event) => event.message).join("\n")).toContain("HIGH");
    expect(engine.state.events.map((event) => event.message).join("\n")).not.toContain("LOW");
  });

  it("repeats loop() and stops at the configured step limit", () => {
    const { engine } = createEngine("void loop() { digitalWrite(13, HIGH); }", "loop", { maxSteps: 8 });
    engine.start();
    const state = runToStop(engine);
    expect(state.status).toBe("limit");
    expect(state.loopIterations["arduino-loop"]).toBeGreaterThan(0);
    expect(state.events.filter((event) => event.message.includes("PIN 13")).length).toBeGreaterThan(1);
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
    expect(engine.state.events.map((event) => event.message).join("\n")).toContain("PIN 13");
    expect(engine.state.events.map((event) => event.message).join("\n")).toContain("espera simulada de 1000 ms");
    expect(engine.state.serialOutput).toContain("Hola");
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
    expect(engine.state.events.map((event) => event.message).join("\n")).toContain("LOW");
    expect(engine.state.events.map((event) => event.message).join("\n")).not.toContain("solicita el valor HIGH");
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
    expect(engine.state.events.map((event) => event.message).join("\n")).toContain("PIN 13");
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
    expect(engine.state.events.map((event) => event.message).join("\n")).toContain("PIN 13");
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
    expect(engine.state.events.map((event) => event.message).join("\n")).toContain("PIN 7");
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

  it("configures Serial.begin with the simulated baud rate and records source location", () => {
    const source = "void setup() {\n  Serial.begin(9600);\n}";
    const { engine } = createEngine(source);
    engine.start();
    engine.stepForward();

    expect(engine.state.serialBaudRate).toBe(9600);
    expect(engine.state.events.at(-1)).toMatchObject({
      type: "serial",
      message: "[SERIAL] Velocidad configurada: 9600 baudios",
      line: 2,
      step: 1,
    });
    expect(engine.state.events.at(-1).nodeId).not.toBeNull();
  });

  it("preserves Serial.print and println string order and newline behavior", () => {
    const source = `void setup() {
  Serial.print("A");
  Serial.print("B");
  Serial.println("C");
  Serial.println("D");
}`;
    const { engine } = createEngine(source);
    engine.start();
    runToStop(engine);

    expect(engine.state.serialOutput).toBe("ABC\nD\n");
    expect(engine.state.events.filter((event) => event.type === "serial").map((event) => event.message))
      .toEqual(["A", "B", "C", "D"]);
    expect(engine.state.events.filter((event) => event.type === "serial").map((event) => event.line))
      .toEqual([2, 3, 4, 5]);
  });

  it("prints resolved variables and existing string concatenation expressions", () => {
    const source = `void setup() {
  int temperature = 23;
  Serial.print("T=");
  Serial.println(temperature + " C");
}`;
    const { engine } = createEngine(source);
    engine.start();
    runToStop(engine);

    expect(engine.state.serialOutput).toBe("T=23 C\n");
  });

  it("shows unknown Serial values explicitly instead of inventing output", () => {
    const { engine } = createEngine("void setup() { Serial.println(missingValue); }");
    engine.start();
    engine.stepForward();

    expect(engine.state.serialOutput).toContain("[desconocido: La variable «missingValue» no está declarada");
    expect(engine.state.events.at(-1).type).toBe("serial");
    expect(engine.state.events.at(-1).line).toBe(1);
  });

  it.each([
    ["OUTPUT", "OUTPUT"],
    ["INPUT", "INPUT"],
    ["INPUT_PULLUP", "INPUT_PULLUP"],
  ])("tracks pinMode configured as %s", (mode, expectedMode) => {
    const { engine } = createEngine(`void setup() { pinMode(4, ${mode}); }`);
    engine.start();
    engine.stepForward();

    expect(engine.state.pins["4"]).toMatchObject({
      pin: "4",
      mode: expectedMode,
      value: null,
      lastOperation: `Configurado como ${expectedMode}`,
      lastLine: 1,
      lastStep: 1,
    });
    expect(engine.state.events.at(-1).message).toBe(`[PIN 4] Configurado como ${expectedMode}`);
  });

  it("reports unsupported pin modes without claiming that the pin was configured", () => {
    const { engine } = createEngine("void setup() { pinMode(4, 7); }");
    engine.start();
    engine.stepForward();

    expect(engine.state.pins["4"]).toMatchObject({
      mode: null,
      lastOperation: "Modo desconocido: 7 no reconocido",
    });
    expect(engine.state.events.at(-1).message).toBe("[PIN 4] Modo desconocido: 7 no reconocido");
  });

  it("tracks digitalWrite HIGH and LOW as reversible output states", () => {
    const { engine } = createEngine(`void setup() {
  pinMode(13, OUTPUT);
  digitalWrite(13, HIGH);
  digitalWrite(13, LOW);
}`);
    engine.start();
    engine.stepForward();
    engine.stepForward();
    expect(engine.state.pins["13"].value).toBe(1);
    engine.stepForward();

    expect(engine.state.pins["13"]).toMatchObject({
      mode: "OUTPUT",
      value: 0,
      lastOperation: "Estado LOW",
      lastLine: 4,
      lastStep: 3,
    });
  });

  it("clears a previously known pin level after a digitalWrite with an unknown value", () => {
    const { engine } = createEngine(`void setup() {
  digitalWrite(13, HIGH);
  digitalWrite(13, missingValue);
}`);
    engine.start();
    engine.stepForward();
    engine.stepForward();

    expect(engine.state.pins["13"]).toMatchObject({
      value: null,
      lastOperation: "Escritura con valor desconocido",
    });
    expect(engine.state.events.at(-1).message).toContain("[PIN 13] Estado desconocido:");
  });

  it("uses only the supplied digitalRead value and shows an unknown pending input first", () => {
    const { engine } = createEngine("void setup() {\n  int pressed = digitalRead(2);\n}");
    engine.start();
    engine.stepForward();

    expect(engine.state.status).toBe("waiting-input");
    expect(engine.state.pins["2"]).toMatchObject({
      value: null,
      lastRead: "Desconocido (entrada pendiente)",
    });
    expect(engine.state.events.some((event) => event.type === "pin")).toBe(false);

    engine.provideInput("HIGH");
    engine.stepForward();
    expect(engine.state.pins["2"]).toMatchObject({
      value: 1,
      lastRead: "HIGH",
      lastOperation: "Lectura simulada: HIGH",
      lastLine: 2,
    });
    expect(engine.state.events.at(-1).message).toBe("[PIN 2] Lectura simulada: HIGH");
  });

  it("does not assume a digitalRead value for an unconfigured pin", () => {
    const { engine } = createEngine("void setup() { int value = digitalRead(99); }");
    engine.start();
    engine.stepForward();
    expect(engine.state.waitingInput.pin).toBe(99);
    expect(engine.state.pins["99"].mode).toBeNull();
    expect(engine.state.pins["99"].value).toBeNull();

    engine.provideInput("LOW");
    engine.stepForward();
    expect(engine.state.pins["99"]).toMatchObject({ mode: null, value: 0, lastRead: "LOW" });
  });

  it("restores console and pin snapshots when navigating backward and forward", () => {
    const { engine } = createEngine(`void setup() {
  Serial.println("ready");
  pinMode(7, OUTPUT);
  digitalWrite(7, HIGH);
}`);
    engine.start();
    engine.stepForward();
    engine.stepForward();
    engine.stepForward();
    expect(engine.state.serialOutput).toBe("ready\n");
    expect(engine.state.pins["7"].value).toBe(1);
    const eventCount = engine.state.events.length;

    engine.stepBackward();
    expect(engine.state.pins["7"].value).toBeNull();
    expect(engine.state.serialOutput).toBe("ready\n");
    engine.stepForward();
    expect(engine.state.pins["7"].value).toBe(1);
    expect(engine.state.events).toHaveLength(eventCount);
    expect(new Set(engine.state.events.map((event) => event.id)).size).toBe(eventCount);

    engine.stepBackward();
    engine.stepBackward();
    expect(engine.state.pins["7"]).toBeUndefined();
    expect(engine.state.serialOutput).toBe("ready\n");
    engine.stepBackward();
    expect(engine.state.serialOutput).toBe("");
  });

  it("adds session markers on start and completion and removes them on restart", () => {
    const { engine } = createEngine("void setup() { Serial.println(\"done\"); }");
    engine.start();
    expect(engine.state.events[0].message).toBe("[SIMULACIÓN INICIADA]");
    runToStop(engine);
    expect(engine.state.events.at(-1).message).toBe("[SIMULACIÓN FINALIZADA]");

    engine.restart();
    expect(engine.state.step).toBe(0);
    expect(engine.state.serialOutput).toBe("");
    expect(engine.state.events.map((event) => event.message)).toEqual(["[SIMULACIÓN INICIADA]"]);
    expect(engine.state.pins).toEqual({});
  });

  it("clears console records without losing pin history when requested", () => {
    const { engine } = createEngine("void setup() { pinMode(4, OUTPUT); Serial.print(\"x\"); }");
    engine.start();
    engine.stepForward();
    engine.stepForward();
    expect(engine.state.pins["4"].mode).toBe("OUTPUT");
    engine.clearConsole();

    expect(engine.state.serialOutput).toBe("");
    expect(engine.state.events).toEqual([]);
    expect(engine.state.pins["4"].mode).toBe("OUTPUT");
    engine.stepBackward();
    expect(engine.state.events).toEqual([]);
  });

  it("invalidates console and pin state when the current source is replaced", () => {
    const { engine } = createEngine(`void setup() {
  Serial.begin(115200);
  pinMode(13, OUTPUT);
}`);
    engine.start();
    engine.stepForward();
    engine.stepForward();
    engine.invalidate("El código cambió.");

    expect(engine.state).toMatchObject({
      status: "idle",
      serialOutput: "",
      serialBaudRate: null,
      pins: {},
      events: [],
    });
  });

  it("keeps setup and loop outputs in independent simulation sessions", () => {
    const source = `void setup() { Serial.println("setup"); digitalWrite(1, HIGH); }
void loop() { Serial.println("loop"); digitalWrite(2, LOW); }`;
    const setup = createEngine(source, "setup").engine;
    setup.start();
    runToStop(setup);
    const setupOutput = setup.state.serialOutput;
    const setupPins = { ...setup.state.pins };
    const loop = createEngine(source, "loop").engine;
    loop.start();
    runToStop(loop, 4);

    expect(setupOutput).toBe("setup\n");
    expect(setupPins["1"].value).toBe(1);
    expect(loop.state.serialOutput).toBe("loop\n");
    expect(loop.state.pins["2"].value).toBe(0);
    expect(loop.state.pins["1"]).toBeUndefined();
  });

  it("does not produce serial output for instructions in an unexecuted branch", () => {
    const { engine } = createEngine(`void setup() {
  if (false) {
    Serial.println("not reached");
  }
  Serial.println("reached");
}`);
    engine.start();
    runToStop(engine);

    expect(engine.state.serialOutput).toBe("reached\n");
    expect(engine.state.events.filter((event) => event.type === "serial").map((event) => event.message))
      .toEqual(["reached"]);
  });

  it("updates output panels progressively during autoplay and stops changes on pause", () => {
    vi.useFakeTimers();
    const { engine } = createEngine(`void setup() {
  Serial.println("one");
  Serial.println("two");
  Serial.println("three");
}`);
    const updates = [];
    const controller = new SimulationController(engine, (state) => updates.push(state));
    controller.start();
    controller.run(100);
    vi.advanceTimersByTime(110);
    controller.pause();
    const pausedStep = engine.state.step;
    const pausedOutput = engine.state.serialOutput;
    vi.advanceTimersByTime(1000);

    expect(updates.some((state) => state.serialOutput === "one\n")).toBe(true);
    expect(pausedOutput).toContain("one\n");
    expect(engine.state.step).toBe(pausedStep);
    expect(engine.state.serialOutput).toBe(pausedOutput);
  });

  it("records unsupported calls without executing C++ or invoking dynamic JavaScript", () => {
    const source = "void setup() { system(\"not executed\"); }";
    const { engine } = createEngine(source);
    const before = globalThis.__arduinoFlowchartTest;
    engine.start();
    runToStop(engine);

    expect(engine.state.status).toBe("completed");
    expect(engine.state.events.map((event) => event.message).join("\n")).toContain("no se ejecutó por seguridad");
    expect(globalThis.__arduinoFlowchartTest).toBe(before);
    expect(engine.simulateArduinoCall.toString()).not.toMatch(/\beval\s*\(|\bnew\s+Function\b/);
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
