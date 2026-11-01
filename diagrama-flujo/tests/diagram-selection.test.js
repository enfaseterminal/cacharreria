// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { analyzeSource } from "../src/analyzer/analyzer.js";
import { generateFlowcharts } from "../src/flowchart/flow-generator.js";
import { layoutDiagram } from "../src/flowchart/flow-layout.js";
import {
  createSelectionModel,
  findDiagramNodeAtPosition,
  renderSelectionDetails,
} from "../src/ui/diagram-selection.js";

function analyzeAndLayout(source) {
  const analysis = analyzeSource(source);
  const generated = generateFlowcharts(analysis.ast, source);
  generated.diagrams.forEach(layoutDiagram);
  return { analysis, diagrams: generated.diagrams };
}

function findAstNode(ast, id) {
  if (!ast || typeof ast !== "object") return null;
  if (ast.id === id) return ast;
  for (const value of Object.values(ast)) {
    const values = Array.isArray(value) ? value : [value];
    for (const child of values) {
      const match = findAstNode(child, id);
      if (match) return match;
    }
  }
  return null;
}

describe("editor and diagram selection", () => {
  it("maps a code position to the exact AST-backed flowchart instruction", () => {
    const source = `void setup() {
  int sensor = analogRead(A0);
  if (sensor > 10) {
    digitalWrite(13, HIGH);
  }
}`;
    const { analysis, diagrams } = analyzeAndLayout(source);
    const match = findDiagramNodeAtPosition(
      analysis.ast,
      diagrams,
      source.indexOf("digitalWrite"),
      4,
    );
    const astNode = findAstNode(analysis.ast, match.node.astNodeId);

    expect(match.diagram.functionName).toBe("setup");
    expect(match.node.label).toContain("digitalWrite");
    expect(astNode.type).toBe("ExpressionStatement");
    expect(match.node.astType).toBe(astNode.type);
    expect(match.node.startLine).toBe(4);
    expect(match.node.sourceNavigable).toBe(true);
  });

  it("uses the condition block as the primary match for a control statement", () => {
    const source = "void setup() { if (ready) { work(); } }";
    const { analysis, diagrams } = analyzeAndLayout(source);
    const match = findDiagramNodeAtPosition(analysis.ast, diagrams, source.indexOf("if"), 1);

    expect(match.node.kind).toBe("decision");
    expect(match.node.astType).toBe("IfStatement");
  });

  it("returns no block for source that has no graph correspondence", () => {
    const source = "#include <Arduino.h>\nvoid setup() { pinMode(13, OUTPUT); }";
    const { analysis, diagrams } = analyzeAndLayout(source);
    const match = findDiagramNodeAtPosition(analysis.ast, diagrams, source.indexOf("#include"), 1);

    expect(match).toBeNull();
  });

  it("does not map whitespace inside a control structure to its condition", () => {
    const source = `void setup() {
  if (ready) {

    work();
  }
}`;
    const { analysis, diagrams } = analyzeAndLayout(source);
    const match = findDiagramNodeAtPosition(
      analysis.ast,
      diagrams,
      source.indexOf("\n\n") + 1,
      3,
    );

    expect(match).toBeNull();
  });

  it("maps a comment position to its associated instruction", () => {
    const source = "void setup() {\n  pinMode(13, OUTPUT); // pin output\n}";
    const { analysis, diagrams } = analyzeAndLayout(source);
    const match = findDiagramNodeAtPosition(
      analysis.ast,
      diagrams,
      source.indexOf("// pin output"),
      2,
    );

    expect(match.node.label).toContain("pinMode");
    expect(match.node.comments[0]).toMatchObject({
      text: "// pin output",
      start: source.indexOf("// pin output"),
      end: source.indexOf("// pin output") + "// pin output".length,
    });
  });

  it("notifies once per actual origin change and does not echo updates", () => {
    const model = createSelectionModel();
    const updates = [];
    model.subscribe((selection, origin) => updates.push({ selection, origin }));
    const selection = { diagramId: "setup", diagramNodeId: "node-1", editorLine: 3 };

    expect(model.select(selection, "editor")).toBe(true);
    expect(model.select(selection, "editor")).toBe(false);
    expect(model.select(selection, "diagram")).toBe(true);
    expect(model.clear("function")).toBe(true);
    expect(updates.map((update) => update.origin)).toEqual(["editor", "diagram", "function"]);
    expect(updates.at(-1).selection).toBeNull();
  });

  it("renders complete comments as text while preserving line breaks", () => {
    const container = document.createElement("aside");
    for (const [tag, id] of [
      ["h3", "selection-type"],
      ["p", "selection-range"],
      ["pre", "selection-source"],
      ["h4", "selection-comments-heading"],
      ["div", "selection-comments"],
    ]) {
      const element = document.createElement(tag);
      element.id = id;
      container.append(element);
    }
    const comment = "/* first line\n * second line\n */";
    renderSelectionDetails(container, {
      astType: "ExpressionStatement",
      startLine: 4,
      endLine: 4,
      sourceText: "pinMode(13, OUTPUT);",
      comments: [{ text: comment }],
    });

    expect(container.hidden).toBe(false);
    expect(container.querySelector("#selection-type").textContent).toBe("ExpressionStatement");
    expect(container.querySelector("#selection-source").textContent).toBe("pinMode(13, OUTPUT);");
    expect(container.querySelector(".selection-comment").textContent).toBe(comment);
    expect(container.querySelector("#selection-comments-heading").hidden).toBe(false);
  });
});
