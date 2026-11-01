const SVG_NS = "http://www.w3.org/2000/svg";

const LEGEND_STYLES = `
  .flow-legend-title { fill: #202938; font-family: Arial, Helvetica, sans-serif; font-size: 19px; font-weight: 700; }
  .flow-legend-subtitle { fill: #657187; font-family: Arial, Helvetica, sans-serif; font-size: 11px; }
  .flow-legend-card { fill: #ffffff; stroke: #d7dee8; stroke-width: 1; }
  .flow-legend-label { fill: #273244; font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 700; }
  .flow-legend-description { fill: #566276; font-family: Arial, Helvetica, sans-serif; font-size: 10px; }
  .flow-legend-line { fill: none; stroke: #738096; stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; }
  .flow-legend-arrow { fill: #738096; }
  .flow-legend-shape { fill: #ffffff; stroke: #8390a3; stroke-width: 1.8; }
  .flow-legend-terminal { fill: #dff3eb; stroke: #2f9b72; }
  .flow-legend-decision { fill: #fff7df; stroke: #ce9c39; }
  .flow-legend-io { fill: #e8f5f2; stroke: #278b7d; }
  .flow-legend-connector { fill: #ffffff; stroke: #147d78; }
  .flow-legend-call { stroke: #147d78; stroke-dasharray: 5 3; }
  .flow-legend-comment { fill: #fff8df; stroke: #c59c3e; stroke-dasharray: 4 3; }
  .flow-legend-footer { fill: #657187; font-family: Arial, Helvetica, sans-serif; font-size: 10px; }
`;

const FOOTER_NOTE =
  "Los símbolos representan de forma simplificada el flujo del programa. Consulta el código original para conocer todos los detalles de ejecución";

const SYMBOLS = {
  terminal: {
    label: "Inicio y fin",
    description: "Delimitan el comienzo o la finalización de la función.",
    shape: "terminal",
  },
  process: {
    label: "Proceso",
    description: "Representa una instrucción u operación del programa.",
    shape: "process",
  },
  decision: {
    label: "Decisión",
    description: "Evalúa una condición y ofrece rutas alternativas, como Sí y No.",
    shape: "decision",
  },
  io: {
    label: "Entrada y salida",
    description: "Representa lecturas, datos recibidos o información presentada.",
    shape: "io",
  },
  ioCase: {
    label: "Entrada/salida y caso",
    description: "El paralelogramo representa E/S; en switch, case o default identifica una alternativa.",
    shape: "io",
  },
  call: {
    label: "Llamada a función",
    description: "El rectángulo de borde discontinuo identifica la invocación de otra función.",
    shape: "call",
  },
  connector: {
    label: "Conector",
    description: "Une diferentes partes del diagrama, por ejemplo, las ramas de una decisión.",
    shape: "connector",
  },
  comment: {
    label: "Comentario",
    description: "Anotación del código original; aporta contexto y no es una instrucción ejecutable.",
    shape: "comment",
  },
  flow: {
    label: "Línea de flujo",
    description: "La flecha indica la dirección y el orden de ejecución.",
    shape: "flow",
  },
  control: {
    label: "Salto de control",
    description: "return termina la función; break sale del bucle o switch y continue pasa a la siguiente iteración.",
    shape: "control",
  },
};

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function textElement(parent, value, attributes) {
  const text = svgElement("text", attributes);
  text.textContent = value;
  parent.append(text);
  return text;
}

function wrapText(text, maxCharacters) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && candidate.length > maxCharacters) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function shapesInDiagram(content) {
  const classes = new Set(
    [...content.querySelectorAll(".flow-node")].flatMap((node) =>
      [...node.classList].filter((className) => className.startsWith("flow-node-")),
    ),
  );
  const edgeTypes = new Set(
    [...content.querySelectorAll(".flow-edge")].flatMap((edge) =>
      [...edge.classList].filter((className) => className.startsWith("flow-edge-")),
    ),
  );
  const symbols = [];
  const has = (kind) => classes.has(`flow-node-${kind}`);
  if (has("start") || has("end")) symbols.push("terminal");
  if (has("process")) symbols.push("process");
  if (has("decision")) symbols.push("decision");
  if (has("input") || has("output")) symbols.push(has("case") ? "ioCase" : "io");
  if (has("call")) symbols.push("call");
  if (has("connector")) symbols.push("connector");
  if (has("case") && !has("input") && !has("output")) symbols.push("ioCase");
  if (has("comment") || content.querySelector(".flow-comment-note")) symbols.push("comment");
  if (edgeTypes.size) symbols.push("flow");
  if (["break", "continue", "return"].some((type) => edgeTypes.has(`flow-edge-${type}`))) {
    symbols.push("control");
  }
  return symbols;
}

