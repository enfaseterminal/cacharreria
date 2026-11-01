// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeSource } from "../src/analyzer/analyzer.js";
import {
  createExportSvg,
  exportPdf,
  exportPng,
  exportSvg,
  planPdfTiles,
  rasterizeSvg,
  sanitizeFilename,
  serializeSvg,
} from "../src/export/export-manager.js";
import { getApplicationUrl } from "../src/export/application-url.js";
import { createSymbolLegend } from "../src/export/symbol-legend.js";
import { generateFlowcharts } from "../src/flowchart/flow-generator.js";
import { layoutDiagram } from "../src/flowchart/flow-layout.js";
import { renderFlowchart } from "../src/flowchart/svg-renderer.js";
import { createVisualDiagram, createVisualLabelStore } from "../src/flowchart/visual-labels.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function renderSource(source, functionName = "setup") {
  const analysis = analyzeSource(source);
  const diagram = generateFlowcharts(analysis.ast, source).diagrams.find(
    (item) => item.functionName === functionName,
  );
  if (!diagram) throw new Error(`Missing test function: ${functionName}`);
  layoutDiagram(diagram);
  const svg = document.createElementNS(SVG_NS, "svg");
  const defs = document.createElementNS(SVG_NS, "defs");
  svg.append(defs);
  renderFlowchart(svg, diagram);
  document.body.append(svg);
  return { svg, diagram };
}

function renderWithVisualLabel(source, label) {
  const { svg, diagram } = renderSource(source);
  const node = diagram.nodes.find((item) => item.astType === "ExpressionStatement");
  const store = createVisualLabelStore({
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
  store.setSource(source);
  store.setLabel(node, label);
  const presentation = createVisualDiagram(diagram, store, layoutDiagram);
  renderFlowchart(svg, presentation);
  return { svg, diagram: presentation };
}

function readBlobText(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsText(blob);
  });
}

function createPdfStub() {
  const pdf = {
    pages: 1,
    addPage: vi.fn(),
    svg: vi.fn(async () => {}),
    setPage: vi.fn(),
    setFontSize: vi.fn(),
    setFont: vi.fn(),
    setTextColor: vi.fn(),
    setDrawColor: vi.fn(),
    setLineWidth: vi.fn(),
    line: vi.fn(),
    text: vi.fn(),
    splitTextToSize: vi.fn((text, width) => {
      const max = Math.max(1, Math.floor(width / 5));
      return String(text).match(new RegExp(`.{1,${max}}`, "g")) ?? [""];
    }),
    output: vi.fn(() => new Blob(["pdf"], { type: "application/pdf" })),
  };
  pdf.addPage.mockImplementation(() => {
    pdf.pages += 1;
  });
  return pdf;
}

