import { createCodeEditor } from "./editor/code-editor.js";
import { initializeEditorControls } from "./editor/editor-controls.js";
import { blinkExample } from "./examples/arduino-examples.js";
import { analyzeSource } from "./analyzer/analyzer.js";
import { generateFlowcharts } from "./flowchart/flow-generator.js";
import { layoutDiagram } from "./flowchart/flow-layout.js";
import { createVisualDiagram, createVisualLabelStore } from "./flowchart/visual-labels.js";
import {
  initializeDiagramViewport,
  renderDiagramMessage,
  renderFlowchart,
  highlightSimulationFlow,
  selectFlowNode,
} from "./flowchart/svg-renderer.js";
import {
  createSelectionModel,
  findDiagramNodeAtPosition,
  renderSelectionDetails,
} from "./ui/diagram-selection.js";
import { renderAnalysisReport } from "./ui/diagnostics-panel.js";
import { createStatusPanel } from "./ui/status-panel.js";
import { initializeTheme } from "./ui/theme.js";
import { initializeToolbar } from "./ui/toolbar.js";
import { exportPdf, exportPng, exportSvg } from "./export/export-manager.js";
import { SimulationEngine } from "./simulator/simulation-engine.js";
import { SimulationController } from "./simulator/simulation-controller.js";
import { createSimulatorPanel } from "./ui/simulator-panel.js";
import "./styles/main.css";
import "./styles/layout.css";
import "./styles/editor.css";
import "./styles/diagram.css";
import "./styles/simulator.css";
import "./styles/simulator.css";

const CODE_STORAGE_KEY = "arduino-flowchart-code";
const status = createStatusPanel(
  document.querySelector("#status-indicator"),
  document.querySelector("#status-label"),
  document.querySelector("#status-message"),
);
const visualLabelStore = createVisualLabelStore(
  {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key),
  },
  (error) => status.setStatus(`No se pudieron recuperar las etiquetas visuales: ${error.message}`, "warning"),
);
const analysisResults = document.querySelector("#analysis-results");
const diagramSvg = document.querySelector("#diagram-svg");
const diagramStatus = document.querySelector("#diagram-status");
const diagramFunction = document.querySelector("#diagram-function");
const showComments = document.querySelector("#show-comments");
const selectionDetails = document.querySelector("#selection-details");
const visualLabelForm = document.querySelector("#visual-label-form");
const visualLabelInput = document.querySelector("#visual-label-input");
const visualLabelStatus = document.querySelector("#visual-label-status");
const exportMenu = document.querySelector("#export-menu");
const exportButtons = [...document.querySelectorAll("[data-export-format]")];
const exportBackground = document.querySelector("#export-background");
const exportGrid = document.querySelector("#export-grid");
const simulatorPanelElement = document.querySelector("#simulator-panel");
const selectionModel = createSelectionModel();
let latestAnalysis = null;
let astNodesById = new Map();
let analyzedSource = null;
let generatedFlowcharts = null;
let displayedDiagram = null;
let selectedDiagramId = null;
let exportBusy = false;
let simulationController = null;
let simulatorPanel = null;
let lastSimulationNodeId = null;
let lastSimulationAstNodeId = null;
const simulationProxy = new Proxy({}, {
  get(_target, method) {
    return (...args) => {
      if (!simulationController) throw new Error("Genera un diagrama actualizado para iniciar el simulador.");
      return simulationController[method](...args);
    };
  },
});
simulatorPanel = createSimulatorPanel(
  simulatorPanelElement,
  simulationProxy,
  (error) => status.setStatus(`Simulación: ${error.message}`, "warning"),
);
const diagramViewport = initializeDiagramViewport(
  diagramSvg,
  {
    zoomIn: document.querySelector("#zoom-in"),
    zoomOut: document.querySelector("#zoom-out"),
    fit: document.querySelector("#fit-diagram"),
    center: document.querySelector("#center-diagram"),
  },
  document.querySelector("#zoom-level"),
);

