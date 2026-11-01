import { appendSymbolLegendDefinitions, createSymbolLegend } from "./symbol-legend.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const EXPORT_MARGIN = 32;
const PDF_MARGIN = 36;
const PDF_POINTS_PER_PIXEL = 0.75;
const PDF_MAX_PAGE_POINTS = 14_400;
const PDF_MAX_PAGES = 1_000;
const PDF_TILE_OVERLAP = 48;
const PNG_MAX_PIXELS = 48_000_000;
const PNG_MAX_SIDE = 20_000;
const SVG_STYLES = `
  text { font-family: Arial, Helvetica, sans-serif; }
  .flow-function-title { fill: #202938; font-size: 19px; font-weight: 700; }
  .flow-function-description { fill: #657187; font-size: 12px; }
  .flow-edge-path { stroke: #738096; stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; }
  .flow-edge-yes .flow-edge-path, .flow-edge-loop-back .flow-edge-path, .flow-edge-loop-repeat .flow-edge-path { stroke: #147d78; }
  .flow-edge-no .flow-edge-path, .flow-edge-loop-exit .flow-edge-path { stroke: #c28139; }
  .flow-edge-loop-back .flow-edge-path, .flow-edge-loop-repeat .flow-edge-path { stroke-dasharray: 6 4; }
  .flow-arrow-head { fill: #738096; }
  .flow-edge-label { fill: #475569; stroke: #ffffff; stroke-width: 5px; stroke-linejoin: round; paint-order: stroke; font-size: 10px; font-weight: 700; }
  .flow-node-shape { fill: #ffffff; stroke: #8390a3; stroke-width: 1.8; }
  .flow-shape-start, .flow-shape-end { fill: #dff3eb; stroke: #2f9b72; }
  .flow-shape-decision { fill: #fff7df; stroke: #ce9c39; }
  .flow-shape-input, .flow-shape-output { fill: #e8f5f2; stroke: #278b7d; }
  .flow-shape-call { stroke: #147d78; stroke-dasharray: 5 3; }
  .flow-shape-case, .flow-shape-connector { fill: #ffffff; stroke: #147d78; }
  .flow-shape-comment, .flow-comment-shape { fill: #fff8df; stroke: #c59c3e; stroke-width: 1.5; stroke-dasharray: 4 3; stroke-linejoin: round; }
  .flow-node-label { fill: #273244; font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 12px; }
  .flow-node-detail { fill: #566276; font-size: 11px; }
  .flow-node-source { fill: #758196; font-size: 10px; }
  .flow-comment-text { fill: #566276; font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 10px; }
`;

function assertSvg(svg) {
  if (!svg || svg.namespaceURI !== SVG_NS || svg.localName !== "svg") {
    throw new TypeError("No hay un diagrama SVG válido para exportar.");
  }
  const content = svg.querySelector(".flowchart-content");
  if (!content) throw new Error("Genera un diagrama antes de exportarlo.");
  return content;
}

function sanitizeClone(root) {
  root.querySelectorAll("script, foreignObject, iframe, object, embed, image, a, animate, set").forEach((element) => {
    element.remove();
  });
  for (const element of [root, ...root.querySelectorAll("*")]) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (
        name.startsWith("on") ||
        name.startsWith("data-") ||
        name.startsWith("aria-") ||
        ["role", "tabindex", "focusable", "contenteditable"].includes(name) ||
        (["href", "xlink:href"].includes(name) && !value.startsWith("#")) ||
        (["fill", "stroke", "filter", "clip-path", "mask", "marker-start", "marker-mid", "marker-end"].includes(name) &&
          value.includes("url(") &&
          !/^url\(#[-\w]+\)$/.test(value))
      ) {
        element.removeAttribute(attribute.name);
      }
    }
    element.classList?.remove("is-selected", "is-simulation-active", "is-simulation-traversed");
  }
}

function appendGrid(defs) {
  const pattern = document.createElementNS(SVG_NS, "pattern");
  pattern.setAttribute("id", "flow-export-grid");
  pattern.setAttribute("width", "24");
  pattern.setAttribute("height", "24");
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M 24 0 L 0 0 0 24");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#dce2e9");
  path.setAttribute("stroke-width", "0.7");
  pattern.append(path);
  defs.append(pattern);
}

function finiteBounds(bounds) {
  if (
    !bounds ||
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    throw new TypeError("Las dimensiones del diagrama no son válidas.");
  }
}

