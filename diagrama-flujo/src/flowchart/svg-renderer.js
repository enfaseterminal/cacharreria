const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_VIEWBOX = { x: -600, y: -400, width: 1200, height: 800 };

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) element.setAttribute(key, String(value));
  }
  return element;
}

function textElement(parent, value, attributes = {}) {
  const text = svgElement("text", attributes);
  text.textContent = String(value ?? "");
  parent.append(text);
  return text;
}

function lineText(parent, lines, x, firstY, lineHeight, className, anchor = "middle") {
  const text = svgElement("text", { x, y: firstY, "text-anchor": anchor, class: className });
  lines.forEach((line, index) => {
    const span = svgElement("tspan", { x, dy: index === 0 ? 0 : lineHeight });
    span.textContent = line;
    text.append(span);
  });
  parent.append(text);
  return text;
}

function removeGenerated(svg) {
  svg.querySelectorAll(".flowchart-content, .diagram-placeholder").forEach((element) => element.remove());
}

function ensureArrowMarker(svg) {
  const defs = svg.querySelector("defs");
  if (!defs) return;
  defs.querySelector("#flow-arrow")?.remove();
  const marker = svgElement("marker", {
    id: "flow-arrow",
    viewBox: "0 0 10 10",
    refX: 9,
    refY: 5,
    markerWidth: 8,
    markerHeight: 8,
    markerUnits: "userSpaceOnUse",
    orient: "auto",
  });
  marker.append(svgElement("path", { d: "M 0 0 L 10 5 L 0 10 z", class: "flow-arrow-head" }));
  defs.append(marker);
}

function edgePath(edge, diagram, from, to) {
  const startBottom = { x: from.centerX, y: from.y + from.height };
  const targetTop = { x: to.centerX, y: to.y };

  if (edge.type === "yes" || edge.type === "no") {
    const isYes = edge.type === "yes";
    const start = {
      x: from.centerX + (isYes ? from.shapeWidth : -from.shapeWidth) / 2,
      y: from.centerY,
    };
    const laneX = from.centerX + (isYes ? 1 : -1) * (from.width / 2 + 14);
    const routeY = targetTop.y - 12;
    return {
      d: `M ${start.x} ${start.y} H ${laneX} V ${routeY} H ${targetTop.x} V ${targetTop.y}`,
      labelX: laneX,
      labelY: start.y - 8,
    };
  }

  if (edge.type === "loop-exit") {
    const laneX = from.loopExitX ?? from.x - 28;
    return {
      d: `M ${from.centerX - from.shapeWidth / 2} ${from.centerY} H ${laneX} V ${targetTop.y - 14} H ${targetTop.x} V ${targetTop.y}`,
      labelX: laneX,
      labelY: from.centerY - 8,
    };
  }

  if (["break", "continue", "return", "warning"].includes(edge.type)) {
    const laneX = diagram.width - 26 - ((edge.routeLane ?? 1) - 1) * 22;
    const sourceX = from.centerX + from.shapeWidth / 2;
    const targetX = to.centerX + to.shapeWidth / 2;
    return {
      d: `M ${sourceX} ${from.centerY} H ${laneX} V ${to.centerY} H ${targetX}`,
      labelX: laneX,
      labelY: (from.centerY + to.centerY) / 2,
    };
  }

  if (edge.type === "loop-back") {
    const laneX = diagram.width - 26 - ((edge.routeLane ?? 1) - 1) * 22;
    return {
      d: `M ${startBottom.x} ${startBottom.y} H ${laneX} V ${targetTop.y - 16} H ${targetTop.x} V ${targetTop.y}`,
      labelX: laneX,
      labelY: (startBottom.y + targetTop.y) / 2,
    };
  }

  if (edge.type === "loop-repeat") {
    const laneX = 12 + ((edge.routeLane ?? 1) - 1) * 22;
    return {
      d: `M ${from.x} ${from.centerY} H ${laneX} V ${to.centerY} H ${to.x}`,
      labelX: laneX,
      labelY: (from.centerY + to.centerY) / 2,
    };
  }

  if (edge.type === "dispatch") {
    const laneX = (from.dispatchBaseX ?? from.x - 20) + (edge.routeIndex ?? 0) * 20;
    return {
      d: `M ${from.x} ${from.centerY} H ${laneX} V ${to.centerY} H ${to.x}`,
      labelX: laneX,
      labelY: to.centerY - 8,
    };
  }

  if (edge.type === "switch-no-match") {
    const laneX = (from.dispatchBaseX ?? from.x - 20) - 10;
    return {
      d: `M ${from.centerX - from.shapeWidth / 2} ${from.centerY} H ${laneX} V ${targetTop.y - 12} H ${targetTop.x} V ${targetTop.y}`,
      labelX: laneX,
      labelY: from.centerY - 8,
    };
  }

  if (targetTop.y < startBottom.y) {
    const laneX = Math.max(from.x + from.width, to.x + to.width) + 22;
    return {
      d: `M ${startBottom.x} ${startBottom.y} H ${laneX} V ${targetTop.y - 12} H ${targetTop.x} V ${targetTop.y}`,
      labelX: laneX,
      labelY: (startBottom.y + targetTop.y) / 2,
    };
  }

  const midY = startBottom.y + Math.max(12, (targetTop.y - startBottom.y) / 2);
  return {
    d: `M ${startBottom.x} ${startBottom.y} V ${midY} H ${targetTop.x} V ${targetTop.y}`,
    labelX: (startBottom.x + targetTop.x) / 2,
    labelY: midY - 7,
  };
}