function readSavedCode() {
  try {
    return window.localStorage.getItem(CODE_STORAGE_KEY);
  } catch (error) {
    status.setStatus(`No se pudo recuperar el código guardado en este navegador: ${error.message}`, "warning");
    return null;
  }
}

let saveWarningShown = false;
const editor = createCodeEditor(
  document.querySelector("#editor-host"),
  readSavedCode() ?? blinkExample,
  (code) => {
    visualLabelStore.setSource(code);
    try {
      window.localStorage.setItem(CODE_STORAGE_KEY, code);
      saveWarningShown = false;
    } catch (error) {
      if (!saveWarningShown) {
        status.setStatus(`No se pudo guardar automáticamente el código: ${error.message}`, "warning");
        saveWarningShown = true;
      }
    }
    if (generatedFlowcharts && generatedFlowcharts.source !== code) invalidateDiagram();
  },
  (count) => {
    document.querySelector("#line-count").textContent = `${count} ${count === 1 ? "línea" : "líneas"}`;
  },
  onEditorSelection,
);
visualLabelStore.setSource(editor.getValue());

function indexAstNodes(ast) {
  const nodes = new Map();
  const visited = new WeakSet();
  function visit(value) {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (typeof value.id === "string" && typeof value.type === "string") {
      nodes.set(value.id, value);
    }
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") visit(child);
    }
  }
  visit(ast);
  return nodes;
}

function createBlockSelection(diagram, node, origin, editorLine = node.startLine) {
  const astNode = astNodesById.get(node.astNodeId);
  const displayedNode =
    displayedDiagram?.id === diagram.id
      ? displayedDiagram.nodes.find((item) => item.id === node.id) ?? node
      : node;
  const source = editor.getValue();
  const sourceText =
    node.sourceNavigable &&
    astNode &&
    Number.isInteger(astNode.start) &&
    Number.isInteger(astNode.end)
      ? source.slice(astNode.start, astNode.end)
      : node.label;
  return {
    diagramId: diagram.id,
    diagramNodeId: node.id,
    astNodeId: node.astNodeId,
    astType: node.astType,
    kind: node.kind,
    label: node.label,
    customVisualLabel: visualLabelStore.hasCustomLabel(node) ? visualLabelStore.getLabel(node) : "",
    hasCustomVisualLabel: visualLabelStore.hasCustomLabel(node),
    sourceText,
    sourceNavigable: Boolean(node.sourceNavigable),
    startLine: node.startLine,
    endLine: node.endLine,
    editorLine,
    functionName: diagram.functionName,
    comments: node.comments,
    bounds: {
      x: displayedNode.x,
      y: displayedNode.y,
      width: displayedNode.width,
      height: displayedNode.height,
      centerX: displayedNode.centerX,
      centerY: displayedNode.centerY,
    },
  };
}

selectionModel.subscribe((selection, origin) => {
  if (!selection) {
    selectFlowNode(diagramSvg, null);
    renderSelectionDetails(selectionDetails, null);
    if (origin !== "code-change" && origin !== "editor") editor.clearHighlight();
    return;
  }

  selectFlowNode(diagramSvg, selection.diagramNodeId, {
    focus: selection.origin === "diagram",
  });
  renderSelectionDetails(selectionDetails, selection);
  if (selection.origin === "diagram" && selection.sourceNavigable) {
    if (window.matchMedia?.("(max-width: 760px)").matches) {
      document.querySelector('.mobile-tab[data-view="editor"]')?.click();
      editor.focus();
    }
    editor.scrollToLine(selection.startLine);
  } else if (selection.origin === "editor" && selection.sourceNavigable) {
    diagramViewport.centerOn(selection.bounds);
  }
});