export function createExportSvg(
  svg,
  bounds,
  { includeBackground = true, includeGrid = false, includeLegend = true } = {},
) {
  const content = assertSvg(svg);
  finiteBounds(bounds);

  const x = bounds.x - EXPORT_MARGIN;
  const y = bounds.y - EXPORT_MARGIN;
  const width = bounds.width + EXPORT_MARGIN * 2;
  const diagramHeight = bounds.height + EXPORT_MARGIN * 2;
  const legend = includeLegend ? createSymbolLegend(content, bounds.width) : null;
  const legendGap = legend ? 32 : 0;
  const height = diagramHeight + legendGap + (legend?.height ?? 0);
  const exported = document.createElementNS(SVG_NS, "svg");
  exported.setAttribute("version", "1.1");
  exported.setAttribute("width", `${width}px`);
  exported.setAttribute("height", `${height}px`);
  exported.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
  exported.setAttribute("preserveAspectRatio", "xMinYMin meet");

  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = `Diagrama de flujo: ${content.getAttribute("data-function") || "función"}`;
  exported.append(title);
  const defs = document.createElementNS(SVG_NS, "defs");
  const styles = document.createElementNS(SVG_NS, "style");
  styles.textContent = SVG_STYLES;
  defs.append(styles);
  if (includeLegend) appendSymbolLegendDefinitions(defs);

  const marker = svg.querySelector("#flow-arrow");
  if (marker) defs.append(marker.cloneNode(true));
  if (includeGrid) appendGrid(defs);
  exported.append(defs);

  if (includeBackground) {
    const background = document.createElementNS(SVG_NS, "rect");
    background.setAttribute("x", String(x));
    background.setAttribute("y", String(y));
    background.setAttribute("width", String(width));
    background.setAttribute("height", String(height));
    background.setAttribute("fill", "#ffffff");
    exported.append(background);
  }
  if (includeGrid) {
    const grid = document.createElementNS(SVG_NS, "rect");
    grid.setAttribute("x", String(x));
    grid.setAttribute("y", String(y));
    grid.setAttribute("width", String(width));
    grid.setAttribute("height", String(height));
    grid.setAttribute("fill", "url(#flow-export-grid)");
    exported.append(grid);
  }
  exported.append(content.cloneNode(true));
  if (legend) {
    const separator = document.createElementNS(SVG_NS, "line");
    separator.setAttribute("x1", String(bounds.x));
    separator.setAttribute("x2", String(bounds.x + bounds.width));
    separator.setAttribute("y1", String(bounds.y + bounds.height + 16));
    separator.setAttribute("y2", String(bounds.y + bounds.height + 16));
    separator.setAttribute("stroke", "#aeb9c8");
    separator.setAttribute("stroke-width", "1.5");
    exported.append(separator);
    const legendGroup = legend.element;
    legendGroup.setAttribute(
      "transform",
      `translate(${bounds.x + (bounds.width - legend.width) / 2} ${bounds.y + bounds.height + legendGap})`,
    );
    exported.append(legendGroup);
  }
  sanitizeClone(exported);
  return exported;
}

export function sanitizeFilename(name, extension) {
  const safeName = String(name || "diagrama")
    .replace(/\(\s*\)/g, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 100);
  return `${safeName || "diagrama"}.${extension}`;
}

export function serializeSvg(svg) {
  return new XMLSerializer().serializeToString(svg);
}

function scheduleRevoke(url) {
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadBlob(blob, filename) {
  if (!(blob instanceof Blob) || blob.size === 0) throw new Error("La exportación no generó ningún archivo.");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  try {
    document.body.append(anchor);
    anchor.click();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw new Error(`No se pudo iniciar la descarga: ${error.message}`, { cause: error });
  } finally {
    anchor.remove();
  }
  scheduleRevoke(url);
}

export async function exportSvg(svg, bounds, functionName, options = {}) {
  const documentSvg = createExportSvg(svg, bounds, options);
  const blob = new Blob([serializeSvg(documentSvg)], { type: "image/svg+xml;charset=utf-8" });
  const filename = sanitizeFilename(functionName, "svg");
  downloadBlob(blob, filename);
  return { filename, blob };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("El navegador no pudo preparar el SVG para convertirlo a PNG."));
    image.src = url;
  });
}

