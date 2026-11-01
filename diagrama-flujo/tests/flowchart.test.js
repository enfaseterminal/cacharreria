import { describe, expect, it } from "vitest";
import { analyzeSource } from "../src/analyzer/analyzer.js";
import { completeArduinoExample } from "../src/examples/complete-arduino-example.js";
import { generateFlowcharts } from "../src/flowchart/flow-generator.js";
import { layoutDiagram } from "../src/flowchart/flow-layout.js";

function build(source) {
  const analysis = analyzeSource(source);
  const result = generateFlowcharts(analysis.ast, source);
  result.diagrams.forEach(layoutDiagram);
  return { analysis, result };
}

function diagramFor(result, name) {
  return result.diagrams.find((diagram) => diagram.functionName === name);
}

function expectConnected(diagram) {
  const ids = new Set(diagram.nodes.map((node) => node.id));
  for (const edge of diagram.edges) {
    expect(ids.has(edge.from), `missing edge source ${edge.from}`).toBe(true);
    expect(ids.has(edge.to), `missing edge target ${edge.to}`).toBe(true);
  }
}

describe("flowchart generation", () => {
  it("reports an empty program without fabricating a function diagram", () => {
    const { analysis, result } = build("");

    expect(analysis.success).toBe(true);
    expect(result.diagrams).toHaveLength(0);
    expect(result.warnings.map((warning) => warning.type)).toContain("NoFunctions");
    expect(result.warnings.map((warning) => warning.type)).toContain("MissingSetup");
    expect(result.warnings.map((warning) => warning.type)).toContain("MissingLoop");
  });

  it("preserves standalone top-level comments without inventing executable statements", () => {
    const { result } = build("// nota fuera de las funciones");
    const diagram = diagramFor(result, "Notas globales");

    expect(diagram.nodes.some((node) => node.kind === "comment" && node.label === "// nota fuera de las funciones")).toBe(true);
    expect(diagram.nodes.some((node) => node.kind === "process" && node.astNodeId)).toBe(false);
  });

  it("shows setup as a one-time initialization with source references", () => {
    const source = "void setup() {\n  pinMode(13, OUTPUT);\n}";
    const { result } = build(source);
    const diagram = diagramFor(result, "setup");

    expect(diagram.description).toMatch(/una vez/);
    expect(diagram.nodes.map((node) => node.kind)).toContain("start");
    expect(diagram.nodes.map((node) => node.kind)).toContain("end");
    expect(diagram.edges.some((edge) => edge.type === "loop-repeat")).toBe(false);
    expect(diagram.nodes.find((node) => node.label.includes("pinMode")).startLine).toBe(2);
    expect(result.warnings.map((warning) => warning.type)).toContain("MissingLoop");
  });

  it("marks loop as the repeatedly invoked Arduino routine, not a user while loop", () => {
    const source = "void loop() {\n  digitalWrite(13, HIGH);\n}";
    const { result } = build(source);
    const diagram = diagramFor(result, "loop");
    const repeat = diagram.edges.find((edge) => edge.type === "loop-repeat");

    expect(diagram.description).toMatch(/continuamente/);
    expect(repeat.label).toMatch(/repetición continua/);
    expect(repeat.from).toBe(`flow-${diagram.functionNodeId}-end`);
    expect(repeat.to).toBe(`flow-${diagram.functionNodeId}-start`);
    expect(result.warnings.map((warning) => warning.type)).toContain("MissingSetup");
    expect(diagram.nodes.some((node) => node.kind === "decision" && node.astNodeId === diagram.functionNodeId)).toBe(false);
  });

  it("keeps statements in source order and connects each executable block", () => {
    const source = "void setup() {\n  int count = 0;\n  count = count + 1;\n  Serial.println(count);\n}";
    const { result } = build(source);
    const diagram = diagramFor(result, "setup");
    const statements = diagram.nodes.filter((node) => node.startLine >= 2 && node.startLine <= 4);

    expect(statements.map((node) => node.startLine)).toEqual([2, 3, 4]);
    expect(statements[0].y).toBeLessThan(statements[1].y);
    expect(statements[1].y).toBeLessThan(statements[2].y);
    expect(diagram.edges).toHaveLength(diagram.nodes.length - 1);
    expectConnected(diagram);
  });

  it("preserves AST node IDs and original source locations on flow blocks", () => {
    const source = "void setup() {\n  int pin = 13;\n  pinMode(pin, OUTPUT);\n}";
    const { analysis, result } = build(source);
    const diagram = diagramFor(result, "setup");
    const astIds = new Set();
    const visit = (node) => {
      if (!node || typeof node !== "object") return;
      if (node.id) astIds.add(node.id);
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === "object") visit(value);
      }
    };
    visit(analysis.ast);

    for (const node of diagram.nodes.filter((item) => item.astNodeId)) {
      expect(astIds.has(node.astNodeId)).toBe(true);
      expect(node.start).toBeGreaterThanOrEqual(0);
      expect(node.end).toBeGreaterThan(node.start);
      expect(node.startLine).toBeGreaterThan(0);
      expect(node.endLine).toBeGreaterThanOrEqual(node.startLine);
    }
    expect(diagram.nodes.find((node) => node.label.includes("pinMode")).astNodeId).toBeTruthy();
  });

  it("creates distinct true and false branches and a merge for if/else", () => {
    const source = "void setup() {\n  if (ready) { start(); } else { stop(); }\n  finish();\n}";
    const { result } = build(source);
    const diagram = diagramFor(result, "setup");
    const branchEdges = diagram.edges.filter((edge) => ["yes", "no"].includes(edge.type));
    const decision = diagram.nodes.find((node) => node.kind === "decision");
    const join = diagram.nodes.find((node) => node.kind === "connector");

    expect(branchEdges.map((edge) => edge.label).sort()).toEqual(["No", "Sí"]);
    expect(diagram.nodes.find((node) => node.label.includes("start()")).centerX).toBeGreaterThan(decision.centerX);
    expect(diagram.nodes.find((node) => node.label.includes("stop()")).centerX).toBeLessThan(decision.centerX);
    expect(join.y).toBeGreaterThan(diagram.nodes.find((node) => node.label.includes("start()")).y);
    expectConnected(diagram);
  });

  it("represents else-if as a second decision node", () => {
    const source = "void setup() { if (a) one(); else if (b) two(); else three(); }";
    const { result } = build(source);
    const diagram = diagramFor(result, "setup");

    expect(diagram.nodes.filter((node) => node.kind === "decision")).toHaveLength(2);
    expect(diagram.edges.filter((edge) => edge.type === "yes")).toHaveLength(2);
    expect(diagram.edges.filter((edge) => edge.type === "no")).toHaveLength(2);
  });

  it("lays out for initializer, condition, update, and a return connection", () => {
    const source = "void loop() {\n  for (int i = 0; i < 3; i++) { tick(i); }\n}";
    const { result } = build(source);
    const diagram = diagramFor(result, "loop");
    const decision = diagram.nodes.find((node) => node.kind === "decision");
    const update = diagram.nodes.find((node) => node.label === "i++");
    const body = diagram.nodes.find((node) => node.label.includes("tick(i)"));

    expect(diagram.nodes.find((node) => node.label.includes("int i = 0")).y).toBeLessThan(decision.y);
    expect(decision.y).toBeLessThan(body.y);
    expect(body.y).toBeLessThan(update.y);
    expect(diagram.edges.some((edge) => edge.type === "loop-back" && edge.to === decision.id)).toBe(true);
    expect(diagram.edges.some((edge) => edge.type === "loop-exit" && edge.label === "No")).toBe(true);
    expectConnected(diagram);
  });

  it("routes while-loop control back to its condition", () => {
    const source = "void loop() { while (ready) { work(); } }";
    const { result } = build(source);
    const diagram = diagramFor(result, "loop");
    const decision = diagram.nodes.find((node) => node.kind === "decision");

    expect(diagram.edges.some((edge) => edge.type === "loop-back" && edge.to === decision.id)).toBe(true);
    expect(diagram.edges.some((edge) => edge.type === "loop-exit" && edge.label === "No")).toBe(true);
    expectConnected(diagram);
  });

  it("reserves exterior lanes for break, continue, and return jumps", () => {
    const source = `void loop() {
  while (ready) {
    work();
    if (done) { break; }
    continue;
    after();
  }
  finish();
  return;
}`;
    const { result } = build(source);
    const diagram = diagramFor(result, "loop");
    const jumpEdges = diagram.edges.filter((edge) =>
      ["break", "return"].includes(edge.type) ||
      (edge.type === "loop-back" && edge.label === "continue"),
    );
    const rightmostNode = Math.max(...diagram.nodes.map((node) => node.x + node.width));

    expect(jumpEdges.map((edge) => edge.type)).toEqual(["return", "loop-back", "break"]);
    expect(jumpEdges.every((edge) => Number.isInteger(edge.routeLane))).toBe(true);
    expect(new Set(jumpEdges.map((edge) => edge.routeLane)).size).toBe(jumpEdges.length);
    for (const edge of jumpEdges) {
      const routeX = diagram.width - 26 - (edge.routeLane - 1) * 22;
      expect(routeX).toBeGreaterThan(rightmostNode);
    }
    expectConnected(diagram);
  });

  it("places do-while body before its condition and routes the true branch back", () => {
    const source = "void loop() { do { work(); } while (ready); }";
    const { result } = build(source);
    const diagram = diagramFor(result, "loop");
    const decision = diagram.nodes.find((node) => node.kind === "decision");
    const body = diagram.nodes.find((node) => node.label.includes("work()"));

    expect(body.y).toBeLessThan(decision.y);
    expect(diagram.edges.some((edge) => edge.type === "loop-back" && edge.label === "Sí")).toBe(true);
    expect(diagram.edges.some((edge) => edge.type === "loop-exit" && edge.label === "No")).toBe(true);
    expectConnected(diagram);
  });

  it("dispatches switch cases, preserves fall-through, and routes breaks to the merge", () => {
    const source = "void loop() { switch (state) { case 0: first(); break; default: second(); } done(); }";
    const { result } = build(source);
    const diagram = diagramFor(result, "loop");
    const decision = diagram.nodes.find((node) => node.kind === "decision");
    const join = diagram.nodes.find((node) => node.kind === "connector");
    const done = diagram.nodes.find((node) => node.label.includes("done()"));

    expect(diagram.edges.filter((edge) => edge.type === "dispatch")).toHaveLength(2);
    expect(diagram.nodes.filter((node) => node.kind === "case").map((node) => node.label)).toEqual(["case 0", "default"]);
    expect(diagram.edges.some((edge) => edge.type === "break" && edge.to === join.id)).toBe(true);
    expect(diagram.edges.filter((edge) => edge.type === "dispatch").every((edge) => edge.from === decision.id)).toBe(true);
    expect(done.y).toBeGreaterThan(join.y + join.height);
    expectConnected(diagram);
  });

  it("draws switch fall-through from one case body to the next case label", () => {
    const source = "void loop() { switch (mode) { case 0: first(); case 1: second(); default: done(); } }";
    const { result } = build(source);
    const diagram = diagramFor(result, "loop");
    const first = diagram.nodes.find((node) => node.label.includes("first()"));
    const nextCase = diagram.nodes.find((node) => node.kind === "case" && node.label === "case 1");

    expect(diagram.edges.some((edge) => edge.from === first.id && edge.to === nextCase.id)).toBe(true);
    expectConnected(diagram);
  });

  it("creates separate diagrams for setup, loop, and auxiliary functions", () => {
    const { result } = build(completeArduinoExample);
    const names = result.diagrams.map((diagram) => diagram.functionName);

    expect(names).toEqual(["Inicialización global", "readSensor", "setup", "loop"]);
    expect(diagramFor(result, "readSensor").nodes.some((node) => node.label.startsWith("return"))).toBe(true);
    expect(diagramFor(result, "loop").nodes.some((node) => node.label.includes("readSensor(i)"))).toBe(true);
    expectConnected(diagramFor(result, "loop"));
  });

  it("renders leading comments as attached annotations without executable edges", () => {
    const source = "void setup() {\n  // configure the output\n  pinMode(13, OUTPUT);\n}";
    const { result } = build(source);
    const diagram = diagramFor(result, "setup");
    const block = diagram.nodes.find((node) => node.label.includes("pinMode"));

    expect(block.comments).toHaveLength(1);
    expect(block.comments[0]).toMatchObject({ text: "// configure the output", startLine: 2, relation: "leading" });
    expect(diagram.nodes.some((node) => node.kind === "comment")).toBe(false);
    expect(diagram.edges.some((edge) => edge.from === block.comments[0].id || edge.to === block.comments[0].id)).toBe(false);
  });

  it("preserves trailing comments on their statement blocks", () => {
    const source = "void setup() {\n  digitalWrite(13, HIGH); // turn on\n}";
    const { result } = build(source);
    const block = diagramFor(result, "setup").nodes.find((node) => node.label.includes("digitalWrite"));

    expect(block.comments).toHaveLength(1);
    expect(block.comments[0]).toMatchObject({ text: "// turn on", startLine: 2, relation: "trailing" });
  });

  it("preserves multiline comments as annotations with original line ranges", () => {
    const source = "void setup() {\n  /* Configure\n   * output pin\n   */\n  pinMode(13, OUTPUT);\n}";
    const { result } = build(source);
    const block = diagramFor(result, "setup").nodes.find((node) => node.label.includes("pinMode"));

    expect(block.comments).toHaveLength(1);
    expect(block.comments[0].text).toBe("/* Configure\n   * output pin\n   */");
    expect(block.comments[0].startLine).toBe(2);
    expect(block.comments[0].endLine).toBe(4);
  });

  it("shows comments that cannot be associated safely as independent non-executable notes", () => {
    const source = "void setup() {\n  // standalone note\n\n  int value = 1;\n}";
    const { result } = build(source);
    const diagram = diagramFor(result, "setup");
    const note = diagram.nodes.find((node) => node.kind === "comment");

    expect(note.label).toBe("// standalone note");
    expect(note.functionName).toBe("setup");
    expect(diagram.edges.some((edge) => edge.from === note.id || edge.to === note.id)).toBe(false);
    expect(diagram.nodes.find((node) => node.label.includes("int value")).startLine).toBe(4);
  });

  it("keeps unknown user/library calls as call blocks without treating them as errors", () => {
    const source = "void setup() { cloudLibrary.send(payload); }";
    const { analysis, result } = build(source);
    const diagram = diagramFor(result, "setup");

    expect(analysis.success).toBe(true);
    expect(diagram.nodes.some((node) => node.kind === "call" && node.label.includes("cloudLibrary.send"))).toBe(true);
    expect(result.warnings.some((warning) => warning.type === "UnsupportedInstruction")).toBe(false);
  });

  it("preserves unrecognized statements in generic blocks with a warning", () => {
    const source = "void setup() { try { work(); } }";
    const { result } = build(source);
    const diagram = diagramFor(result, "setup");

    expect(diagram.nodes.some((node) => node.label.includes("try") && node.kind === "process")).toBe(true);
    expect(result.warnings.some((warning) => warning.type === "UnsupportedInstruction")).toBe(true);
  });

  it("keeps recoverable parser errors visible and flags incomplete control flow", () => {
    const source = "void loop() { if (ready) { digitalWrite(13, HIGH); }";
    const { analysis, result } = build(source);
    const diagram = diagramFor(result, "loop");

    expect(analysis.success).toBe(false);
    expect(analysis.diagnostics.some((diagnostic) => diagnostic.severity === "error")).toBe(true);
    expect(diagram.nodes.some((node) => node.kind === "decision")).toBe(true);
    expect(diagram.nodes.every((node) => [node.x, node.y, node.width, node.height].every(Number.isFinite))).toBe(true);
  });

  it("preserves arrays, Arduino I/O shapes, and comments in the complete example", () => {
    const { analysis, result } = build(completeArduinoExample);
    const diagram = diagramFor(result, "setup");
    const loopDiagram = diagramFor(result, "loop");

    expect(analysis.success).toBe(true);
    expect(loopDiagram.nodes.some((node) => node.kind === "input" || node.kind === "output")).toBe(true);
    expect(loopDiagram.nodes.some((node) => node.comments.length > 0)).toBe(true);
    expect(loopDiagram.nodes.some((node) => node.label.includes("readings[i]"))).toBe(true);
    expectConnected(loopDiagram);
  });

  it("has finite, non-overlapping branch lanes and stable selectable diagram IDs", () => {
    const source = "void setup() { if (ready) yes(); else no(); } void loop() { tick(); }";
    const { result } = build(source);
    const setup = diagramFor(result, "setup");
    const loop = diagramFor(result, "loop");
    const decision = setup.nodes.find((node) => node.kind === "decision");
    const yes = setup.nodes.find((node) => node.label.includes("yes()"));
    const no = setup.nodes.find((node) => node.label.includes("no()"));

    expect(result.diagrams.map((diagram) => diagram.id)).toEqual([
      `diagram-${setup.functionNodeId}`,
      `diagram-${loop.functionNodeId}`,
    ]);
    expect(yes.centerX).toBeGreaterThan(decision.centerX);
    expect(no.centerX).toBeLessThan(decision.centerX);
    for (const diagram of result.diagrams) {
      expectConnected(diagram);
      expect(Number.isFinite(diagram.width)).toBe(true);
      expect(Number.isFinite(diagram.height)).toBe(true);
      expect(diagram.nodes.every((node) => [node.x, node.y, node.width, node.height].every(Number.isFinite))).toBe(true);
    }
  });
});