function onEditorSelection({ line, position }) {
  if (
    !generatedFlowcharts ||
    !latestAnalysis ||
    analyzedSource !== editor.getValue()
  ) {
    return;
  }
  const match = findDiagramNodeAtPosition(
    latestAnalysis.ast,
    generatedFlowcharts.diagrams,
    position,
    line,
  );
  if (!match || (match.node.kind === "comment" && !showComments.checked)) {
    selectionModel.clear("editor");
    return;
  }
  if (diagramFunction.value !== match.diagram.id) {
    invalidateSimulation("La función activa cambió; inicia una simulación nueva.");
    diagramFunction.value = match.diagram.id;
    renderSelectedDiagram({ fit: false, preserveScale: true });
  }
  selectionModel.select(createBlockSelection(match.diagram, match.node, "editor", line), "editor");
}

function updateDiagramStatus(label, state) {
  diagramStatus.querySelector("#diagram-status-label").textContent = label;
  diagramStatus.dataset.state = state;
}

function updateSimulationVisual(state) {
  const diagram =
    displayedDiagram?.id === selectedDiagramId
      ? displayedDiagram
      : generatedFlowcharts?.diagrams.find((item) => item.id === selectedDiagramId);
  if (!diagram || state.status === "idle") {
    highlightSimulationFlow(diagramSvg, null, null);
    lastSimulationNodeId = null;
    lastSimulationAstNodeId = null;
    return;
  }
  highlightSimulationFlow(diagramSvg, state.currentNodeId, state.currentEdgeId);
  if (state.currentNodeId && state.currentNodeId !== lastSimulationNodeId) {
    const node = diagram.nodes.find((item) => item.id === state.currentNodeId);
    if (node) diagramViewport.centerOn(node);
  }
  if (state.currentAstNodeId && state.currentAstNodeId !== lastSimulationAstNodeId && state.currentLine) {
    editor.scrollToLine(state.currentLine);
  }
  lastSimulationNodeId = state.currentNodeId;
  lastSimulationAstNodeId = state.currentAstNodeId;
}

function invalidateSimulation(message) {
  simulatorPanelElement.dataset.available = "";
  if (simulationController) simulationController.invalidate(message);
  simulationController = null;
  lastSimulationNodeId = null;
  lastSimulationAstNodeId = null;
  highlightSimulationFlow(diagramSvg, null, null);
  simulatorPanelElement.hidden = true;
}

function configureSimulation(diagram) {
  if (simulationController) simulationController.invalidate("El diagrama cambió; inicia una simulación nueva.");
  simulatorPanelElement.dataset.available = "true";
  simulatorPanelElement.hidden = false;
  const engine = new SimulationEngine({
    ast: latestAnalysis.ast,
    source: generatedFlowcharts.source,
    diagram,
  });
  simulationController = new SimulationController(engine, (state) => {
    simulatorPanel.render(state);
    updateSimulationVisual(state);
  });
  simulatorPanel.render(engine.getState());
  lastSimulationNodeId = null;
  lastSimulationAstNodeId = null;
}

function updateExportAvailability() {
  const diagram = displayedDiagram?.id === selectedDiagramId;
  const canExport = Boolean(diagram && generatedFlowcharts.source === editor.getValue());
  for (const button of exportButtons) button.disabled = !canExport || exportBusy;
  exportMenu.setAttribute("aria-busy", String(exportBusy));
}

function invalidateDiagram() {
  if (!generatedFlowcharts) return;
  invalidateSimulation("El código cambió; vuelve a generar el diagrama para simularlo.");
  selectionModel.clear("code-change");
  generatedFlowcharts = null;
  displayedDiagram = null;
  selectedDiagramId = null;
  diagramFunction.replaceChildren();
  diagramFunction.disabled = true;
  const bounds = renderDiagramMessage(
    diagramSvg,
    "El código cambió. Genera de nuevo el diagrama para reflejar la versión actual.",
  );
  diagramViewport.setBounds(bounds);
  updateDiagramStatus("Diagrama desactualizado", "stale");
  updateExportAvailability();
  status.setStatus("El código cambió desde la generación; vuelve a generar el diagrama.", "warning");
}

