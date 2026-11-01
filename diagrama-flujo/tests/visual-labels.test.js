// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { analyzeSource } from "../src/analyzer/analyzer.js";
import { generateFlowcharts } from "../src/flowchart/flow-generator.js";
import { layoutDiagram } from "../src/flowchart/flow-layout.js";
import {
  createVisualDiagram,
  createVisualLabelStore,
  VISUAL_LABELS_STORAGE_KEY,
} from "../src/flowchart/visual-labels.js";
import { SimulationEngine } from "../src/simulator/simulation-engine.js";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values,
  };
}

function createProgram(source) {
  const analysis = analyzeSource(source);
  const generated = generateFlowcharts(analysis.ast, source);
  generated.diagrams.forEach(layoutDiagram);
  return { analysis, diagrams: generated.diagrams };
}

function findFunction(diagrams, name) {
  return diagrams.find((diagram) => diagram.functionName === name);
}

describe("visual labels", () => {
  it("uses original labels until a non-empty custom label is applied, then restores the original", () => {
    const storage = createStorage();
    const node = { id: "flow-node-1", label: "digitalWrite(LED_BUILTIN, HIGH)" };
    const store = createVisualLabelStore(storage);
    store.setSource("void setup() {}");

    expect(store.getLabel(node)).toBe(node.label);
    expect(store.hasCustomLabel(node)).toBe(false);
    expect(store.setLabel(node, "  Encender el LED  ")).toBe("Encender el LED");
    expect(store.getLabel(node)).toBe("Encender el LED");
    expect(store.hasCustomLabel(node)).toBe(true);

    const restored = createVisualLabelStore(storage);
    restored.setSource("void setup() {}");
    expect(restored.getLabel(node)).toBe("Encender el LED");
    expect(restored.resetLabel(node)).toBe(node.label);
    expect(restored.hasCustomLabel(node)).toBe(false);
    expect(storage.getItem(VISUAL_LABELS_STORAGE_KEY)).toBeNull();
  });

  it("does not save empty or original-equivalent labels and enforces a safe text limit", () => {
    const storage = createStorage();
    const node = { id: "node-1", label: "delay(1000)" };
    const store = createVisualLabelStore(storage);
    store.setSource("void setup() {}");

    store.setLabel(node, "  ");
    expect(storage.getItem(VISUAL_LABELS_STORAGE_KEY)).toBeNull();
    store.setLabel(node, "  delay(1000)  ");
    expect(storage.getItem(VISUAL_LABELS_STORAGE_KEY)).toBeNull();
    expect(() => store.setLabel(node, "x".repeat(161))).toThrow("160 caracteres");
    expect(() => store.setLabel(node, 17)).toThrow("debe ser texto");
  });

  it("keeps labels only when the exact source matches and does not erase older metadata on a mismatch", () => {
    const storage = createStorage();
    const node = { id: "flow-node-1", label: "original" };
    const store = createVisualLabelStore(storage);
    store.setSource("void setup() { first(); }");
    store.setLabel(node, "Etiqueta anterior");
    const savedRecord = storage.getItem(VISUAL_LABELS_STORAGE_KEY);

    store.setSource("void setup() { second(); }");
    expect(store.getLabel(node)).toBe("original");
    store.resetLabel(node);
    expect(storage.getItem(VISUAL_LABELS_STORAGE_KEY)).toBe(savedRecord);
  });

  it("retains matching labels across regeneration and keeps setup and loop nodes separate", () => {
    const source = `void setup() { digitalWrite(LED_BUILTIN, HIGH); }
void loop() { delay(1000); }`;
    const first = createProgram(source);
    const regenerated = createProgram(source);
    const setup = findFunction(first.diagrams, "setup");
    const loop = findFunction(first.diagrams, "loop");
    const setupNode = setup.nodes.find((node) => node.astType === "ExpressionStatement");
    const loopNode = loop.nodes.find((node) => node.astType === "ExpressionStatement");
    const regeneratedSetup = findFunction(regenerated.diagrams, "setup");
    const storage = createStorage();
    const store = createVisualLabelStore(storage);
    store.setSource(source);

    expect(regeneratedSetup.nodes.map((node) => node.id)).toEqual(setup.nodes.map((node) => node.id));
    store.setLabel(setupNode, "Encender LED");
    expect(store.getLabel(loopNode)).toBe(loopNode.label);
    store.setLabel(loopNode, "Esperar un segundo");
    expect(store.getLabel(setupNode)).toBe("Encender LED");
    expect(store.getLabel(regeneratedSetup.nodes.find((node) => node.id === setupNode.id))).toBe("Encender LED");
  });

  it("builds a presentation-only clone without changing the source diagram, AST, or simulator state", () => {
    const source = `void setup() {
  if (digitalRead(2)) {
    digitalWrite(LED_BUILTIN, HIGH);
  }
}`;
    const { analysis, diagrams } = createProgram(source);
    const diagram = findFunction(diagrams, "setup");
    const node = diagram.nodes.find((item) => item.astType === "ExpressionStatement");
    const originalDiagram = JSON.stringify(diagram);
    const originalAst = JSON.stringify(analysis.ast);
    const engine = new SimulationEngine({ ast: analysis.ast, source, diagram });
    const initialSimulationState = engine.getState();
    const store = createVisualLabelStore(createStorage());
    store.setSource(source);
    store.setLabel(node, "Encender el LED: «sí» & <ahora>");

    const presentation = createVisualDiagram(diagram, store, layoutDiagram);
    const displayedNode = presentation.nodes.find((item) => item.id === node.id);

    expect(presentation).not.toBe(diagram);
    expect(displayedNode.label).toBe("Encender el LED: «sí» & <ahora>");
    expect(displayedNode.originalLabel).toBe(node.label);
    expect(displayedNode.sourceNavigable).toBe(node.sourceNavigable);
    expect(displayedNode.astNodeId).toBe(node.astNodeId);
    expect(displayedNode.start).toBe(node.start);
    expect(displayedNode.end).toBe(node.end);
    expect(presentation.edges).toEqual(diagram.edges);
    expect(JSON.stringify(diagram)).toBe(originalDiagram);
    expect(JSON.stringify(analysis.ast)).toBe(originalAst);
    expect(engine.getState()).toEqual(initialSimulationState);
  });

  it("ignores older records without metadata and reports malformed metadata without throwing", () => {
    const storage = createStorage();
    storage.setItem(VISUAL_LABELS_STORAGE_KEY, JSON.stringify({ code: "legacy" }));
    const errors = [];
    const store = createVisualLabelStore(storage, { onError: (error) => errors.push(error) });
    const node = { id: "node-1", label: "original" };
    store.setSource("legacy");
    expect(store.getLabel(node)).toBe("original");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(TypeError);
  });
});