export async function rasterizeSvg(svg, { scale = 3, background = true } = {}) {
  if (!Number.isFinite(scale) || scale < 1) throw new RangeError("La escala PNG debe ser un número igual o mayor que 1.");
  await document.fonts?.ready;
  const serialized = serializeSvg(svg);
  const url = URL.createObjectURL(new Blob([serialized], { type: "image/svg+xml;charset=utf-8" }));
  let canvas;
  try {
    const image = await loadImage(url);
    const sourceWidth = Number.parseFloat(svg.getAttribute("width"));
    const sourceHeight = Number.parseFloat(svg.getAttribute("height"));
    const effectiveScale = Math.min(
      scale,
      PNG_MAX_SIDE / sourceWidth,
      PNG_MAX_SIDE / sourceHeight,
      Math.sqrt(PNG_MAX_PIXELS / (sourceWidth * sourceHeight)),
    );
    if (effectiveScale < 1) {
      throw new Error("El diagrama es demasiado grande para PNG. Exporta como SVG o PDF para conservar todos los detalles.");
    }
    canvas = document.createElement("canvas");
    canvas.width = Math.ceil(sourceWidth * effectiveScale);
    canvas.height = Math.ceil(sourceHeight * effectiveScale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("El navegador no pudo crear el lienzo PNG.");
    if (background) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("El navegador no pudo codificar el diagrama como PNG."));
      }, "image/png");
    });
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    URL.revokeObjectURL(url);
  }
}

export async function exportPng(svg, bounds, functionName, options = {}) {
  const exportSvgDocument = createExportSvg(svg, bounds, options);
  const blob = await rasterizeSvg(exportSvgDocument, {
    background: options.includeBackground !== false,
  });
  const filename = sanitizeFilename(functionName, "png");
  downloadBlob(blob, filename);
  return { filename, blob };
}

function tileStarts(length, maximum) {
  if (length <= maximum) return [0];
  const step = maximum - PDF_TILE_OVERLAP;
  const starts = [0];
  while (starts.at(-1) + maximum < length) {
    starts.push(starts.at(-1) + step);
  }
  return starts;
}

export function planPdfTiles(width, height) {
  if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new TypeError("Las dimensiones para PDF no son válidas.");
  }
  const maxTile = (PDF_MAX_PAGE_POINTS - PDF_MARGIN * 2) / PDF_POINTS_PER_PIXEL;
  const step = maxTile - PDF_TILE_OVERLAP;
  const countTiles = (length) => (length <= maxTile ? 1 : Math.ceil((length - maxTile) / step) + 1);
  if (countTiles(width) * countTiles(height) > PDF_MAX_PAGES) {
    throw new Error("El diagrama generaría más de 1.000 páginas PDF. Exporta como SVG o divide el código en funciones.");
  }
  const xStarts = tileStarts(width, maxTile);
  const yStarts = tileStarts(height, maxTile);
  const tiles = yStarts.flatMap((y) =>
    xStarts.map((x) => ({ x, y, width: Math.min(maxTile, width - x), height: Math.min(maxTile, height - y) })),
  );
  return tiles;
}

function createPdfTile(source, tile) {
  const root = source.cloneNode(true);
  root.setAttribute("width", `${tile.width}px`);
  root.setAttribute("height", `${tile.height}px`);
  root.setAttribute("viewBox", `${tile.x} ${tile.y} ${tile.width} ${tile.height}`);
  return root;
}