function renderEdge(parent, edge, diagram, nodes) {
  const from = nodes.get(edge.from);
  const to = nodes.get(edge.to);
  if (!from || !to) return;
  const route = edgePath(edge, diagram, from, to);
  const group = svgElement("g", { class: `flow-edge flow-edge-${edge.type}`, "data-edge-id": edge.id });
  group.append(
    svgElement("path", {
      d: route.d,
      class: "flow-edge-path",
      fill: "none",
      "marker-end": "url(#flow-arrow)",
    }),
  );
  if (edge.label) {
    textElement(group, edge.label, {
      x: route.labelX,
      y: route.labelY,
      class: "flow-edge-label",
      "text-anchor": "middle",
    });
  }
  parent.append(group);
}

function polygonPoints(kind, x, y, width, height) {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  if (kind === "decision") {
    return `${centerX},${y} ${x + width},${centerY} ${centerX},${y + height} ${x},${centerY}`;
  }
  if (kind === "input") {
    const offset = Math.min(24, width * 0.13);
    return `${x + offset},${y} ${x + width},${y} ${x + width - offset},${y + height} ${x},${y + height}`;
  }
  const corner = 12;
  return `${x + corner},${y} ${x + width},${y} ${x + width - corner},${y + height} ${x},${y + height}`;
}

function addShape(group, node) {
  const shapeX = node.centerX - node.shapeWidth / 2;
  const shapeY = node.y;
  const shapeAttributes = { class: `flow-node-shape flow-shape-${node.kind}` };
  if (node.kind === "start" || node.kind === "end") {
    group.append(
      svgElement("rect", {
        ...shapeAttributes,
        x: shapeX,
        y: shapeY,
        width: node.shapeWidth,
        height: node.shapeHeight,
        rx: node.shapeHeight / 2,
      }),
    );
    return;
  }
  if (node.kind === "decision" || node.kind === "input" || node.kind === "output" || node.kind === "case") {
    group.append(
      svgElement("polygon", {
        ...shapeAttributes,
        points: polygonPoints(node.kind, shapeX, shapeY, node.shapeWidth, node.shapeHeight),
      }),
    );
    return;
  }
  if (node.kind === "connector") {
    group.append(
      svgElement("circle", {
        ...shapeAttributes,
        cx: node.centerX,
        cy: node.y + node.shapeHeight / 2,
        r: Math.max(17, node.shapeHeight / 2 - 3),
      }),
    );
    return;
  }
  if (node.kind === "comment") {
    const fold = 14;
    group.append(
      svgElement("path", {
        ...shapeAttributes,
        d: `M ${shapeX} ${shapeY} H ${shapeX + node.shapeWidth - fold} L ${shapeX + node.shapeWidth} ${shapeY + fold} V ${shapeY + node.shapeHeight} H ${shapeX} Z M ${shapeX + node.shapeWidth - fold} ${shapeY} V ${shapeY + fold} H ${shapeX + node.shapeWidth}`,
      }),
    );
    return;
  }
  group.append(
    svgElement("rect", {
      ...shapeAttributes,
      x: shapeX,
      y: shapeY,
      width: node.shapeWidth,
      height: node.shapeHeight,
      rx: node.kind === "call" ? 9 : 4,
    }),
  );
}

