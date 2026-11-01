function graphNodePriority(node) {
  if (node.kind === "decision") return 0;
  if (node.kind === "case") return 1;
  if (node.kind === "comment") return 2;
  return 3;
}

function positionMatches(node, position) {
  return Number.isInteger(node.start) &&
    Number.isInteger(node.end) &&
    position >= node.start &&
    position <= node.end;
}

function lineMatches(node, line) {
  return Number.isInteger(line) &&
    [node.startLine, node.endLine, node.astStartLine, node.astEndLine].includes(line);
}

export function findDiagramNodeAtPosition(ast, diagrams, position, line = null) {
  if (!ast || !Array.isArray(diagrams) || !Number.isInteger(position)) return null;

  const positionMatchesFound = [];
  const lineMatchesFound = [];
  for (const diagram of diagrams) {
    for (const node of diagram.nodes) {
      if (!node.sourceNavigable || !node.astNodeId) continue;
      const candidate = {
        diagram,
        node,
        sourceLength: Number.isInteger(node.start) && Number.isInteger(node.end)
          ? node.end - node.start
          : Number.POSITIVE_INFINITY,
      };
      if (positionMatches(node, position)) positionMatchesFound.push(candidate);
      if (lineMatches(node, line)) lineMatchesFound.push(candidate);
      for (const comment of node.comments ?? []) {
        const candidate = { diagram, node, sourceLength: comment.end - comment.start };
        if (positionMatches(comment, position)) positionMatchesFound.push(candidate);
        if (lineMatches(comment, line)) lineMatchesFound.push(candidate);
      }
    }
  }

  const candidates = positionMatchesFound.length ? positionMatchesFound : lineMatchesFound;
  candidates.sort((left, right) =>
    left.sourceLength - right.sourceLength ||
    graphNodePriority(left.node) - graphNodePriority(right.node),
  );
  return candidates[0] ?? null;
}

export function createSelectionModel() {
  let current = null;
  const listeners = new Set();

  function publish(selection, origin) {
    const next = selection ? { ...selection, origin } : null;
    if (
      current?.diagramId === next?.diagramId &&
      current?.diagramNodeId === next?.diagramNodeId &&
      current?.editorLine === next?.editorLine &&
      current?.origin === next?.origin
    ) {
      return false;
    }
    current = next;
    for (const listener of listeners) listener(current, origin);
    return true;
  }

  return {
    get current() {
      return current;
    },
    select(selection, origin) {
      if (!selection || typeof selection !== "object") {
        throw new TypeError("La selección debe incluir un bloque válido.");
      }
      return publish(selection, origin);
    },
    clear(origin = "clear") {
      return publish(null, origin);
    },
    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError("El suscriptor de selección debe ser una función.");
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function renderSelectionDetails(container, selection) {
  const title = container.querySelector("#selection-type");
  const range = container.querySelector("#selection-range");
  const source = container.querySelector("#selection-source");
  const commentsHeading = container.querySelector("#selection-comments-heading");
  const comments = container.querySelector("#selection-comments");

  if (!selection) {
    container.hidden = true;
    source.textContent = "";
    comments.replaceChildren();
    return;
  }

  title.textContent = selection.astType ?? `Bloque ${selection.kind}`;
  range.textContent = selection.startLine === selection.endLine
    ? `Línea ${selection.startLine}`
    : `Líneas ${selection.startLine}–${selection.endLine}`;
  source.textContent = selection.sourceText ?? selection.label ?? "";
  comments.replaceChildren();
  for (const comment of selection.comments ?? []) {
    const item = document.createElement("pre");
    item.className = "selection-comment";
    item.textContent = comment.text;
    comments.append(item);
  }
  commentsHeading.hidden = !(selection.comments?.length);
  container.hidden = false;
}
