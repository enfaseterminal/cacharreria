const DISPLAY_TOKEN_FIELDS = ["kind", "text", "line", "column", "start", "end"];

function createDetails(title, content, open = false) {
  const details = document.createElement("details");
  details.className = "diagnostic-section";
  details.open = open;
  const summary = document.createElement("summary");
  summary.textContent = title;
  const body = document.createElement("div");
  body.className = "diagnostic-section-content";
  body.append(content);
  details.append(summary, body);
  return details;
}

function createPreformatted(value) {
  const pre = document.createElement("pre");
  pre.className = "diagnostic-json";
  pre.textContent = JSON.stringify(value, null, 2);
  return pre;
}

function createList(items, emptyMessage, renderItem, itemAttributes = () => ({})) {
  const list = document.createElement("ul");
  list.className = "diagnostic-list";
  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "diagnostic-empty";
    empty.textContent = emptyMessage;
    list.append(empty);
    return list;
  }
  for (const item of items) {
    const element = document.createElement("li");
    element.textContent = renderItem(item);
    for (const [name, value] of Object.entries(itemAttributes(item))) {
      element.setAttribute(name, value);
    }
    list.append(element);
  }
  return list;
}

function createCountCard(label, value) {
  const card = document.createElement("div");
  card.className = "diagnostic-count";
  const count = document.createElement("strong");
  count.textContent = String(value);
  const caption = document.createElement("span");
  caption.textContent = label;
  card.append(count, caption);
  return card;
}

function serializeAst(node) {
  return JSON.parse(
    JSON.stringify(node, (key, value) => (["endToken", "openToken"].includes(key) ? undefined : value)),
  );
}

export function renderAnalysisReport(container, result) {
  container.replaceChildren();
  container.hidden = false;
  container.setAttribute("aria-live", "polite");

  const heading = document.createElement("div");
  heading.className = "diagnostics-heading";
  const title = document.createElement("h2");
  title.textContent = "Diagnóstico del análisis";
  const counts = document.createElement("div");
  counts.className = "diagnostic-counts";
  counts.append(
    createCountCard("Funciones", result.summary.counts.functions),
    createCountCard("Instrucciones", result.summary.counts.instructions),
    createCountCard("Comentarios", result.summary.counts.comments),
    createCountCard("Variables", result.summary.counts.variables),
    createCountCard("Estructuras", result.summary.counts.controlStructures),
  );
  heading.append(title, counts);

  const tokenRows = result.tokens.map((token) =>
    Object.fromEntries(DISPLAY_TOKEN_FIELDS.map((field) => [field, token[field]])),
  );

  const functions = createList(
    result.summary.functions,
    "No se detectaron funciones.",
    (item) =>
      `${item.name}() · ${item.returnType}${item.isPrototype ? " · prototipo" : ""} · línea ${item.startLine}`,
  );
  const variables = createList(
    result.summary.variables,
    "No se detectaron variables.",
    (item) =>
      `${item.valueType} ${item.name}${item.isArray ? "[]" : ""}${item.functionName ? ` · ${item.functionName}()` : " · global"} · línea ${item.startLine}`,
  );
  const comments = createList(
    result.comments,
    "No se encontraron comentarios.",
    (item) =>
      `${item.commentType === "line" ? "Línea" : "Bloque"} · ${item.startLine}${item.endLine !== item.startLine ? `-${item.endLine}` : ""}:${item.column} · ${item.relation ? `asociado (${item.relation})` : "independiente"} · ${item.text}`,
  );
  const controls = createList(
    result.summary.controls,
    "No se detectaron estructuras de control.",
    (item) => `${item.type}${item.detail ? ` ${item.detail}` : ""} · línea ${item.line}${item.functionName ? ` · ${item.functionName}()` : ""}`,
  );

  const diagnostics = createList(
    result.diagnostics,
    "Sin errores ni advertencias.",
    (item) => {
      const location = `${item.line}:${item.column}`;
      const fragment = item.fragment ? ` · ${item.fragment}` : "";
      return `${item.severity === "error" ? "Error" : "Advertencia"} · ${location} · ${item.message}${fragment}`;
    },
    (item) => ({ "data-severity": item.severity }),
  );
  diagnostics.classList.add("diagnostic-messages");

  const content = document.createElement("div");
  content.className = "diagnostic-sections";
  content.append(
    createDetails("Tokens reconocidos", createPreformatted(tokenRows)),
    createDetails("Estructura del programa", createPreformatted({
      inclusiones: result.summary.includes,
      funciones: result.summary.functions.map(({ name, returnType, isPrototype, startLine }) => ({
        name,
        returnType,
        isPrototype,
        startLine,
      })),
      llamadasArduino: result.summary.functionCalls.filter((call) => call.isArduinoFunction),
    })),
    createDetails("Funciones detectadas", functions),
    createDetails("Variables", variables),
    createDetails("Comentarios conservados", comments),
    createDetails("Estructuras de control", controls),
    createDetails("Errores y advertencias", diagnostics, result.diagnostics.length > 0),
    createDetails("AST (JSON)", createPreformatted(serializeAst(result.ast))),
  );

  container.append(heading, content);
}