function renderPdfStub(svg, pdf, options) {
  return pdf.svg(svg, options);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("diagram export", () => {
  const source = `void setup() {
  // Configure the pin
  pinMode(13, OUTPUT);
  if (digitalRead(13)) {
    digitalWrite(13, HIGH); // Turn on
  }
}
void loop() { delay(1000); }
void helper() { // helper note
  /* multiline
     note */
  work();
}`;

  it("creates a self-contained SVG with source blocks, connections, comments, and full bounds", () => {
    const { svg, diagram } = renderSource(source);
    const selected = svg.querySelector(".flow-node");
    selected.classList.add("is-selected");
    const exported = createExportSvg(svg, diagram.bounds, { includeGrid: true });

    expect(exported.querySelector(".flowchart-content")).not.toBeNull();
    expect(exported.querySelector(".flow-node").hasAttribute("role")).toBe(false);
    expect(exported.querySelector(".flow-node").hasAttribute("tabindex")).toBe(false);
    expect(exported.querySelector(".flow-node").hasAttribute("data-node-id")).toBe(false);
    expect(exported.querySelector(".flow-edge-path").getAttribute("marker-end")).toBe("url(#flow-arrow)");
    expect(exported.querySelector("#flow-arrow")).not.toBeNull();
    expect(exported.querySelector(".flow-comment-text").textContent).toContain("Configure the pin");
    expect(exported.querySelector(".flow-node-label").textContent).toContain("setup");
    expect(exported.querySelector("#flow-export-grid")).not.toBeNull();
    expect(exported.querySelector("style").textContent).toContain(".flow-edge-path");
    expect(exported.querySelector(".is-selected")).toBeNull();
    expect(exported.getAttribute("width")).toBe(`${diagram.bounds.width + 64}px`);
    const legend = createSymbolLegend(svg.querySelector(".flowchart-content"), diagram.bounds.width);
    expect(exported.querySelector(".flow-symbol-legend text").textContent).toBe(
      "Guía de símbolos del diagrama de flujo",
    );
    expect(
      [...exported.querySelectorAll(".flow-legend-footer")].map((line) => line.textContent).join(" "),
    ).toContain("Consulta el código original para conocer todos los detalles de ejecución");
    expect([...exported.querySelectorAll(".flow-legend-description")].map((line) => line.textContent).join(" "))
      .toContain("Representa lecturas, datos recibidos o información presentada.");
    expect(exported.getAttribute("height")).toBe(`${diagram.bounds.height + 96 + legend.height}px`);
    expect(exported.getAttribute("viewBox").split(" ").map(Number)[0]).toBe(diagram.bounds.x - 32);
    expect(Number(exported.getAttribute("viewBox").split(" ")[3])).toBe(
      diagram.bounds.height + 96 + legend.height,
    );
    const legendTranslation = exported
      .querySelector(".flow-symbol-legend")
      .getAttribute("transform")
      .match(/translate\(([-\d.]+) ([-\d.]+)\)/)
      .slice(1)
      .map(Number);
    const viewBox = exported.getAttribute("viewBox").split(" ").map(Number);
    expect(legendTranslation[1]).toBeGreaterThan(diagram.bounds.y + diagram.bounds.height);
    expect(viewBox[1] + viewBox[3]).toBeGreaterThanOrEqual(
      legendTranslation[1] + legend.height + 32,
    );
    expect(legend.symbolKeys).toEqual(
      expect.arrayContaining(["terminal", "decision", "io", "call", "connector", "comment", "flow"]),
    );
    expect(svg.querySelector(".flow-node").classList.contains("is-selected")).toBe(true);
    expect(exported.querySelector("button, foreignObject, script")).toBeNull();
  });

  it("can export without the grid or background", () => {
    const { svg, diagram } = renderSource(source);
    const exported = createExportSvg(svg, diagram.bounds, {
      includeBackground: false,
      includeGrid: false,
      includeLegend: false,
    });
    expect(exported.querySelector(":scope > rect")).toBeNull();
    expect(exported.querySelector("#flow-export-grid")).toBeNull();
    expect(exported.querySelector(".flowchart-content")).not.toBeNull();
    expect(exported.querySelector(".flow-symbol-legend")).toBeNull();
  });

  it("includes the effective visual label in the standalone SVG export", async () => {
    const label = "Encender el LED";
    const { svg, diagram } = renderWithVisualLabel(
      "void setup() { digitalWrite(LED_BUILTIN, HIGH); }",
      label,
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:custom-svg");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const result = await exportSvg(svg, diagram.bounds, "setup");

    expect(await readBlobText(result.blob)).toContain(label);
  });

  it("includes the effective visual label in the rasterized PNG source", async () => {
    const label = "Encender el LED";
    const { svg, diagram } = renderWithVisualLabel(
      "void setup() { digitalWrite(LED_BUILTIN, HIGH); }",
      label,
    );
    const createdBlobs = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      createdBlobs.push(blob);
      return `blob:custom-png-${createdBlobs.length}`;
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    });
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      callback(new Blob(["png"], { type: "image/png" }));
    });
    vi.stubGlobal(
      "Image",
      class {
        set src(value) {
          this.url = value;
          queueMicrotask(() => this.onload());
        }
      },
    );

    const result = await exportPng(svg, diagram.bounds, "setup");

    expect(result.blob.type).toBe("image/png");
    expect(await readBlobText(createdBlobs[0])).toContain(label);
  });

  it("includes the effective visual label in vector PDF pages", async () => {
    const label = "Encender el LED";
    const { svg, diagram } = renderWithVisualLabel(
      "void setup() { digitalWrite(LED_BUILTIN, HIGH); }",
      label,
    );
    const pdf = createPdfStub();
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:custom-pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.useFakeTimers();

    const result = await exportPdf(
      svg,
      diagram.bounds,
      "setup",
      {},
      () => pdf,
      renderPdfStub,
    );

    expect(result.blob.type).toBe("application/pdf");
    expect(pdf.svg.mock.calls[0][0].textContent).toContain(label);
    expect(createUrl).toHaveBeenCalledWith(expect.objectContaining({ type: "application/pdf" }));
    vi.runOnlyPendingTimers();
  });

  it("uses only the implemented shapes and combines equivalent parallelograms", () => {
    const switchSource = `void setup() {
  switch (readValue()) {
    case 1:
      break;
    default:
      return;
  }
}`;
    const { svg, diagram } = renderSource(switchSource);
    const { symbolKeys, element } = createSymbolLegend(
      svg.querySelector(".flowchart-content"),
      diagram.bounds.width,
    );
    const cards = [...element.querySelectorAll(".flow-legend-card")];
    const cardLabels = [...element.querySelectorAll(".flow-legend-label")].map((item) => item.textContent);

    expect(symbolKeys).toContain("ioCase");
    expect(symbolKeys).toContain("control");
    expect(symbolKeys.filter((key) => key === "io" || key === "ioCase")).toHaveLength(1);
    expect(cardLabels).toContain("Entrada/salida y caso");
    expect(cardLabels).toContain("Salto de control");
    expect(cards.length).toBe(symbolKeys.length);
    for (let first = 0; first < cards.length; first += 1) {
      for (let second = first + 1; second < cards.length; second += 1) {
        const a = cards[first];
        const b = cards[second];
        const separated =
          Number(a.getAttribute("x")) + Number(a.getAttribute("width")) <= Number(b.getAttribute("x")) ||
          Number(b.getAttribute("x")) + Number(b.getAttribute("width")) <= Number(a.getAttribute("x")) ||
          Number(a.getAttribute("y")) + Number(a.getAttribute("height")) <= Number(b.getAttribute("y")) ||
          Number(b.getAttribute("y")) + Number(b.getAttribute("height")) <= Number(a.getAttribute("y"));
        expect(separated).toBe(true);
      }
    }
  });

  it("keeps source markup as text and never turns it into executable SVG", () => {
    const unsafeSource = `void setup() {
  // <script onload="alert(1)">not markup</script>
  const char* text = "<image href='https://invalid.example/track'/>";
}`;
    const { svg, diagram } = renderSource(unsafeSource);
    const exported = createExportSvg(svg, diagram.bounds);

    expect(exported.querySelector("script, image, foreignObject, a")).toBeNull();
    expect(exported.textContent).toContain("<script");
    expect(exported.textContent).toContain('onload="alert(1)"');
    expect(exported.textContent).toContain("<image href=");
    expect([...exported.querySelectorAll("*")].some((element) =>
      [...element.attributes].some((attribute) => attribute.name.toLowerCase().startsWith("on")),
    )).toBe(false);
  });

  it.each([
    ["setup", "setup.svg"],
    ["loop", "loop.svg"],
    ["helper", "helper.svg"],
  ])("creates a valid named SVG for %s", async (functionName, filename) => {
    const { svg, diagram } = renderSource(source, functionName);
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:diagram");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.useFakeTimers();

    const result = await exportSvg(svg, diagram.bounds, `${functionName}()`);
    const serialized = serializeSvg(createExportSvg(svg, diagram.bounds));
    const parsed = new DOMParser().parseFromString(serialized, "image/svg+xml");

    expect(result.filename).toBe(filename);
    expect(parsed.documentElement.localName).toBe("svg");
    expect(parsed.querySelector("parsererror")).toBeNull();
    expect(createUrl).toHaveBeenCalledWith(expect.objectContaining({ type: "image/svg+xml;charset=utf-8" }));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(revokeUrl).toHaveBeenCalledWith("blob:diagram");
  });

  it("sanitizes generated filenames without losing readable function names", () => {
    expect(sanitizeFilename("mi función() / test", "pdf")).toBe("mi-funcion-test.pdf");
    expect(sanitizeFilename("../../", "svg")).toBe("diagrama.svg");
    expect(sanitizeFilename("loop", "png")).toBe("loop.png");
  });

  it("fits large diagrams proportionally on an independent technical sheet and includes comments", async () => {
    const statements = Array.from({ length: 240 }, (_, index) => `  work${index}();`).join("\n");
    const largeSource = `void setup() {\n  /* PDF\n     comment */\n${statements}\n}`;
    const { svg, diagram } = renderSource(largeSource);
    const pdf = createPdfStub();
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.useFakeTimers();

    const result = await exportPdf(svg, diagram.bounds, "setup()", {}, () => pdf, renderPdfStub);

    expect(result.filename).toBe("setup.pdf");
    expect(result.pages).toBeGreaterThan(1);
    expect(pdf.svg).toHaveBeenCalledOnce();
    expect(pdf.addPage).toHaveBeenCalledTimes(result.pages - 1);
    expect(pdf.svg.mock.calls[0][0].querySelector(".flow-comment-text").textContent).toContain("PDF");
    expect(pdf.svg.mock.calls[0][0].querySelector(".flow-node").hasAttribute("data-node-id")).toBe(false);
    expect(pdf.svg.mock.calls[0][0].textContent).toContain(
      "Guía de símbolos del diagrama de flujo",
    );
    const renderBox = pdf.svg.mock.calls[0][1];
    expect(renderBox.width / renderBox.height).toBeCloseTo(
      diagram.bounds.width / diagram.bounds.height,
      2,
    );
    expect(createUrl).toHaveBeenCalledWith(expect.objectContaining({ type: "application/pdf" }));
    expect(pdf.output).toHaveBeenCalledWith("blob");
    vi.runOnlyPendingTimers();
  });

  it("includes the selected technical-sheet sections, project metadata, circuit image, and repeated URL", async () => {
    const { svg, diagram } = renderSource(source);
    const circuitSvg = document.createElementNS(SVG_NS, "svg");
    circuitSvg.setAttribute("viewBox", "0 0 800 490");
    circuitSvg.setAttribute("width", "800");
    circuitSvg.setAttribute("height", "490");
    circuitSvg.append(document.createElementNS(SVG_NS, "text"));
    circuitSvg.firstChild.textContent = "Arduino Uno · protoboard · LED";
    const pdf = createPdfStub();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:technical-pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const longCode = Array.from({ length: 140 }, (_, index) => `void task${index}() { digitalWrite(13, HIGH); }`).join("\n");

    const result = await exportPdf(
      svg,
      diagram.bounds,
      "setup()",
      {
        metadata: {
          projectName: "Luz de prueba",
          author: "No especificado",
          date: "2026-11-01",
          description: "Control de un LED",
          version: "v0.8.5",
        },
        sections: { diagram: true, code: true, circuit: true, components: true, connections: true },
        sourceCode: longCode,
        circuitSvg,
        components: [
          { id: "component-1", type: "resistor", properties: { ohms: 220, tolerance: 5, bandCount: 4 } },
          { id: "component-2", type: "led", properties: { color: "rojo" } },
        ],
        wires: [{ from: "arduino:D13", to: "component-1:lead1" }],
        applicationUrl: "https://example.test/cacharreria/diagrama-flujo/",
      },
      () => pdf,
      renderPdfStub,
    );

    expect(result.pages).toBeGreaterThan(6);
    expect(result.filename).toBe("Luz-de-prueba.pdf");
    expect(pdf.svg).toHaveBeenCalledTimes(2);
    expect(pdf.svg.mock.calls[0][0].textContent).toContain("setup()");
    expect(pdf.svg.mock.calls[1][0].textContent).toContain("Arduino Uno · protoboard · LED");
    const renderedSvgText = pdf.svg.mock.calls.map(([pageSvg]) => pageSvg.textContent).join(" ");
    expect(renderedSvgText).toContain("Guía de símbolos del diagrama de flujo");
    expect(renderedSvgText).toContain("Arduino Uno · protoboard · LED");
    const allText = pdf.text.mock.calls.flatMap(([value]) => Array.isArray(value) ? value : [value]).join(" ");
    expect(allText).toContain("Luz de prueba");
    expect(allText).toContain("No especificado");
    expect(allText).toContain("v0.8.5");
    expect(allText).toContain("D13");
    expect(allText).toContain("D1");
    expect(allText).toContain("LED");
    expect(pdf.setPage).toHaveBeenCalledTimes(result.pages);
    expect(allText.match(/https:\/\/example\.test\/cacharreria\/diagrama-flujo\//g)).toHaveLength(result.pages);
  });

  it("normalizes the application URL for root, subdomain, Pages subdirectory, and index URLs", () => {
    expect(getApplicationUrl("https://example.test/?mode=demo#top", "./")).toBe("https://example.test/");
    expect(getApplicationUrl("https://app.example.test/flow/?mode=demo#top", "./"))
      .toBe("https://app.example.test/flow/");
    expect(getApplicationUrl("https://enfaseterminal.github.io/cacharreria/diagrama-flujo/?x=1#svg", "./"))
      .toBe("https://enfaseterminal.github.io/cacharreria/diagrama-flujo/");
    expect(getApplicationUrl("https://app.example.test/flow/index.html?mode=demo#top", "./"))
      .toBe("https://app.example.test/flow/");
    expect(getApplicationUrl("file:///tmp/index.html", "./")).toBe("URL no disponible");
    expect(getApplicationUrl(null, "./")).toBe("URL no disponible");
  });

  it("omits every section disabled by the user", async () => {
    const { svg, diagram } = renderSource(source);
    const pdf = createPdfStub();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:cover-only");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const result = await exportPdf(
      svg,
      diagram.bounds,
      "setup",
      {
        sections: {
          diagram: false,
          code: false,
          circuit: false,
          components: false,
          connections: false,
        },
        sourceCode: source,
        circuitSvg: document.createElementNS(SVG_NS, "svg"),
        components: [{ id: "component-1", type: "led", properties: { color: "rojo" } }],
        wires: [{ from: "arduino:D13", to: "component-1:anode" }],
      },
      () => pdf,
      renderPdfStub,
    );

    expect(result.pages).toBe(1);
    expect(pdf.svg).not.toHaveBeenCalled();
    expect(pdf.addPage).not.toHaveBeenCalled();
    const outputText = pdf.text.mock.calls.flatMap(([value]) => Array.isArray(value) ? value : [value]).join(" ");
    expect(outputText).not.toContain("Diagrama de flujo");
    expect(outputText).not.toContain("Código fuente");
    expect(outputText).not.toContain("Montaje electrónico");
    expect(outputText).not.toContain("Listado de componentes");
    expect(outputText).not.toContain("Conexiones y cableado");
  });

  it("keeps a long public URL complete inside the page footer", async () => {
    const { svg, diagram } = renderSource(source);
    const pdf = createPdfStub();
    const applicationUrl = `https://subdomain.example.test/${"nested-route/".repeat(30)}`;
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:long-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await exportPdf(
      svg,
      diagram.bounds,
      "setup",
      {
        applicationUrl,
        sections: { diagram: false, code: false, circuit: false, components: false, connections: false },
      },
      () => pdf,
      renderPdfStub,
    );

    const footer = pdf.text.mock.calls
      .filter(([, , , options]) => options?.align === "right")
      .map(([text]) => String(text))
      .join("");
    expect(footer).toBe(applicationUrl);
  });

  it("generates the technical sheet with the actual jsPDF and SVG renderer packages", async () => {
    const getBBoxDescriptor = Object.getOwnPropertyDescriptor(SVGElement.prototype, "getBBox");
    Object.defineProperty(SVGElement.prototype, "getBBox", {
      configurable: true,
      value() {
        return { x: 0, y: 0, width: this.textContent.length * 5, height: 12 };
      },
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      font: "",
      measureText: (text) => ({ width: String(text).length * 5 }),
    });
    const { svg, diagram } = renderSource(source);
    const circuitSvg = document.createElementNS(SVG_NS, "svg");
    circuitSvg.setAttribute("viewBox", "0 0 800 490");
    circuitSvg.append(document.createElementNS(SVG_NS, "rect"));
    circuitSvg.firstChild.setAttribute("width", "800");
    circuitSvg.firstChild.setAttribute("height", "490");
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:actual-pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    let result;
    try {
      result = await exportPdf(svg, diagram.bounds, "setup", {
        metadata: { projectName: "Prueba de exportación", date: "2026-11-01" },
        sections: { diagram: true, code: true, circuit: true, components: true, connections: true },
        sourceCode: "void setup() {\n  pinMode(13, OUTPUT);\n}",
        circuitSvg,
        components: [{ id: "component-1", type: "led", properties: { color: "rojo" } }],
        wires: [{ from: "arduino:D13", to: "component-1:anode" }],
        applicationUrl: "https://example.test/flow/",
      });
    } finally {
      if (getBBoxDescriptor) {
        Object.defineProperty(SVGElement.prototype, "getBBox", getBBoxDescriptor);
      } else {
        delete SVGElement.prototype.getBBox;
      }
    }

    expect(result.filename).toBe("Prueba-de-exportacion.pdf");
    expect(result.pages).toBe(6);
    expect(result.blob.type).toBe("application/pdf");
    expect(result.blob.size).toBeGreaterThan(1_000);
  });

  it.each(["setup", "loop", "helper"])("exports the selected %s function as PDF", async (name) => {
    const { svg, diagram } = renderSource(source, name);
    const pdf = createPdfStub();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const result = await exportPdf(svg, diagram.bounds, name, {}, () => pdf, renderPdfStub);

    expect(result.filename).toBe(`${name}.pdf`);
    expect(pdf.svg).toHaveBeenCalledOnce();
    expect(pdf.svg.mock.calls[0][0].textContent).toContain(
      "Guía de símbolos del diagrama de flujo",
    );
    expect(
      [...pdf.svg.mock.calls[0][0].querySelectorAll(".flow-legend-description")]
        .map((line) => line.textContent)
        .join(" "),
    ).toContain("El rectángulo de borde discontinuo identifica la invocación de otra función.");
    expect(pdf.output).toHaveBeenCalledOnce();
  });

  it("plans full-size PDF pages with overlapping boundaries for large content", () => {
    const tiles = planPdfTiles(30_000, 50_000);
    expect(tiles.length).toBeGreaterThan(4);
    expect(tiles[0].x).toBe(0);
    expect(tiles[0].y).toBe(0);
    expect(tiles[1].x).toBeGreaterThan(tiles[0].x);
    expect(tiles[1].y).toBe(0);
    expect(planPdfTiles(600, 800)).toEqual([{ x: 0, y: 0, width: 600, height: 800 }]);
    const firstRow = tiles.filter((tile) => tile.y === 0);
    for (let index = 1; index < firstRow.length; index += 1) {
      expect(firstRow[index].x).toBeLessThanOrEqual(
        firstRow[index - 1].x + firstRow[index - 1].width,
      );
    }
    expect(firstRow.at(-1).x + firstRow.at(-1).width).toBeGreaterThanOrEqual(30_000);
    const lastColumn = tiles.filter((tile) => tile.x === 0);
    for (let index = 1; index < lastColumn.length; index += 1) {
      expect(lastColumn[index].y).toBeLessThanOrEqual(
        lastColumn[index - 1].y + lastColumn[index - 1].height,
      );
    }
    expect(lastColumn.at(-1).y + lastColumn.at(-1).height).toBeGreaterThanOrEqual(50_000);
    expect(() => planPdfTiles(1e12, 1e12)).toThrow("1.000 páginas");
  });

  it("rasterizes to a white high-resolution PNG and releases its temporary canvas and URL", async () => {
    const { svg, diagram } = renderSource(source);
    const context = {
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      fillText: vi.fn(),
      set fillStyle(value) {
        this.lastFill = value;
      },
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: vi.fn((callback) => callback(new Blob(["png"], { type: "image/png" }))),
    };
    vi.spyOn(document, "createElement").mockImplementation((tagName) =>
      tagName === "canvas" ? canvas : document.createElementNS("http://www.w3.org/1999/xhtml", tagName),
    );
    const createdBlobs = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      createdBlobs.push(blob);
      return createdBlobs.length === 1 ? "blob:svg" : "blob:png";
    });
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.stubGlobal(
      "Image",
      class {
        set src(value) {
          this.url = value;
          queueMicrotask(() => this.onload());
        }
      },
    );

    const result = await exportPng(svg, diagram.bounds, "setup", {});

    expect(result.filename).toBe("setup.png");
    expect(result.blob.type).toBe("image/png");
    const serialized = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(createdBlobs[0]);
    });
    expect(serialized).toContain("Guía de símbolos del diagrama de flujo");
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
    expect(context.drawImage).toHaveBeenCalled();
    expect(context.fillRect).toHaveBeenCalledTimes(2);
    expect(context.fillText).toHaveBeenCalledWith(
      expect.stringMatching(/^https?:\/\/localhost(?::\d+)?\/$/),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
    expect(revokeUrl).toHaveBeenCalledWith("blob:svg");
  });

  it("rejects oversized PNGs and cleans up the temporary object URL on conversion failure", async () => {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", "30000px");
    svg.setAttribute("height", "1000px");
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:oversized");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.stubGlobal(
      "Image",
      class {
        set src(value) {
          this.url = value;
          queueMicrotask(() => this.onload());
        }
      },
    );

    await expect(rasterizeSvg(svg)).rejects.toThrow("demasiado grande");
    expect(revokeUrl).toHaveBeenCalledWith("blob:oversized");
  });

  it("releases the temporary PNG URL when an image fails to load", async () => {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", "300px");
    svg.setAttribute("height", "100px");
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:broken");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.stubGlobal(
      "Image",
      class {
        set src(value) {
          this.url = value;
          queueMicrotask(() => this.onerror());
        }
      },
    );

    await expect(rasterizeSvg(svg)).rejects.toThrow("no pudo preparar");
    expect(revokeUrl).toHaveBeenCalledWith("blob:broken");
  });

  it("does not mutate the source SVG and surfaces PDF conversion errors", async () => {
    const { svg, diagram } = renderSource(source);
    const before = svg.outerHTML;
    const pdf = createPdfStub();
    pdf.svg.mockRejectedValue(new Error("conversion failed"));

    await expect(exportPdf(svg, diagram.bounds, "setup", {}, () => pdf, renderPdfStub)).rejects.toThrow(
      "conversion failed",
    );
    expect(svg.outerHTML).toBe(before);
  });

  it("does not export an empty or placeholder SVG", () => {
    const svg = document.createElementNS(SVG_NS, "svg");
    expect(() => createExportSvg(svg, { x: 0, y: 0, width: 10, height: 10 })).toThrow(
      "Genera un diagrama",
    );
  });
});
