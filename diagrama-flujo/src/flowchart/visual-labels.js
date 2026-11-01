export const VISUAL_LABELS_STORAGE_KEY = "arduino-flowchart-visual-labels";
export const VISUAL_LABEL_MAX_LENGTH = 160;

function isLabelRecord(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      value.version === 1 &&
      typeof value.source === "string" &&
      value.labels &&
      typeof value.labels === "object" &&
      !Array.isArray(value.labels) &&
      Object.entries(value.labels).every(([id, label]) =>
        Boolean(id) &&
        typeof label === "string" &&
        Boolean(label.trim()) &&
        label.trim().length <= VISUAL_LABEL_MAX_LENGTH,
      ),
  );
}

export function createVisualLabelStore(storage, { onError = () => {} } = {}) {
  if (
    !storage ||
    typeof storage.getItem !== "function" ||
    typeof storage.setItem !== "function" ||
    typeof storage.removeItem !== "function"
  ) {
    throw new TypeError("Se necesita un almacenamiento compatible con etiquetas visuales.");
  }

  let source = null;
  let labels = Object.create(null);
  let storedSourceMatches = false;

  function readRecord() {
    let raw;
    try {
      raw = storage.getItem(VISUAL_LABELS_STORAGE_KEY);
    } catch (error) {
      onError(error);
      return null;
    }
    if (raw === null) return null;
    try {
      const record = JSON.parse(raw);
      if (!isLabelRecord(record)) throw new TypeError("Los metadatos de etiquetas no tienen un formato válido.");
      return record;
    } catch (error) {
      onError(error);
      return null;
    }
  }

  function persist() {
    const entries = Object.entries(labels);
    if (!entries.length) {
      if (storedSourceMatches) storage.removeItem(VISUAL_LABELS_STORAGE_KEY);
      storedSourceMatches = false;
      return;
    }
    storage.setItem(
      VISUAL_LABELS_STORAGE_KEY,
      JSON.stringify({ version: 1, source, labels: Object.fromEntries(entries) }),
    );
    storedSourceMatches = true;
  }

  function getId(node) {
    if (!node || typeof node.id !== "string" || !node.id) {
      throw new TypeError("El bloque debe tener un identificador estable.");
    }
    return node.id;
  }

  return {
    setSource(nextSource) {
      if (typeof nextSource !== "string") {
        throw new TypeError("El código fuente debe ser texto.");
      }
      source = nextSource;
      const record = readRecord();
      storedSourceMatches = record?.source === nextSource;
      labels = storedSourceMatches ? Object.assign(Object.create(null), record.labels) : Object.create(null);
    },
    getLabel(node) {
      return labels[getId(node)] ?? node.label;
    },
    hasCustomLabel(node) {
      return Object.hasOwn(labels, getId(node));
    },
    setLabel(node, value) {
      const id = getId(node);
      if (source === null) throw new Error("Selecciona el código actual antes de editar etiquetas.");
      if (typeof node.label !== "string") throw new TypeError("El bloque debe tener una etiqueta original.");
      if (typeof value !== "string") throw new TypeError("La etiqueta visual debe ser texto.");
      const normalized = value.trim();
      if (normalized.length > VISUAL_LABEL_MAX_LENGTH) {
        throw new RangeError(`La etiqueta visual no puede superar ${VISUAL_LABEL_MAX_LENGTH} caracteres.`);
      }
      const previous = labels[id];
      if (!normalized || normalized === node.label.trim()) delete labels[id];
      else labels[id] = normalized;
      try {
        persist();
      } catch (error) {
        if (previous === undefined) delete labels[id];
        else labels[id] = previous;
        throw error;
      }
      return labels[id] ?? node.label;
    },
    resetLabel(node) {
      return this.setLabel(node, "");
    },
  };
}

export function createVisualDiagram(diagram, labelStore, layoutDiagram) {
  if (!diagram || !Array.isArray(diagram.nodes)) {
    throw new TypeError("Se esperaba un diagrama válido para la presentación.");
  }
  if (typeof layoutDiagram !== "function") {
    throw new TypeError("Se necesita el layout del diagrama para preparar la presentación.");
  }
  const presentation = structuredClone(diagram);
  for (const node of presentation.nodes) {
    node.originalLabel = node.label;
    node.visualLabelCustomized = labelStore.hasCustomLabel(node);
    node.label = labelStore.getLabel(node);
  }
  layoutDiagram(presentation);
  return presentation;
}
