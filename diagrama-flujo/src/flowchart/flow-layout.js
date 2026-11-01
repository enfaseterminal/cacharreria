const NODE_GAP = 32;
const BRANCH_GAP = 72;
const SWITCH_LANE_GAP = 20;

function wrapText(value, maxCharacters) {
  const lines = [];
  for (const paragraph of String(value ?? "").split(/\r\n|\r|\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      if (word.length > maxCharacters) {
        if (line) lines.push(line);
        line = "";
        for (let index = 0; index < word.length; index += maxCharacters) {
          const part = word.slice(index, index + maxCharacters);
          if (index + maxCharacters >= word.length) line = part;
          else lines.push(part);
        }
      } else if (!line) {
        line = word;
      } else if (`${line} ${word}`.length <= maxCharacters) {
        line += ` ${word}`;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [""];
}

function measureNode(node) {
  const customConnector = node.kind === "connector" && node.visualLabelCustomized;
  const labelLines = wrapText(node.label, customConnector ? 16 : 34);
  const detailLines = node.detail ? wrapText(node.detail, 36) : [];
  const labelMax = Math.max(0, ...labelLines.map((line) => line.length));
  const connectorDiameter = Math.max(labelMax * 7.2 + 20, labelLines.length * 17 + 20);
  const shapeWidth = customConnector
    ? Math.max(48, connectorDiameter)
    : Math.max(156, Math.min(340, labelMax * 7.2 + 38));
  const shapeHeight = customConnector
    ? shapeWidth
    : Math.max(54, 25 + labelLines.length * 17 + (detailLines.length ? 15 + detailLines.length * 13 : 0));
  const commentLayouts = (node.comments ?? []).map((comment) => {
    const lines = wrapText(comment.text, 36);
    return {
      ...comment,
      lines,
      width: Math.max(188, Math.min(300, Math.max(...lines.map((line) => line.length)) * 6.3 + 30)),
      height: 23 + lines.length * 15,
    };
  });
  const commentWidth = Math.max(0, ...commentLayouts.map((comment) => comment.width));
  const commentsHeight = commentLayouts.reduce((height, comment) => height + comment.height + 6, 0);
  node.labelLines = labelLines;
  node.detailLines = detailLines;
  node.commentLayouts = commentLayouts;
  node.shapeWidth = shapeWidth;
  node.shapeHeight = shapeHeight;
  node.width = Math.max(shapeWidth, commentWidth);
  node.height = shapeHeight + (commentLayouts.length ? 8 + commentsHeight - 6 : 0);
  return { width: node.width, height: node.height };
}

function measureSequence(layout, nodes) {
  if (!layout || layout.type !== "sequence") return measureItem(layout, nodes);
  const items = layout.items.map((item) => measureItem(item, nodes));
  layout.width = Math.max(0, ...items.map((item) => item.width));
  layout.height = items.reduce((height, item) => height + item.height, 0) + Math.max(0, items.length - 1) * NODE_GAP;
  return { width: layout.width, height: layout.height };
}

function measureItem(item, nodes) {
  if (!item) return { width: 0, height: 0 };
  if (item.type === "sequence") return measureSequence(item, nodes);
  if (item.type === "node") {
    const node = nodes.get(item.nodeId);
    return node ? measureNode(node) : { width: 0, height: 0 };
  }

  if (item.type === "branch") {
    const decision = nodes.get(item.decisionId);
    const join = item.joinId ? nodes.get(item.joinId) : null;
    const yes = measureSequence(item.yes, nodes);
    const no = measureSequence(item.no, nodes);
    const leftWidth = Math.max(170, no.width);
    const rightWidth = Math.max(170, yes.width);
    const branchesWidth = leftWidth + BRANCH_GAP + rightWidth;
    item.leftWidth = leftWidth;
    item.rightWidth = rightWidth;
    item.decisionHeight = decision?.height ?? 80;
    item.branchHeight = Math.max(yes.height, no.height);
    item.height =
      item.decisionHeight +
      52 +
      item.branchHeight +
      (join ? join.height + 30 : 20);
    item.width = Math.max(branchesWidth, decision?.width ?? 0, join?.width ?? 0);
    return { width: item.width, height: item.height };
  }

  if (item.type === "loop" || item.type === "do-loop") {
    const decision = nodes.get(item.conditionId);
    const initializer = item.initializerId ? nodes.get(item.initializerId) : null;
    const update = item.updateId ? nodes.get(item.updateId) : null;
    const body = measureSequence(item.body, nodes);
    item.innerWidth = Math.max(decision?.width ?? 0, initializer?.width ?? 0, update?.width ?? 0, body.width);
    const topHeight = item.type === "loop"
      ? (initializer ? initializer.height + NODE_GAP : 0) + (decision?.height ?? 80)
      : body.height + NODE_GAP + (decision?.height ?? 80);
    const bodyHeight = item.type === "loop"
      ? NODE_GAP + body.height
      : 0;
    const updateHeight = item.type === "loop" && update ? NODE_GAP + update.height : 0;
    item.width = item.innerWidth + 96;
    item.height = topHeight + bodyHeight + updateHeight + 44;
    return { width: item.width, height: item.height };
  }

  if (item.type === "switch") {
    const decision = nodes.get(item.decisionId);
    const arms = item.arms.map((arm) => measureSequence(arm, nodes));
    const join = nodes.get(item.joinId);
    item.armHeights = arms.map((arm) => arm.height);
    item.armWidth = Math.max(170, ...arms.map((arm) => arm.width));
    item.dispatchGutter = Math.max(48, item.arms.length * SWITCH_LANE_GAP + 20);
    item.contentWidth = Math.max(decision?.width ?? 0, item.armWidth);
    item.width = item.dispatchGutter + item.contentWidth;
    item.height =
      (decision?.height ?? 80) +
      48 +
      item.arms.length * 5 +
      arms.reduce((height, arm) => height + arm.height, 0) +
      arms.length * 20 +
      (join?.height ?? 36) +
      24;
    return { width: item.width, height: item.height };
  }

  return { width: 0, height: 0 };
}

function placeNode(node, centerX, y) {
  node.x = centerX - node.width / 2;
  node.y = y;
  node.centerX = centerX;
  node.centerY = y + node.shapeHeight / 2;
}

function placeSequence(layout, x, y, nodes) {
  if (!layout || layout.type !== "sequence") return placeItem(layout, x, y, nodes);
  let currentY = y;
  for (const item of layout.items) {
    const measured = measureItem(item, nodes);
    placeItem(item, x + layout.width / 2, currentY, nodes);
    currentY += measured.height + NODE_GAP;
  }
}

function placeItem(item, centerX, y, nodes) {
  if (!item) return;
  if (item.type === "sequence") return placeSequence(item, centerX - item.width / 2, y, nodes);
  if (item.type === "node") {
    const node = nodes.get(item.nodeId);
    if (node) placeNode(node, centerX, y);
    return;
  }

  if (item.type === "branch") {
    const decision = nodes.get(item.decisionId);
    const join = item.joinId ? nodes.get(item.joinId) : null;
    const leftX = centerX - item.width / 2;
    const branchY = y + item.decisionHeight + 52;
    if (decision) placeNode(decision, centerX, y);
    placeSequence(item.no, leftX, branchY, nodes);
    placeSequence(item.yes, leftX + item.leftWidth + BRANCH_GAP, branchY, nodes);
    if (join) placeNode(join, centerX, branchY + item.branchHeight + 30);
    item.bounds = { x: leftX, y, width: item.width, height: item.height };
    return;
  }

  if (item.type === "loop") {
    const decision = nodes.get(item.conditionId);
    const initializer = item.initializerId ? nodes.get(item.initializerId) : null;
    const update = item.updateId ? nodes.get(item.updateId) : null;
    const top = y + (initializer ? initializer.height + NODE_GAP : 0);
    const bodyY = top + (decision?.height ?? 80) + NODE_GAP;
    if (initializer) placeNode(initializer, centerX, y);
    if (decision) {
      placeNode(decision, centerX, top);
      decision.loopExitX = centerX - item.width / 2 + 14;
    }
    placeSequence(item.body, centerX - item.body.width / 2, bodyY, nodes);
    if (update) placeNode(update, centerX, bodyY + item.body.height + NODE_GAP);
    item.bounds = { x: centerX - item.width / 2, y, width: item.width, height: item.height };
    return;
  }

  if (item.type === "do-loop") {
    const decision = nodes.get(item.conditionId);
    const bodyY = y;
    const conditionY = bodyY + item.body.height + NODE_GAP;
    placeSequence(item.body, centerX - item.body.width / 2, bodyY, nodes);
    if (decision) {
      placeNode(decision, centerX, conditionY);
      decision.loopExitX = centerX - item.width / 2 + 14;
    }
    item.bounds = { x: centerX - item.width / 2, y, width: item.width, height: item.height };
    return;
  }

  if (item.type === "switch") {
    const decision = nodes.get(item.decisionId);
    const join = nodes.get(item.joinId);
    const contentCenter = centerX - item.width / 2 + item.dispatchGutter + item.contentWidth / 2;
    let currentY = y + (decision?.height ?? 80) + 48 + item.arms.length * 5;
    if (decision) placeNode(decision, contentCenter, y);
    for (let index = 0; index < item.arms.length; index += 1) {
      const arm = item.arms[index];
      placeSequence(arm, contentCenter - item.armWidth / 2, currentY, nodes);
      currentY += item.armHeights[index] + 20;
    }
    if (join) placeNode(join, contentCenter, currentY);
    item.dispatchX = centerX - item.width / 2 + 12;
    if (decision) decision.dispatchBaseX = item.dispatchX;
    item.bounds = { x: centerX - item.width / 2, y, width: item.width, height: item.height };
  }
}

export function layoutDiagram(diagram) {
  if (!diagram || !Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges) || !diagram.layout) {
    throw new TypeError("Se esperaba un diagrama con nodos, conexiones y estructura de layout.");
  }
  const nodes = new Map(diagram.nodes.map((node) => [node.id, node]));
  diagram.nodes.forEach(measureNode);
  const measured = measureSequence(diagram.layout, nodes);
  const width = Math.max(240, measured.width);
  const top = 70;
  placeSequence(diagram.layout, 0, top, nodes);

  let rightmost = width;
  let bottom = top + measured.height;
  let leftmost = 0;
  for (const node of diagram.nodes) {
    rightmost = Math.max(rightmost, node.x + node.width);
    leftmost = Math.min(leftmost, node.x);
    bottom = Math.max(bottom, node.y + node.height);
  }

  let rightRouteLane = 0;
  let repeatLane = 0;
  const dispatchLanes = new Map();
  for (const edge of diagram.edges) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (
      edge.type !== "loop-repeat" &&
      edge.type !== "loop-exit" &&
      from &&
      to &&
      to.y < from.y &&
      ["flow", "continue", "yes", "no"].includes(edge.type)
    ) {
      if (edge.type === "flow") edge.label = edge.label || "repetir";
      edge.type = "loop-back";
    }
    if (["loop-back", "break", "continue", "return", "warning"].includes(edge.type)) {
      edge.routeLane = ++rightRouteLane;
    }
    if (edge.type === "loop-repeat") edge.routeLane = ++repeatLane;
    if (edge.type === "dispatch") {
      const lane = dispatchLanes.get(edge.dispatchGroup) ?? 0;
      edge.routeIndex = lane;
      dispatchLanes.set(edge.dispatchGroup, lane + 1);
    }
  }
  rightmost += rightRouteLane * 24 + 70;
  if (repeatLane) leftmost -= 40 + repeatLane * 24;
  diagram.width = rightmost - leftmost;
  diagram.height = bottom + 40;
  diagram.bounds = { x: -30, y: 0, width: diagram.width + 60, height: diagram.height };
  for (const node of diagram.nodes) {
    node.x -= leftmost;
    node.centerX -= leftmost;
  }
  diagram.nodes.sort((left, right) => left.y - right.y || left.x - right.x);
  return diagram;
}

export { wrapText };
