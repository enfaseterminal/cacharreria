// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { analyzeSource } from "../src/analyzer/analyzer.js";
import { generateFlowcharts } from "../src/flowchart/flow-generator.js";
import { layoutDiagram } from "../src/flowchart/flow-layout.js";
import {
  initializeDiagramViewport,
  renderDiagramMessage,
  renderFlowchart,
  selectFlowNode,
} from "../src/flowchart/svg-renderer.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function createSvg() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "-600 -400 1200 800");
  const defs = document.createElementNS(SVG_NS, "defs");
  const background = document.createElementNS(SVG_NS, "rect");
  background.setAttribute("class", "diagram-background");
  svg.append(defs, background);
  for (const [id, text] of [
    ["svg-title", "Diagrama"],
    ["svg-description", "Vista"],
  ]) {
    const element = document.createElementNS(SVG_NS, "title");
    element.setAttribute("id", id);
    element.textContent = text;
    svg.append(element);
  }
  document.body.append(svg);
  return svg;
}

function makeDiagram(source, name = "setup") {
  const analysis = analyzeSource(source);
  const generated = generateFlowcharts(analysis.ast, source);
  const diagram = generated.diagrams.find((item) => item.functionName === name);
  if (diagram) layoutDiagram(diagram);
  return { analysis, diagram };
}