function analyzeCurrentSource({ scroll = true } = {}) {
  const source = editor.getValue();
  const result = analyzeSource(source);
  latestAnalysis = result;
  astNodesById = indexAstNodes(result.ast);
  analyzedSource = source;
  renderAnalysisReport(analysisResults, result);
  const errorCount = result.diagnostics.filter((item) => item.severity === "error").length;
  const warningCount = result.diagnostics.length - errorCount;
  if (errorCount) {
    status.setStatus(
      `Análisis terminado con ${errorCount} error(es) y ${warningCount} advertencia(s). Consulta el diagnóstico.`,
      "error",
    );
  } else if (warningCount) {
    status.setStatus(
      `Análisis terminado con ${warningCount} advertencia(s). El código reconocido se conserva en el AST.`,
      "warning",
    );
  } else {
    status.setStatus("Análisis correcto. El código está preparado para generar el diagrama.", "success");
  }
  if (scroll) analysisResults.scrollIntoView({ behavior: "smooth", block: "start" });
  return result;
}

function renderPresentationDiagram(diagram, { fit = false, preserveScale = true } = {}) {
  displayedDiagram = createVisualDiagram(diagram, visualLabelStore, layoutDiagram);
  const bounds = renderFlowchart(diagramSvg, displayedDiagram, { showComments: showComments.checked });
  diagramViewport.setBounds(bounds, { fit, preserveScale });
  const current = selectionModel.current;
  if (current?.diagramId === diagram.id && !selectFlowNode(diagramSvg, current.diagramNodeId)) {
    selectionModel.clear("comments-hidden");
  }
  if (simulationController) {
    const state = simulationController.engine.getState();
    highlightSimulationFlow(diagramSvg, state.currentNodeId, state.currentEdgeId);
  }
  return displayedDiagram;
}

function renderSelectedDiagram({ fit = true, preserveScale = false } = {}) {
  const diagram = generatedFlowcharts?.diagrams.find((item) => item.id === diagramFunction.value);
  if (!diagram) return;
  selectedDiagramId = diagram.id;
  const presentation = renderPresentationDiagram(diagram, { fit, preserveScale });
  configureSimulation(diagram);
  updateExportAvailability();
  updateDiagramStatus(`${presentation.nodes.length} bloques · ${presentation.edges.length} conexiones`, "ready");
  const warningCount =
    (latestAnalysis?.diagnostics.filter((item) => item.severity === "warning").length ?? 0) +
    (generatedFlowcharts.warnings.length ?? 0);
  status.setStatus(
    `${diagram.title}: ${presentation.nodes.length} bloques y ${presentation.edges.length} conexiones.${warningCount ? ` Diagrama parcial con ${warningCount} advertencia(s); consulta el diagnóstico.` : ""}`,
    warningCount ? "warning" : "success",
  );
}