function renderCommentNote(parent, comment, x, y, width) {
  const group = svgElement("g", {
    class: `flow-comment-note flow-comment-${comment.commentType ?? "line"}`,
    "data-comment-id": comment.id,
    "data-comment-relation": comment.relation ?? "independent",
    "data-start-line": comment.startLine,
  });
  const height = comment.height;
  const fold = 13;
  group.append(
    svgElement("path", {
      d: `M ${x} ${y} H ${x + width - fold} L ${x + width} ${y + fold} V ${y + height} H ${x} Z M ${x + width - fold} ${y} V ${y + fold} H ${x + width}`,
      class: "flow-comment-shape",
    }),
  );
  lineText(group, comment.lines, x + width / 2, y + 20, 15, "flow-comment-text");
  parent.append(group);
}

function activateNode(svg, nodeId) {
  const event = new document.defaultView.CustomEvent("flowchartselect", {
    bubbles: true,
    detail: { nodeId },
  });
  svg.dispatchEvent(event);
}

function renderNode(parent, node, { showComments, tabIndex }) {
  if (node.kind === "comment" && !showComments) return;
  const nodeType = node.astType ?? `Bloque ${node.kind}`;
  const lineLabel = node.startLine === node.endLine
    ? `línea ${node.startLine}`
    : `líneas ${node.startLine}-${node.endLine}`;
  const group = svgElement("g", {
    class: `flow-node flow-node-${node.kind}`,
    role: "button",
    tabindex: tabIndex,
    "aria-label": `${nodeType}, ${lineLabel}. ${node.label}${node.sourceNavigable ? ". Activar para navegar al código." : "."}`,
    "aria-pressed": "false",
    "aria-keyshortcuts": "Enter Space ArrowUp ArrowDown",
    "data-node-id": node.id,
    "data-ast-node-id": node.astNodeId ?? "",
    "data-ast-type": node.astType ?? "",
    "data-start-line": node.startLine,
    "data-end-line": node.endLine,
    "data-function": node.functionName ?? "",
    "data-source-navigable": String(Boolean(node.sourceNavigable)),
  });
  const title = svgElement("title");
  title.textContent = `${node.label} · líneas ${node.startLine}-${node.endLine}`;
  group.append(title);
  addShape(group, node);

  if (node.kind === "connector") {
    textElement(group, node.label, {
      x: node.centerX,
      y: node.y + node.shapeHeight / 2 + 5,
      class: "flow-node-label flow-connector-label",
      "text-anchor": "middle",
    });
  } else {
    const labelHeight = node.labelLines.length * 17;
    const detailHeight = node.detailLines.length ? 15 + node.detailLines.length * 13 : 0;
    const combinedHeight = labelHeight + detailHeight;
    let firstY = node.y + (node.shapeHeight - combinedHeight) / 2 + 13;
    if (node.kind === "comment") firstY = node.y + 21;
    lineText(group, node.labelLines, node.centerX, firstY, 17, "flow-node-label");
    if (node.detailLines.length) {
      lineText(
        group,
        node.detailLines,
        node.centerX,
        firstY + labelHeight + 10,
        13,
        "flow-node-detail",
      );
    }
    if (node.kind !== "comment") {
      textElement(group, `L${node.startLine}${node.endLine !== node.startLine ? `–${node.endLine}` : ""}`, {
        x: node.centerX,
        y: node.y + node.shapeHeight - 7,
        class: "flow-node-source",
        "text-anchor": "middle",
      });
    }
  }
  parent.append(group);
  group.addEventListener("click", () => activateNode(parent.ownerSVGElement, node.id));
  group.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activateNode(parent.ownerSVGElement, node.id);
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const nodes = [...parent.ownerSVGElement.querySelectorAll(".flow-node")];
    const index = nodes.indexOf(group);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = nodes[(index + step + nodes.length) % nodes.length];
    nodes.forEach((item) => item.setAttribute("tabindex", item === next ? "0" : "-1"));
    next.focus();
  });

  if (showComments) {
    let noteY = node.y + node.shapeHeight + 8;
    for (const comment of node.commentLayouts ?? []) {
      renderCommentNote(
        parent,
        comment,
        node.centerX - comment.width / 2,
        noteY,
        comment.width,
      );
      noteY += comment.height + 6;
    }
  }
}

function updateBackground(svg, bounds) {
  const background = svg.querySelector(".diagram-background");
  if (!background) return;
  background.setAttribute("x", String(bounds.x - 120));
  background.setAttribute("y", String(bounds.y - 100));
  background.setAttribute("width", String(bounds.width + 240));
  background.setAttribute("height", String(bounds.height + 200));
}