function drawSymbol(parent, kind, x, centerY) {
  const cy = centerY;
  if (kind === "flow" || kind === "control") {
    const line = svgElement("path", {
      d: kind === "control"
        ? `M ${x} ${cy - 7} H ${x + 38} V ${cy + 7} H ${x + 56}`
        : `M ${x} ${cy} H ${x + 52}`,
      class: "flow-legend-line",
      "marker-end": "url(#flow-legend-arrow)",
    });
    parent.append(line);
    return;
  }

  const className = `flow-legend-shape${kind === "terminal" ? " flow-legend-terminal" : ""}${kind === "decision" ? " flow-legend-decision" : ""}${kind === "io" || kind === "case" ? " flow-legend-io" : ""}${kind === "call" ? " flow-legend-call" : ""}${kind === "comment" ? " flow-legend-comment" : ""}`;
  if (kind === "terminal" || kind === "process" || kind === "call") {
    parent.append(svgElement("rect", {
      x,
      y: cy - 11,
      width: 58,
      height: 22,
      rx: kind === "terminal" ? 11 : kind === "call" ? 5 : 2,
      class: className,
    }));
  } else if (kind === "decision") {
    parent.append(svgElement("polygon", {
      points: `${x + 29},${cy - 14} ${x + 58},${cy} ${x + 29},${cy + 14} ${x},${cy}`,
      class: className,
    }));
  } else if (kind === "connector") {
    parent.append(svgElement("circle", {
      cx: x + 29,
      cy,
      r: 11,
      class: "flow-legend-shape flow-legend-connector",
    }));
  } else if (kind === "comment") {
    parent.append(svgElement("path", {
      d: `M ${x} ${cy - 11} H ${x + 47} L ${x + 58} ${cy} V ${cy + 11} H ${x} Z M ${x + 47} ${cy - 11} V ${cy} H ${x + 58}`,
      class: className,
    }));
  } else {
    parent.append(svgElement("polygon", {
      points: `${x + 7},${cy - 11} ${x + 58},${cy - 11} ${x + 51},${cy + 11} ${x},${cy + 11}`,
      class: className,
    }));
  }
}

function createRow(parent, key, x, y, width, maxCharacters) {
  const symbol = SYMBOLS[key];
  const lines = wrapText(symbol.description, maxCharacters);
  const height = Math.max(54, 35 + lines.length * 13);
  parent.append(svgElement("rect", {
    x,
    y,
    width,
    height,
    rx: 6,
    class: "flow-legend-card",
  }));
  drawSymbol(parent, symbol.shape, x + 10, y + height / 2);
  textElement(parent, symbol.label, {
    x: x + 78,
    y: y + 18,
    class: "flow-legend-label",
  });
  lines.forEach((line, index) => {
    textElement(parent, line, {
      x: x + 78,
      y: y + 34 + index * 13,
      class: "flow-legend-description",
    });
  });
  return height;
}

export function appendSymbolLegendDefinitions(parent) {
  const styles = svgElement("style");
  styles.textContent = LEGEND_STYLES;
  const marker = svgElement("marker", {
    id: "flow-legend-arrow",
    viewBox: "0 0 10 10",
    refX: 9,
    refY: 5,
    markerWidth: 7,
    markerHeight: 7,
    markerUnits: "userSpaceOnUse",
    orient: "auto",
  });
  marker.append(svgElement("path", {
    d: "M 0 0 L 10 5 L 0 10 z",
    class: "flow-legend-arrow",
  }));
  parent.append(styles, marker);
}

export function createSymbolLegend(content, diagramWidth) {
  const symbols = shapesInDiagram(content);
  const width = Math.max(1, Math.min(1280, diagramWidth));
  const columns = width >= 760 ? 2 : 1;
  const gap = 12;
  const columnWidth = (width - gap * (columns - 1)) / columns;
  const maxCharacters = Math.max(24, Math.floor((columnWidth - 92) / 5.4));
  const rows = [];
  for (let index = 0; index < symbols.length; index += columns) {
    rows.push(symbols.slice(index, index + columns));
  }
  const rowHeights = rows.map((row) =>
    Math.max(...row.map((key) => 35 + wrapText(SYMBOLS[key].description, maxCharacters).length * 13), 54),
  );
  const footerLines = wrapText(FOOTER_NOTE, Math.max(24, Math.floor(width / 5.5)));
  const contentStart = 72;
  const height =
    contentStart +
    rowHeights.reduce((sum, rowHeight) => sum + rowHeight + 8, 0) +
    25 +
    footerLines.length * 13;
  const group = svgElement("g", { class: "flow-symbol-legend" });

  textElement(group, "Guía de símbolos del diagrama de flujo", {
    x: 0,
    y: 22,
    class: "flow-legend-title",
  });
  textElement(group, "Material de referencia educativo", {
    x: 0,
    y: 42,
    class: "flow-legend-subtitle",
  });
  group.append(svgElement("line", {
    x1: 0,
    y1: 0,
    x2: width,
    y2: 0,
    stroke: "#aeb9c8",
    "stroke-width": 1.5,
  }));
  group.append(svgElement("line", {
    x1: 0,
    y1: 54,
    x2: width,
    y2: 54,
    stroke: "#d7dee8",
    "stroke-width": 1,
  }));

  let y = contentStart;
  rows.forEach((row, rowIndex) => {
    row.forEach((key, columnIndex) => {
      createRow(group, key, columnIndex * (columnWidth + gap), y, columnWidth, maxCharacters);
    });
    y += rowHeights[rowIndex] + 8;
  });
  footerLines.forEach((line, index) => {
    textElement(group, line, {
      x: 0,
      y: y + 13 + index * 13,
      class: "flow-legend-footer",
    });
  });

  group.setAttribute("data-legend-height", String(height));
  return { element: group, height, width, symbolKeys: symbols };
}