function generateDiagram() {
  invalidateSimulation("El diagrama se está regenerando.");
  selectionModel.clear("regenerate");
  const source = editor.getValue();
  const analysis =
    latestAnalysis && analyzedSource === source ? latestAnalysis : analyzeCurrentSource({ scroll: false });
  const errors = analysis.diagnostics.filter((item) => item.severity === "error");
  if (errors.length) {
    generatedFlowcharts = null;
    displayedDiagram = null;
    selectedDiagramId = null;
    diagramFunction.replaceChildren();
    diagramFunction.disabled = true;
    const bounds = renderDiagramMessage(
      diagramSvg,
      `Corrige los ${errors.length} error(es) de sintaxis del diagnóstico antes de generar un diagrama.`,
    );
    diagramViewport.setBounds(bounds);
    updateDiagramStatus("Hay errores de sintaxis", "stale");
    status.setStatus(
      `No se generó el diagrama: corrige ${errors.length} error(es) de sintaxis y vuelve a intentarlo.`,
      "error",
    );
    return;
  }

  try {
    const result = generateFlowcharts(analysis.ast, source);
    result.diagrams.forEach(layoutDiagram);
    generatedFlowcharts = { ...result, source };

    if (!result.diagrams.length) {
      selectedDiagramId = null;
      displayedDiagram = null;
      diagramFunction.replaceChildren();
      diagramFunction.disabled = true;
      const bounds = renderDiagramMessage(
        diagramSvg,
        "No se encontraron funciones ni declaraciones globales representables.",
      );
      diagramViewport.setBounds(bounds);
      updateDiagramStatus("Sin funciones", "empty");
      updateExportAvailability();
      status.setStatus(result.warnings.map((warning) => warning.message).join(" "), "warning");
      return;
    }

    diagramFunction.replaceChildren();
    for (const diagram of result.diagrams) {
      const option = document.createElement("option");
      option.value = diagram.id;
      option.textContent = `${diagram.title} · L${diagram.startLine}-${diagram.endLine}`;
      diagramFunction.append(option);
    }
    const initial =
      result.diagrams.find((diagram) => diagram.functionName === "setup") ??
      result.diagrams.find((diagram) => diagram.functionName === "loop") ??
      result.diagrams[0];
    diagramFunction.value = selectedDiagramId && result.diagrams.some((item) => item.id === selectedDiagramId)
      ? selectedDiagramId
      : initial.id;
    diagramFunction.disabled = result.diagrams.length < 2;

    const generatorDiagnostics = result.warnings.map((warning) => ({
      ...warning,
      severity: "warning",
      column: warning.column ?? 1,
      fragment: warning.fragment ?? "",
    }));
    if (generatorDiagnostics.length) {
      renderAnalysisReport(analysisResults, {
        ...analysis,
        diagnostics: [...analysis.diagnostics, ...generatorDiagnostics],
      });
    }
    renderSelectedDiagram({ fit: true });
  } catch (error) {
    generatedFlowcharts = null;
    displayedDiagram = null;
    selectedDiagramId = null;
    diagramFunction.disabled = true;
    const bounds = renderDiagramMessage(
      diagramSvg,
      "No se pudo construir el diagrama. Revisa el código y vuelve a intentarlo.",
    );
    diagramViewport.setBounds(bounds);
    updateDiagramStatus("Error de generación", "stale");
    updateExportAvailability();
    status.setStatus(`Error al generar el diagrama: ${error.message}`, "error");
  }
}

const editorControls = initializeEditorControls({
  editor,
  setStatus: status.setStatus,
  elements: {
    paste: document.querySelector("#paste-code"),
    loadExample: document.querySelector("#load-example"),
    clear: document.querySelector("#clear-code"),
    fileInput: document.querySelector("#file-input"),
  },
});

initializeToolbar(
  {
    newProject: document.querySelector("#new-project"),
    openCode: document.querySelector("#open-code"),
    saveCode: document.querySelector("#save-code"),
    analyzeCode: document.querySelector("#analyze-code"),
    generateDiagram: document.querySelector("#generate-diagram"),
    mobileTabs: document.querySelectorAll(".mobile-tab"),
  },
  {
    ...editorControls,
    analyzeCode: analyzeCurrentSource,
    generateDiagram,
  },
);