export function renderDiagramMessage(svg, message) {
  removeGenerated(svg);
  const bounds = { x: -600, y: -400, width: 1200, height: 800 };
  updateBackground(svg, bounds);
  const group = svgElement("g", { class: "diagram-placeholder" });
  textElement(group, "Arduino Flowchart", { x: 0, y: -20, class: "placeholder-title", "text-anchor": "middle" });
  textElement(group, message, { x: 0, y: 16, class: "placeholder-copy", "text-anchor": "middle" });
  svg.append(group);
  svg.querySelector("#svg-title")?.replaceChildren(document.createTextNode("Área de visualización del diagrama"));
  svg.querySelector("#svg-description")?.replaceChildren(document.createTextNode(message));
  return bounds;
}

export function renderFlowchart(svg, diagram, { showComments = true } = {}) {
  if (!svg || svg.namespaceURI !== SVG_NS) throw new TypeError("Se esperaba un elemento SVG.");
  if (!diagram || !Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges)) {
    throw new TypeError("Se esperaba una representación de diagrama válida.");
  }
  if (
    !Number.isFinite(diagram.width) ||
    !Number.isFinite(diagram.height) ||
    diagram.nodes.some((node) =>
      ![node.x, node.y, node.width, node.height, node.centerX, node.centerY].every(Number.isFinite),
    )
  ) {
    throw new TypeError("El diagrama debe distribuirse antes de renderizarlo.");
  }
  removeGenerated(svg);
  ensureArrowMarker(svg);

  const bounds = diagram.bounds ?? { x: 0, y: 0, width: diagram.width, height: diagram.height };
  updateBackground(svg, bounds);
  const group = svgElement("g", { class: "flowchart-content", "data-function": diagram.functionName });
  const heading = svgElement("g", { class: "flowchart-heading" });
  const centerX = diagram.width / 2;
  textElement(heading, diagram.title, {
    x: centerX,
    y: 27,
    class: "flow-function-title",
    "text-anchor": "middle",
  });
  textElement(heading, diagram.description, {
    x: centerX,
    y: 48,
    class: "flow-function-description",
    "text-anchor": "middle",
  });
  group.append(heading);

  const nodes = new Map(diagram.nodes.map((node) => [node.id, node]));
  const edgesGroup = svgElement("g", { class: "flow-edges" });
  for (const edge of diagram.edges) renderEdge(edgesGroup, edge, diagram, nodes);
  group.append(edgesGroup);

  const nodesGroup = svgElement("g", { class: "flow-nodes" });
  const visibleNodes = diagram.nodes.filter((node) => node.kind !== "comment" || showComments);
  visibleNodes.forEach((node, index) =>
    renderNode(nodesGroup, node, { showComments, tabIndex: index === 0 ? 0 : -1 }),
  );
  group.append(nodesGroup);
  svg.append(group);

  svg.querySelector("#svg-title")?.replaceChildren(
    document.createTextNode(`Diagrama de flujo: ${diagram.title}`),
  );
  svg.querySelector("#svg-description")?.replaceChildren(
    document.createTextNode(
      `${diagram.description} ${diagram.nodes.length} bloques y ${diagram.edges.length} conexiones.`,
    ),
  );
  return bounds;
}

export function selectFlowNode(svg, nodeId, { focus = false } = {}) {
  const nodes = [...svg.querySelectorAll(".flow-node")];
  let selected = null;
  for (const node of nodes) {
    const isSelected = Boolean(nodeId) && node.dataset.nodeId === nodeId;
    node.classList.toggle("is-selected", isSelected);
    node.setAttribute("aria-pressed", String(isSelected));
    node.setAttribute("tabindex", isSelected ? "0" : "-1");
    if (isSelected) selected = node;
  }
  if (!selected && nodes.length) nodes[0].setAttribute("tabindex", "0");
  if (focus && selected) selected.focus({ preventScroll: true });
  return selected;
}

export function highlightSimulationFlow(svg, nodeId, edgeId) {
  for (const node of svg.querySelectorAll(".flow-node")) {
    node.classList.toggle("is-simulation-active", Boolean(nodeId) && node.dataset.nodeId === nodeId);
  }
  for (const edge of svg.querySelectorAll(".flow-edge")) {
    edge.classList.toggle("is-simulation-traversed", Boolean(edgeId) && edge.dataset.edgeId === edgeId);
  }
}