export async function exportPdf(
  svg,
  bounds,
  functionName,
  options = {},
  pdfFactory,
  renderSvg,
) {
  if (!pdfFactory || !renderSvg) {
    const [jspdfModule, svg2pdfModule] = await Promise.all([
      pdfFactory ? Promise.resolve(null) : import("jspdf"),
      renderSvg ? Promise.resolve(null) : import("svg2pdf.js/dist/svg2pdf.es.min.js"),
    ]);
    pdfFactory ??= (config) => new jspdfModule.jsPDF(config);
    renderSvg ??= svg2pdfModule.svg2pdf;
  }
  const fullExport = createExportSvg(svg, bounds, options);
  const diagramOnly = createExportSvg(svg, bounds, { ...options, includeLegend: false });
  const diagramWidth = Number.parseFloat(diagramOnly.getAttribute("width"));
  const diagramHeight = Number.parseFloat(diagramOnly.getAttribute("height"));
  const diagramTiles = planPdfTiles(diagramWidth, diagramHeight);
  const fullTiles = planPdfTiles(
    Number.parseFloat(fullExport.getAttribute("width")),
    Number.parseFloat(fullExport.getAttribute("height")),
  );
  const useCombinedPage = diagramTiles.length === 1 && fullTiles.length === 1;
  const source = useCombinedPage ? fullExport : diagramOnly;
  const tiles = useCombinedPage ? fullTiles : diagramTiles;
  const filename = sanitizeFilename(functionName, "pdf");
  const legend = fullExport.querySelector(".flow-symbol-legend");
  const legendWidth = legend
    ? createSymbolLegend(fullExport.querySelector(".flowchart-content"), bounds.width).width
    : 0;
  const legendHeight = legend
    ? Number.parseFloat(fullExport.getAttribute("height")) -
      Number.parseFloat(diagramOnly.getAttribute("height")) -
      32
    : 0;
  const legendPageHeight = legendHeight + EXPORT_MARGIN * 2;
  const legendPageWidth = legendWidth + EXPORT_MARGIN * 2;
  const legendPage = legend
    ? createLegendPageSvg(legend, legendPageHeight, legendPageWidth, options)
    : null;
  const pages = tiles.length + (source === diagramOnly && legendPage ? 1 : 0);
  const firstTile = tiles[0];
  const firstWidth = firstTile.width * PDF_POINTS_PER_PIXEL + PDF_MARGIN * 2;
  const firstHeight = firstTile.height * PDF_POINTS_PER_PIXEL + PDF_MARGIN * 2;
  const pdf = pdfFactory({
    orientation: firstWidth > firstHeight ? "landscape" : "portrait",
    unit: "pt",
    format: [firstWidth, firstHeight],
    compress: true,
  });

  for (const [index, tile] of tiles.entries()) {
    if (index > 0) {
      const pageWidth = tile.width * PDF_POINTS_PER_PIXEL + PDF_MARGIN * 2;
      const pageHeight = tile.height * PDF_POINTS_PER_PIXEL + PDF_MARGIN * 2;
      pdf.addPage([pageWidth, pageHeight], pageWidth > pageHeight ? "landscape" : "portrait");
    }
    const pageSvg = createPdfTile(source, tile);
    sanitizeClone(pageSvg);
    await renderSvg(pageSvg, pdf, {
      x: PDF_MARGIN,
      y: PDF_MARGIN,
      width: tile.width * PDF_POINTS_PER_PIXEL,
      height: tile.height * PDF_POINTS_PER_PIXEL,
    });
    if (pages > 1) {
      const pageHeight = tile.height * PDF_POINTS_PER_PIXEL + PDF_MARGIN * 2;
      pdf.setFontSize(8);
      pdf.setTextColor(100);
      pdf.text(`${functionName} - pagina ${index + 1} de ${pages}`, PDF_MARGIN, pageHeight - 12);
    }
  }

  if (source === diagramOnly && legendPage) {
    const pageWidth = legendPageWidth * PDF_POINTS_PER_PIXEL + PDF_MARGIN * 2;
    const pageHeight = legendPageHeight * PDF_POINTS_PER_PIXEL + PDF_MARGIN * 2;
    pdf.addPage([pageWidth, pageHeight], pageWidth > pageHeight ? "landscape" : "portrait");
    await renderSvg(legendPage, pdf, {
      x: PDF_MARGIN,
      y: PDF_MARGIN,
      width: legendPageWidth * PDF_POINTS_PER_PIXEL,
      height: legendPageHeight * PDF_POINTS_PER_PIXEL,
    });
    pdf.setFontSize(8);
    pdf.setTextColor(100);
    pdf.text(`${functionName} - pagina ${pages} de ${pages}`, PDF_MARGIN, pageHeight - 12);
  }

  const blob = pdf.output("blob");
  if (!(blob instanceof Blob) || blob.size === 0) throw new Error("No se pudo generar el PDF.");
  downloadBlob(blob, filename);
  return { filename, blob, pages };
}

function createLegendPageSvg(legend, height, width, { includeBackground = true, includeGrid = false } = {}) {
  const page = document.createElementNS(SVG_NS, "svg");
  const x = -EXPORT_MARGIN;
  const y = -EXPORT_MARGIN;
  page.setAttribute("width", `${width}px`);
  page.setAttribute("height", `${height}px`);
  page.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
  const defs = document.createElementNS(SVG_NS, "defs");
  const style = document.createElementNS(SVG_NS, "style");
  style.textContent = SVG_STYLES;
  appendSymbolLegendDefinitions(defs);
  if (includeGrid) appendGrid(defs);
  defs.append(style);
  page.append(defs);
  if (includeBackground) {
    const background = document.createElementNS(SVG_NS, "rect");
    background.setAttribute("x", String(x));
    background.setAttribute("y", String(y));
    background.setAttribute("width", String(width));
    background.setAttribute("height", String(height));
    background.setAttribute("fill", "#ffffff");
    page.append(background);
  }
  if (includeGrid) {
    const grid = document.createElementNS(SVG_NS, "rect");
    grid.setAttribute("x", String(x));
    grid.setAttribute("y", String(y));
    grid.setAttribute("width", String(width));
    grid.setAttribute("height", String(height));
    grid.setAttribute("fill", "url(#flow-export-grid)");
    page.append(grid);
  }
  const clone = legend.cloneNode(true);
  clone.setAttribute("transform", "translate(0 0)");
  page.append(clone);
  sanitizeClone(page);
  return page;
}

export const EXPORT_IMPLEMENTED = true;