exportMenu.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-export-format]");
  if (!button || button.disabled || exportBusy) return;
  const diagram = displayedDiagram?.id === selectedDiagramId ? displayedDiagram : null;
  if (!diagram || generatedFlowcharts.source !== editor.getValue()) {
    updateExportAvailability();
    status.setStatus("Genera un diagrama actualizado antes de exportarlo.", "warning");
    return;
  }

  const format = button.dataset.exportFormat;
  const filename = `${diagram.functionName}.${format}`;
  const options = {
    includeBackground: exportBackground.checked,
    includeGrid: exportGrid.checked,
  };
  exportBusy = true;
  updateExportAvailability();
  diagramFunction.disabled = true;
  showComments.disabled = true;
  status.setStatus(`Preparando la exportación ${format.toUpperCase()} de ${diagram.title}…`, "warning");
  try {
    if (format === "svg") await exportSvg(diagramSvg, diagram.bounds, diagram.functionName, options);
    else if (format === "png") await exportPng(diagramSvg, diagram.bounds, diagram.functionName, options);
    else if (format === "pdf") await exportPdf(diagramSvg, diagram.bounds, diagram.functionName, options);
    else throw new Error(`Formato de exportación desconocido: ${format}`);
    status.setStatus(`Exportación ${format.toUpperCase()} completada: ${filename}.`, "success");
  } catch (error) {
    status.setStatus(`No se pudo exportar ${format.toUpperCase()}: ${error.message}`, "error");
  } finally {
    exportBusy = false;
    diagramFunction.disabled = !generatedFlowcharts || generatedFlowcharts.diagrams.length < 2;
    showComments.disabled = false;
    updateExportAvailability();
  }
});

diagramSvg.addEventListener("flowchartselect", (event) => {
  const diagram = generatedFlowcharts?.diagrams.find((item) => item.id === selectedDiagramId);
  const node = diagram?.nodes.find((item) => item.id === event.detail?.nodeId);
  if (diagram && node) {
    selectionModel.select(createBlockSelection(diagram, node, "diagram"), "diagram");
  }
});
document.querySelector("#clear-selection").addEventListener("click", () => {
  selectionModel.clear("clear-button");
});
diagramFunction.addEventListener("change", () => {
  invalidateSimulation("La función activa cambió; inicia una simulación nueva.");
  selectionModel.clear("function");
  renderSelectedDiagram({ fit: false, preserveScale: true });
});
for (const tab of document.querySelectorAll(".mobile-tab")) {
  tab.addEventListener("click", () => {
    if (tab.dataset.view === "diagram") window.requestAnimationFrame(() => diagramViewport.fit());
  });
}
showComments.addEventListener("change", () => {
  const diagram = generatedFlowcharts?.diagrams.find((item) => item.id === selectedDiagramId);
  if (!diagram) return;
  renderPresentationDiagram(diagram, { fit: false, preserveScale: true });
});

function applyVisualLabel(reset = false) {
  const selection = selectionModel.current;
  const diagram = generatedFlowcharts?.diagrams.find((item) => item.id === selection?.diagramId);
  const node = diagram?.nodes.find((item) => item.id === selection?.diagramNodeId);
  if (!selection || !diagram || !node) {
    visualLabelStatus.textContent = "Selecciona un bloque del diagrama antes de editar su etiqueta.";
    return;
  }

  try {
    if (reset) visualLabelStore.resetLabel(node);
    else visualLabelStore.setLabel(node, visualLabelInput.value);
    renderPresentationDiagram(diagram, { fit: false, preserveScale: true });
    const updatedSelection = createBlockSelection(
      diagram,
      node,
      selection.origin ?? "diagram",
      selection.editorLine,
    );
    renderSelectionDetails(selectionDetails, updatedSelection);
    visualLabelStatus.textContent = updatedSelection.hasCustomVisualLabel
      ? "Etiqueta visual aplicada. El código y la simulación no han cambiado."
      : "Se muestra de nuevo la etiqueta original.";
  } catch (error) {
    visualLabelStatus.textContent = `No se pudo guardar la etiqueta: ${error.message}`;
    status.setStatus(`No se pudo guardar la etiqueta visual: ${error.message}`, "error");
  }
}

visualLabelForm.addEventListener("submit", (event) => {
  event.preventDefault();
  applyVisualLabel();
});
document.querySelector("#reset-visual-label").addEventListener("click", () => {
  applyVisualLabel(true);
});

initializeTheme(document.querySelector("#theme-toggle"), (error) => {
  status.setStatus(`No se pudo guardar la preferencia de tema: ${error.message}`, "warning");
});