export function initializeDiagramViewport(svg, controls, zoomLabel) {
  let viewBox = { ...DEFAULT_VIEWBOX };
  let contentBounds = { ...DEFAULT_VIEWBOX };
  let pointerPosition = null;

  function render() {
    svg.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
    zoomLabel.textContent = `${Math.round((DEFAULT_VIEWBOX.width / viewBox.width) * 100)}%`;
  }

  function fit() {
    const canvas = svg.getBoundingClientRect();
    const aspectRatio = canvas.width > 0 && canvas.height > 0 ? canvas.width / canvas.height : 1.5;
    const margin = 44;
    let width = contentBounds.width + margin * 2;
    let height = contentBounds.height + margin * 2;
    if (width / height < aspectRatio) width = height * aspectRatio;
    else height = width / aspectRatio;
    if (canvas.width > 0 && canvas.height > 0) {
      const minimumReadableScale = 0.7;
      const scale = Math.min(canvas.width / width, canvas.height / height);
      if (scale < minimumReadableScale) {
        width = canvas.width / minimumReadableScale;
        height = canvas.height / minimumReadableScale;
      }
    }
    const centerX = contentBounds.x + contentBounds.width / 2;
    const centerY = contentBounds.y + contentBounds.height / 2;
    viewBox = { x: centerX - width / 2, y: centerY - height / 2, width, height };
    render();
  }

  function zoom(factor) {
    const width = Math.min(12000, Math.max(240, viewBox.width * factor));
    const scale = width / viewBox.width;
    const height = viewBox.height * scale;
    viewBox = {
      x: viewBox.x + (viewBox.width - width) / 2,
      y: viewBox.y + (viewBox.height - height) / 2,
      width,
      height,
    };
    render();
  }

  function centerOn(node) {
    const centerX = node.centerX ?? node.x + node.width / 2;
    const centerY = node.centerY ?? node.y + node.height / 2;
    const margin = 24;
    const isVisible =
      node.x >= viewBox.x + margin &&
      node.x + node.width <= viewBox.x + viewBox.width - margin &&
      node.y >= viewBox.y + margin &&
      node.y + node.height <= viewBox.y + viewBox.height - margin;
    if (isVisible) return;
    viewBox = {
      ...viewBox,
      x: centerX - viewBox.width / 2,
      y: centerY - viewBox.height / 2,
    };
    render();
  }

  controls.zoomIn.addEventListener("click", () => zoom(0.8));
  controls.zoomOut.addEventListener("click", () => zoom(1.25));
  controls.fit.addEventListener("click", fit);
  controls.center.addEventListener("click", () => {
    viewBox = {
      ...viewBox,
      x: contentBounds.x + contentBounds.width / 2 - viewBox.width / 2,
      y: contentBounds.y + contentBounds.height / 2 - viewBox.height / 2,
    };
    render();
  });
  svg.addEventListener("keydown", (event) => {
    if (event.target.closest?.(".flow-node")) return;
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoom(0.8);
    } else if (event.key === "-") {
      event.preventDefault();
      zoom(1.25);
    } else if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      fit();
    } else if (event.key === "0") {
      event.preventDefault();
      controls.center.click();
    }
  });
  svg.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      zoom(event.deltaY < 0 ? 0.9 : 1.1);
    },
    { passive: false },
  );
  svg.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (event.target.closest?.(".flow-node")) return;
    pointerPosition = { x: event.clientX, y: event.clientY };
    svg.setPointerCapture(event.pointerId);
    svg.classList.add("is-panning");
  });
  svg.addEventListener("pointermove", (event) => {
    if (!pointerPosition) return;
    const bounds = svg.getBoundingClientRect();
    const deltaX = (event.clientX - pointerPosition.x) * (viewBox.width / bounds.width);
    const deltaY = (event.clientY - pointerPosition.y) * (viewBox.height / bounds.height);
    viewBox = { ...viewBox, x: viewBox.x - deltaX, y: viewBox.y - deltaY };
    pointerPosition = { x: event.clientX, y: event.clientY };
    render();
  });

  function stopPanning() {
    pointerPosition = null;
    svg.classList.remove("is-panning");
  }
  svg.addEventListener("pointerup", stopPanning);
  svg.addEventListener("pointercancel", stopPanning);
  svg.addEventListener("lostpointercapture", stopPanning);
  render();

  return {
    fit,
    setBounds(bounds, { fit: shouldFit = true, preserveScale = false } = {}) {
      contentBounds = { ...bounds };
      if (shouldFit) {
        fit();
      } else if (preserveScale) {
        viewBox = {
          ...viewBox,
          x: contentBounds.x + contentBounds.width / 2 - viewBox.width / 2,
          y: contentBounds.y + contentBounds.height / 2 - viewBox.height / 2,
        };
        render();
      }
    },
    centerOn,
    center() {
      controls.center.click();
    },
  };
}