describe("SVG renderer", () => {
  it("renders real SVG shapes, routed connections, line references, and comment annotations", () => {
    const source = `void setup() {
  // Configure the pin
  pinMode(13, OUTPUT);
    digitalRead(13);
    if (digitalRead(13)) {
    digitalWrite(13, HIGH); // Turn on
  } else {
    delay(10);
  }
}`;
    const { diagram } = makeDiagram(source);
    const svg = createSvg();
    const bounds = renderFlowchart(svg, diagram);

    expect(svg.querySelectorAll(".flow-node")).toHaveLength(diagram.nodes.length);
    expect(svg.querySelectorAll(".flow-edge-path")).toHaveLength(diagram.edges.length);
    expect(svg.querySelectorAll(".flow-node-shape").length).toBeGreaterThan(0);
    expect(svg.querySelectorAll(".flow-shape-decision")).toHaveLength(1);
    expect(svg.querySelectorAll(".flow-shape-input")).toHaveLength(1);
    expect(svg.querySelectorAll(".flow-shape-output")).toHaveLength(1);
    expect(svg.querySelectorAll(".flow-comment-note")).toHaveLength(2);
    expect(svg.querySelector(".flow-edge-label").textContent).toMatch(/Sí|No/);
    expect(svg.querySelector(".flow-node[data-start-line='5']")).not.toBeNull();
    expect(svg.querySelector(".flow-node[data-ast-node-id]")).not.toBeNull();
    expect(svg.querySelector("#svg-title").textContent).toBe("Diagrama de flujo: setup()");
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
    expect([...svg.querySelectorAll("*")].every((element) => element.namespaceURI === SVG_NS)).toBe(true);
  });

  it("routes abrupt control-flow jumps around intervening blocks", () => {
    const source =
      "void setup() { while (ready) { if (done) { break; } continue; after(); } return; }";
    const { diagram } = makeDiagram(source);
    const svg = createSvg();
    renderFlowchart(svg, diagram);

    for (const edge of diagram.edges.filter((item) =>
      ["break", "return"].includes(item.type) ||
      (item.type === "loop-back" && item.label === "continue"),
    )) {
      const group = [...svg.querySelectorAll(".flow-edge")].find(
        (element) => element.dataset.edgeId === edge.id,
      );
      const path = group.querySelector(".flow-edge-path").getAttribute("d");
      const routeX = diagram.width - 26 - (edge.routeLane - 1) * 22;

      expect(edge.routeLane).toBeGreaterThan(0);
      expect(path).toContain(`H ${routeX} V`);
    }
  });

  it("exposes selectable SVG blocks to pointer and keyboard users", () => {
    const { diagram } = makeDiagram("void setup() {\n  // explain\n  pinMode(13, OUTPUT);\n}");
    const svg = createSvg();
    renderFlowchart(svg, diagram);
    const selections = [];
    svg.addEventListener("flowchartselect", (event) => selections.push(event.detail.nodeId));
    const target = [...svg.querySelectorAll(".flow-node")].find((node) =>
      node.textContent.includes("pinMode"),
    );

    expect(target.getAttribute("role")).toBe("button");
    expect(target.getAttribute("aria-label")).toContain("línea 3");
    expect(target.getAttribute("data-ast-type")).toBe("ExpressionStatement");
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(selections).toEqual([target.dataset.nodeId, target.dataset.nodeId]);

    expect(selectFlowNode(svg, target.dataset.nodeId)).toBe(target);
    expect(target.classList.contains("is-selected")).toBe(true);
    expect(target.getAttribute("aria-pressed")).toBe("true");
    expect(target.getAttribute("tabindex")).toBe("0");
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect([...svg.querySelectorAll(".flow-node")].filter((node) =>
      node.getAttribute("tabindex") === "0",
    )).toHaveLength(1);
    expect(selectFlowNode(svg, null)).toBeNull();
    expect(target.classList.contains("is-selected")).toBe(false);
  });

  it("preserves zoom scale while centering a selected block and supports keyboard zoom", () => {
    const { diagram } = makeDiagram("void setup() { pinMode(13, OUTPUT); }");
    const svg = createSvg();
    const controls = {};
    for (const name of ["zoomIn", "zoomOut", "fit", "center"]) {
      controls[name] = document.createElement("button");
    }
    const zoomLabel = document.createElement("span");
    const viewport = initializeDiagramViewport(svg, controls, zoomLabel);
    renderFlowchart(svg, diagram);
    viewport.setBounds(diagram.bounds);

    const initialWidth = Number(svg.getAttribute("viewBox").split(" ")[2]);
    controls.zoomIn.click();
    const zoomedWidth = Number(svg.getAttribute("viewBox").split(" ")[2]);
    expect(zoomedWidth).toBeLessThan(initialWidth);
    viewport.centerOn({
      x: 8000,
      y: 8000,
      width: 60,
      height: 60,
      centerX: 8030,
      centerY: 8030,
    });
    expect(Number(svg.getAttribute("viewBox").split(" ")[2])).toBe(zoomedWidth);
    expect(Number(svg.getAttribute("viewBox").split(" ")[0])).not.toBe(0);

    svg.dispatchEvent(new KeyboardEvent("keydown", { key: "-", bubbles: true }));
    expect(Number(svg.getAttribute("viewBox").split(" ")[2])).toBeGreaterThan(zoomedWidth);
    expect(zoomLabel.textContent).toContain("%");
  });

  it("hides only comment annotations while retaining the same graph and AST references", () => {
    const source = "void setup() {\n  // keep in AST\n  pinMode(13, OUTPUT);\n}";
    const { analysis, diagram } = makeDiagram(source);
    const svg = createSvg();

    renderFlowchart(svg, diagram);
    const visibleComments = svg.querySelectorAll(".flow-comment-note").length;
    const blockCount = svg.querySelectorAll(".flow-node").length;
    const edgeCount = svg.querySelectorAll(".flow-edge-path").length;
    expect(visibleComments).toBe(1);

    renderFlowchart(svg, diagram, { showComments: false });
    expect(svg.querySelectorAll(".flow-comment-note")).toHaveLength(0);
    expect(svg.querySelectorAll(".flow-node")).toHaveLength(blockCount);
    expect(svg.querySelectorAll(".flow-edge-path")).toHaveLength(edgeCount);
    expect(diagram.nodes.find((node) => node.comments.length > 0).comments[0].text).toBe("// keep in AST");
    expect(analysis.ast.comments[0].text).toBe("// keep in AST");
  });

  it("renders source-controlled markup as text and creates no executable SVG elements", () => {
    const source =
      'void setup() { Serial.println("</text><script>window.__flowInjected=1</script>"); // <svg onload="alert(1)">\n}';
    const { analysis, diagram } = makeDiagram(source);
    const svg = createSvg();
    renderFlowchart(svg, diagram);

    expect(analysis.success).toBe(true);
    expect(svg.querySelector("script, foreignObject, iframe")).toBeNull();
    expect(svg.querySelector("[onload], [onclick]")).toBeNull();
    expect([...svg.querySelectorAll("[href], [xlink\\:href]")].every((element) =>
      (element.getAttribute("href") ?? "").startsWith("#"),
    )).toBe(true);
    expect([...svg.querySelectorAll(".flow-node-label, .flow-comment-text")].some((element) =>
      element.textContent.includes("<script>") || element.textContent.includes("<svg onload="),
    )).toBe(true);
    expect(document.defaultView.__flowInjected).toBeUndefined();
  });

  it("replaces old graph content with a safe empty/error message", () => {
    const { diagram } = makeDiagram("void setup() { pinMode(13, OUTPUT); }");
    const svg = createSvg();
    renderFlowchart(svg, diagram);
    const bounds = renderDiagramMessage(svg, "Corrige los errores antes de generar.");

    expect(svg.querySelectorAll(".flow-node")).toHaveLength(0);
    expect(svg.querySelectorAll(".flow-edge")).toHaveLength(0);
    expect(svg.querySelector(".diagram-placeholder").textContent).toContain("Corrige los errores");
    expect(bounds).toMatchObject({ x: -600, y: -400, width: 1200, height: 800 });
  });
});
