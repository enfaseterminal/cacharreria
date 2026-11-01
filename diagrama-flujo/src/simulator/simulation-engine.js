import {
  evaluateExpression,
  parseUserValue,
  SimulationInputRequired,
} from "./expression-evaluator.js";
import {
  cloneSimulationState,
  createSimulationState,
  knownValue,
  unknownValue,
} from "./simulation-state.js";

const SENSOR_CALLS = new Set(["digitalRead", "analogRead"]);
const PIN_OUTPUT_CALLS = new Set(["digitalWrite", "analogWrite"]);
const SERIAL_CALLS = new Set(["Serial.print", "Serial.println"]);
const SERIAL_BEGIN_CALL = "Serial.begin";
const PIN_MODE_CALLS = new Set(["pinMode"]);

function nodeData(node, key) {
  return node?.[key] ?? node?.data?.[key] ?? null;
}

function getNodeName(node) {
  return nodeData(node, "name");
}

function getCallName(node) {
  return nodeData(node, "callName") ?? nodeData(node, "callee");
}

function sourceText(node, source) {
  if (!Number.isInteger(node?.start) || !Number.isInteger(node?.end)) return node?.type ?? "";
  return source.slice(node.start, node.end).trim();
}

function booleanCondition(value) {
  if (!value.known) return value;
  if (typeof value.value === "boolean") return value;
  if (typeof value.value === "number") return knownValue(value.value !== 0, "boolean");
  if (typeof value.value === "string") return knownValue(value.value.length > 0, "boolean");
  return unknownValue(null, "La condición no tiene un valor que pueda interpretarse como verdadero o falso.");
}

function variableValue(valueType, initializer, context) {
  if (!initializer) return unknownValue(valueType, "La variable no tiene un valor inicial conocido.");
  if (initializer.type === "InitializerList") {
    return unknownValue(valueType, "Las listas de inicialización no se simulan todavía.");
  }
  const result = evaluateExpression(initializer, context);
  return { ...result, type: valueType ?? result.type };
}

export class SimulationEngine {
  constructor({ ast, source, diagram, circuit = null, onStateChange = () => {} }) {
    if (!ast || !Array.isArray(ast.body) || !diagram?.nodes || !diagram?.edges) {
      throw new TypeError("El simulador necesita un AST y un diagrama válidos.");
    }
    this.ast = ast;
    this.source = source;
    this.diagram = diagram;
    this.circuit = circuit;
    this.onStateChange = onStateChange;
    this.state = createSimulationState();
    this.state.circuitInputs = this.circuit?.getInitialInputs() ?? {};
    this.history = [];
    this.maxSteps = 500;
    this.functions = new Map(
      ast.body
        .filter((node) => node.type === "FunctionDeclaration" && node.body)
        .map((node) => [getNodeName(node), node]),
    );
    this.currentFunction = null;
    this.notify();
  }

  notify() {
    this.onStateChange(this.getState());
  }

  getState() {
    return cloneSimulationState(this.state);
  }

  get started() {
    return this.state.status !== "idle";
  }

  get active() {
    return ["paused", "running", "waiting-input"].includes(this.state.status);
  }

  setMaxSteps(value) {
    const maxSteps = Number(value);
    if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 10000) {
      throw new RangeError("El límite debe ser un entero entre 1 y 10000 pasos.");
    }
    const previousMax = this.maxSteps;
    this.state.maxSteps = maxSteps;
    this.maxSteps = maxSteps;
    if (this.state.status === "limit" && maxSteps > previousMax && this.state.step < maxSteps) {
      this.state.status = "paused";
      this.state.message = `Límite ampliado a ${maxSteps}; puedes continuar.`;
    } else if (this.state.step >= maxSteps && ["paused", "running"].includes(this.state.status)) {
      this.state.status = "limit";
      this.state.message = `Se alcanzó el límite de ${maxSteps} pasos. Reinicia o aumenta el límite para continuar.`;
    }
    this.notify();
  }

  start(functionName = this.diagram.functionName) {
    const isGlobalDiagram = ["Inicialización global", "Notas globales"].includes(functionName);
    const functionNode = this.functions.get(functionName) ?? (isGlobalDiagram
      ? {
          id: "global-simulation-function",
          type: "FunctionDeclaration",
          data: { name: functionName },
          startLine: this.diagram.startLine,
          body: {
            type: "BlockStatement",
            body: this.ast.body.filter((node) =>
              ["VariableDeclaration", "UnsupportedDeclaration", "Comment"].includes(node.type),
            ),
          },
          parameters: [],
        }
      : null);
    if (!functionNode) {
      throw new Error(`No se encontró la función «${functionName}» en el AST.`);
    }
    this.currentFunction = functionNode;
    this.state = createSimulationState();
    this.state.circuitInputs = this.circuit?.getInitialInputs() ?? {};
    this.state.status = "paused";
    this.state.maxSteps = this.maxSteps;
    this.state.message = `Simulación iniciada en ${functionName}().`;
    this.state.tasks = [{ type: "statement", node: functionNode.body }];
    const scope = { name: functionName, variables: {} };
    for (const parameter of functionNode.parameters ?? []) {
      const name = getNodeName(parameter);
      if (name) scope.variables[name] = unknownValue(nodeData(parameter, "valueType"), "Define un valor inicial para este parámetro.");
    }
    this.state.scopes = [scope];

    if (!isGlobalDiagram) {
      const context = {
        scopes: this.state.scopes,
        globalVariables: this.state.globalVariables,
        call: () => unknownValue(null, "Las llamadas en inicializadores globales no se ejecutan."),
      };
      for (const node of this.ast.body) {
        if (node.type !== "VariableDeclaration" || !node.data?.isGlobal) continue;
        this.initializeDeclaration(node, context, this.state.globalVariables);
      }
    }
    const startNode = this.diagram.nodes.find((node) => node.kind === "start");
    this.setCurrentNode(startNode?.id ?? null, null, "Inicio de la función.");
    this.history = [];
    this.addEvent("system", "[SIMULACIÓN INICIADA]", null, { step: 0 });
    this.notify();
  }

  invalidate(message = "La simulación se invalidó porque cambió el código o la función.") {
    this.state = createSimulationState();
    this.state.status = "idle";
    this.state.message = message;
    this.currentFunction = null;
    this.history = [];
    this.notify();
  }

  pause() {
    if (this.state.status === "running") {
      this.state.status = "paused";
      this.state.message = "Simulación pausada.";
      this.notify();
    }
  }

  provideInput(rawValue) {
    if (this.state.status !== "waiting-input" || !this.state.waitingInput) {
      throw new Error("La simulación no está esperando una lectura de sensor.");
    }
    const { callName, type } = this.state.waitingInput;
    const parsed = type === "digital"
      ? parseUserValue(rawValue, "boolean")
      : parseUserValue(rawValue, "number");
    if (!parsed.known) throw new TypeError(parsed.reason);
    const value = callName === "digitalRead" ? (parsed.value ? 1 : 0) : parsed.value;
    this.state.pendingInput = { callName, value };
    this.state.waitingInput = null;
    this.state.status = "paused";
    this.state.message = `Valor simulado recibido para ${callName}().`;
    this.notify();
  }

  setCircuitInput(componentId, value) {
    if (!this.circuit || !Object.hasOwn(this.circuit.getInitialInputs(), componentId)) {
      throw new Error("No se encontró la entrada virtual del componente.");
    }
    this.state.circuitInputs[componentId] = value;
    this.notify();
    if (this.state.status !== "waiting-input" || !this.state.waitingInput) return this.getState();
    const { callName, pin } = this.state.waitingInput;
    const reading = this.circuit.readInput(callName, pin, this.state.pins, this.state.circuitInputs);
    if (!reading.known) return this.getState();
    this.state.pendingInput = { callName, value: reading.value };
    this.state.waitingInput = null;
    this.state.status = "paused";
    this.state.message = `Valor del componente virtual recibido para ${callName}().`;
    return this.stepForward();
  }

  setVariable(name, rawValue) {
    const variable = this.findVariable(name);
    if (!variable) throw new Error(`No se encontró la variable «${name}».`);
    const parsed = parseUserValue(rawValue, variable.type);
    if (!parsed.known) throw new TypeError(parsed.reason);
    variable.scope.variables[name] = parsed;
    this.state.lastOperation = `Valor inicial de ${name} definido por el usuario: ${String(parsed.value)}.`;
    if (this.state.status === "uncertain" && this.state.retryTask) {
      this.state.tasks.push(this.state.retryTask);
      this.state.retryTask = null;
      this.state.status = "paused";
      this.state.message = `Se actualizó ${name}; puedes volver a evaluar el flujo.`;
    } else {
      this.state.message = `Se actualizó el valor de ${name}.`;
    }
    this.notify();
  }

  findVariable(name) {
    for (let index = this.state.scopes.length - 1; index >= 0; index -= 1) {
      const scope = this.state.scopes[index];
      if (Object.hasOwn(scope.variables, name)) {
        return { scope, type: scope.variables[name].type };
      }
    }
    if (Object.hasOwn(this.state.globalVariables, name)) {
      return {
        scope: { variables: this.state.globalVariables },
        type: this.state.globalVariables[name].type,
      };
    }
    return null;
  }

  stepForward() {
    if (!this.currentFunction) throw new Error("Inicia una simulación antes de avanzar.");
    if (!["paused", "running"].includes(this.state.status)) return this.getState();
    if (this.state.step >= this.state.maxSteps) {
      this.state.status = "limit";
      this.state.message = `Se alcanzó el límite de ${this.state.maxSteps} pasos. Reinicia o aumenta el límite para continuar.`;
      this.notify();
      return this.getState();
    }

    if (!this.state.tasks.length) {
      if (getNodeName(this.currentFunction) === "loop") {
        this.state.tasks.push({ type: "loop-cycle" });
      } else {
        this.history.push(cloneSimulationState(this.state));
        const endNode = this.diagram.nodes.find((node) => node.kind === "end");
        this.setCurrentNode(endNode?.id ?? null, null, `Fin de ${getNodeName(this.currentFunction)}().`);
        this.state.status = "completed";
        this.state.message = "La función terminó.";
        this.addEvent("system", "[SIMULACIÓN FINALIZADA]", null, { step: this.state.step + 1 });
        this.state.step += 1;
        this.notify();
        return this.getState();
      }
    }

    const before = cloneSimulationState(this.state);
    this.history.push(before);
    try {
      let internalActions = 0;
      let visible = false;
      while (!visible && this.state.tasks.length && internalActions < 1000) {
        const task = this.state.tasks.pop();
        internalActions += 1;
        visible = this.processTask(task);
        if (["uncertain", "waiting-input", "completed", "limit"].includes(this.state.status)) break;
      }
      if (internalActions >= 1000 && !visible) {
        this.state.status = "limit";
        this.state.message = "Se detuvo una secuencia interna demasiado larga para proteger la interfaz.";
      } else if (
        !this.state.tasks.length &&
        !["uncertain", "waiting-input", "limit"].includes(this.state.status) &&
        getNodeName(this.currentFunction) === "loop"
      ) {
        this.state.tasks.push({ type: "loop-cycle" });
      }
      if (visible && !["waiting-input", "limit"].includes(this.state.status)) {
        this.state.step += 1;
      }
      this.notify();
    } catch (error) {
      if (!(error instanceof SimulationInputRequired)) {
        this.history.pop();
        this.state = before;
        throw error;
      }
      this.state = before;
      const waitingTask = this.state.tasks.at(-1);
      const waitingNode = waitingTask?.type === "statement" ? waitingTask.node : error.node;
      if (waitingNode) {
        const preferredKinds = ["IfStatement", "ForStatement", "WhileStatement", "DoWhileStatement", "SwitchStatement"]
          .includes(waitingNode.type)
          ? ["decision"]
          : [];
        const graphNode = this.resolveGraphNode(waitingNode, preferredKinds);
        this.setCurrentNode(
          graphNode?.id ?? this.state.currentNodeId,
          waitingNode,
          `Esperando un valor de entrada para ${error.callName}().`,
        );
      }
      this.state.waitingInput = {
        callName: error.callName,
        type: error.callName === "digitalRead" ? "digital" : "analog",
        pin: error.args[0] ?? "desconocido",
        line: error.node?.startLine ?? null,
      };
      if (error.callName === "digitalRead") {
        const pin = String(error.args[0] ?? "desconocido");
        const pinState = this.getPinState(pin);
        pinState.lastRead = "Desconocido (entrada pendiente)";
        pinState.lastOperation = "Lectura pendiente: esperando valor simulado";
        pinState.lastLine = error.node?.startLine ?? null;
        pinState.lastStep = this.state.step + 1;
      }
      this.state.status = "waiting-input";
      this.state.message = `${error.message} Pin: ${String(error.args[0] ?? "desconocido")}.`;
      this.notify();
    }
    return this.getState();
  }

  stepBackward() {
    if (!this.history.length || this.state.status === "waiting-input") return this.getState();
    this.state = this.history.pop();
    this.state.status = "paused";
    this.state.message = "Se retrocedió un paso.";
    this.notify();
    return this.getState();
  }

  restart() {
    if (!this.currentFunction) return this.getState();
    const functionName = getNodeName(this.currentFunction);
    this.start(functionName);
    return this.getState();
  }

  clearConsole() {
    this.state.serialOutput = "";
    this.state.events = [];
    for (const snapshot of this.history) {
      snapshot.serialOutput = "";
      snapshot.events = [];
    }
    this.notify();
  }

  createContext() {
    return {
      scopes: this.state.scopes,
      globalVariables: this.state.globalVariables,
      call: (name, args, node) => this.simulateArduinoCall(name, args, node),
    };
  }

  initializeDeclaration(node, context, target = null) {
    const valueType = nodeData(node, "valueType");
    for (const declaration of node.declarations ?? []) {
      const name = getNodeName(declaration);
      if (!name) continue;
      const value = variableValue(valueType, declaration.initializer, context);
      if (target) target[name] = value;
      else if (context.scopes.length) context.scopes.at(-1).variables[name] = value;
    }
  }

  simulateArduinoCall(name, args, node, argumentResults = []) {
    if (SENSOR_CALLS.has(name)) {
      let pending = this.state.pendingInput;
      if (!pending || pending.callName !== name) {
        const virtualInput = this.circuit?.readInput(
          name,
          args[0],
          this.state.pins,
          this.state.circuitInputs,
        );
        if (virtualInput?.known) {
          pending = { callName: name, value: virtualInput.value };
        } else {
          throw new SimulationInputRequired(name, args, node);
        }
      }
      this.state.pendingInput = null;
      const displayed = name === "digitalRead" ? (pending.value ? "HIGH" : "LOW") : pending.value;
      if (name === "digitalRead") {
        const pin = String(args[0] ?? "?");
        const state = this.getPinState(pin);
        state.value = pending.value ? 1 : 0;
        state.lastRead = displayed;
        state.lastOperation = `Lectura simulada: ${displayed}`;
        this.addEvent("pin", `[PIN ${pin}] Lectura simulada: ${displayed}`, node);
      } else {
        this.addEvent("system", `${name}(${String(args[0] ?? "?")}) → ${String(displayed)} (lectura simulada).`, node);
      }
      return knownValue(pending.value, "number");
    }
    if (PIN_OUTPUT_CALLS.has(name)) {
      if (name === "analogWrite") {
        const pin = argumentResults[0]?.known === false ? "desconocido" : String(args[0] ?? "?");
        const value = argumentResults[1]?.known === false
          ? `desconocido: ${argumentResults[1].reason}`
          : String(args[1] ?? "?");
        this.addEvent("system", `analogWrite: el programa solicita el valor ${value} en el pin ${pin}.`, node);
        return unknownValue(null, "La escritura se registra como evento; no controla hardware.");
      }
      const pin = argumentResults[0]?.known === false ? null : String(args[0] ?? "?");
      const output = argumentResults[1]?.known === false
        ? null
        : args[1] === 1 ? "HIGH" : args[1] === 0 ? "LOW" : null;
      if (pin && pin !== "?") {
        const state = this.getPinState(pin);
        state.lastOperation = output ? `Estado ${output}` : "Escritura con valor desconocido";
        state.value = output ? args[1] : null;
        this.addEvent(
          "pin",
          output
            ? `[PIN ${pin}] Estado ${output}`
            : `[PIN ${pin}] Estado desconocido: ${argumentResults[1]?.reason ?? String(args[1] ?? "?")}`,
          node,
        );
      } else {
        this.addEvent("pin", "[PIN desconocido] Escritura no resuelta; no se actualizó ningún pin.", node);
      }
      return unknownValue(null, "La escritura se registra como evento; no controla hardware.");
    }
    if (PIN_MODE_CALLS.has(name)) {
      const pin = argumentResults[0]?.known === false ? null : String(args[0] ?? "?");
      const mode = argumentResults[1]?.known === false ? null : String(args[1] ?? "?");
      if (pin && pin !== "?") {
        const state = this.getPinState(pin);
        const supportedMode = ["OUTPUT", "INPUT", "INPUT_PULLUP"].includes(mode) ? mode : null;
        state.mode = supportedMode;
        state.lastOperation = supportedMode
          ? `Configurado como ${supportedMode}`
          : `Modo desconocido: ${argumentResults[1]?.reason ?? `${mode} no reconocido`}`;
        this.addEvent(
          "pin",
          supportedMode
            ? `[PIN ${pin}] Configurado como ${supportedMode}`
            : `[PIN ${pin}] Modo desconocido: ${argumentResults[1]?.reason ?? `${mode} no reconocido`}`,
          node,
        );
      } else {
        this.addEvent("pin", "[PIN desconocido] Configuración no resuelta; no se actualizó ningún pin.", node);
      }
      return unknownValue(null, "La configuración se registra como evento; no controla hardware.");
    }
    if (name === "delay") {
      this.addEvent(
        "system",
        `delay: espera simulada de ${String(args[0] ?? "?")} ms (sin bloquear la interfaz).`,
        node,
      );
      return unknownValue(null, "La espera se registra como evento; no se ejecuta realmente.");
    }
    if (name === SERIAL_BEGIN_CALL) {
      const result = argumentResults[0];
      const baudRate = result?.known === false || typeof args[0] !== "number" ? null : args[0];
      this.state.serialBaudRate = Number.isFinite(baudRate) && baudRate > 0 ? baudRate : null;
      const message = this.state.serialBaudRate
        ? `[SERIAL] Velocidad configurada: ${this.state.serialBaudRate} baudios`
        : `[SERIAL] Velocidad desconocida: ${result?.reason ?? String(args[0] ?? "?")}`;
      this.addEvent("serial", message, node);
      return unknownValue(null, "La velocidad serie se configura solo en la simulación.");
    }
    if (SERIAL_CALLS.has(name)) {
      const values = args.map((value, index) => {
        const result = argumentResults[index];
        return result?.known === false ? `[desconocido: ${result.reason}]` : String(value);
      });
      const text = values.join("");
      const lineBreak = name === "Serial.println" ? "\n" : "";
      this.state.serialOutput += text + lineBreak;
      this.addEvent("serial", text || (lineBreak ? "" : "[sin contenido]"), node, {
        lineBreak: name === "Serial.println",
      });
      return unknownValue(null, "La salida se registra en la consola simulada.");
    }
    return unknownValue(null, `La llamada «${name}» no se ejecutó por seguridad.`);
  }

  getPinState(pin) {
    this.state.pins[pin] ??= {
      pin,
      mode: null,
      value: null,
      lastRead: null,
      lastOperation: "Sin operaciones",
      lastLine: null,
      lastStep: 0,
    };
    return this.state.pins[pin];
  }

  addEvent(type, message, node = null, { step = this.state.step + 1, lineBreak = false } = {}) {
    const graphNode = node ? this.resolveGraphNode(node) ?? this.resolveGraphNodeContaining(node) : null;
    const event = {
      id: `${step}:${this.state.events.length + 1}:${node?.id ?? "system"}`,
      type,
      message,
      text: type === "serial" ? message : "",
      lineBreak,
      step,
      line: node?.startLine ?? null,
      astNodeId: node?.id ?? null,
      nodeId: graphNode?.id ?? this.state.currentNodeId,
      blockLabel: graphNode?.label ?? null,
    };
    this.state.events.push(event);
    if (this.state.events.length > 200) this.state.events.shift();
    const pinMatch = /^\[PIN ([^\]]+)\]/.exec(message);
    if (pinMatch && this.state.pins[pinMatch[1]]) {
      this.state.pins[pinMatch[1]].lastLine = event.line;
      this.state.pins[pinMatch[1]].lastStep = step;
    }
  }

  resolveGraphNodeContaining(astNode) {
    if (!Number.isInteger(astNode?.start) || !Number.isInteger(astNode?.end)) return null;
    return this.diagram.nodes
      .filter((node) =>
        node.sourceNavigable &&
        Number.isInteger(node.start) &&
        Number.isInteger(node.end) &&
        node.start <= astNode.start &&
        node.end >= astNode.end,
      )
      .sort((left, right) => (left.end - left.start) - (right.end - right.start))[0] ?? null;
  }

  resolveGraphNode(astNode, preferredKinds = []) {
    if (!astNode?.id) return null;
    const matches = this.diagram.nodes.filter((node) => node.astNodeId === astNode.id);
    for (const kind of preferredKinds) {
      const match = matches.find((node) => node.kind === kind);
      if (match) return match;
    }
    return matches.find((node) => node.sourceNavigable) ?? matches[0] ?? null;
  }

  setCurrentNode(nodeId, astNode, operation, edgeType = null) {
    const previousNodeId = this.state.currentNodeId;
    this.state.currentNodeId = nodeId;
    this.state.currentAstNodeId = astNode?.id ?? null;
    this.state.currentLine = astNode?.startLine ?? null;
    this.state.currentInstruction = astNode ? sourceText(astNode, this.source) : "";
    this.state.lastOperation = operation;

    let edge = this.diagram.edges.find((item) => item.from === previousNodeId && item.to === nodeId);
    if (!edge && edgeType && previousNodeId) {
      edge = this.diagram.edges.find((item) => item.from === previousNodeId && item.type === edgeType);
    }
    this.state.currentEdgeId = edge?.id ?? null;
  }

  processTask(task) {
    switch (task.type) {
      case "statement":
        return this.processStatement(task.node);
      case "loop-check":
        return this.processLoopCheck(task.loop);
      case "loop-after":
        return this.processLoopAfter(task);
      case "do-check":
        return this.processDoCheck(task.loop);
      case "switch-case":
        this.setCurrentNode(task.graphNodeId, task.node, `Se entra en ${task.node.data?.isDefault ? "default" : "case"}.`);
        this.pushStatements(task.node.body ?? []);
        return true;
      case "function-return":
        this.state.scopes.pop();
        return false;
      case "switch-exit":
        return false;
      case "loop-cycle":
        this.setCurrentNode(
          this.diagram.nodes.find((node) => node.kind === "end")?.id ?? null,
          null,
          "Fin de una iteración de loop(); Arduino volverá a invocarla.",
        );
        this.state.loopIterations["arduino-loop"] = (this.state.loopIterations["arduino-loop"] ?? 0) + 1;
        this.state.tasks.push({ type: "loop-repeat-start" });
        return true;
      case "loop-repeat-start":
        this.setCurrentNode(
          this.diagram.nodes.find((node) => node.kind === "start")?.id ?? null,
          null,
          `Comienza la iteración ${this.state.loopIterations["arduino-loop"] + 1} de loop().`,
        );
        this.state.tasks.push({ type: "statement", node: this.currentFunction.body });
        return true;
      default:
        this.markUncertain(null, `Tarea de simulación desconocida: ${task.type}.`);
        return false;
    }
  }

  processStatement(node) {
    if (!node) return false;
    switch (node.type) {
      case "BlockStatement":
        this.pushStatements(node.body ?? []);
        return false;
      case "Comment":
      case "EmptyStatement":
        return false;
      case "VariableDeclaration": {
        this.initializeDeclaration(
          node,
          this.createContext(),
          node.data?.isGlobal ? this.state.globalVariables : null,
        );
        const graphNode = this.resolveGraphNode(node);
        this.setCurrentNode(graphNode?.id ?? null, node, "Declaración de variable procesada.");
        return Boolean(graphNode);
      }
      case "ExpressionStatement":
        return this.processExpressionStatement(node);
      case "IfStatement":
        return this.processIf(node);
      case "ForStatement":
        return this.processFor(node);
      case "WhileStatement":
        this.state.tasks.push({ type: "loop-check", loop: node });
        return false;
      case "DoWhileStatement":
        this.state.loopIterations[node.id] = 1;
        this.scheduleLoopBody(node, "do");
        return false;
      case "SwitchStatement":
        return this.processSwitch(node);
      case "BreakStatement":
        return this.processJump(node, "break");
      case "ContinueStatement":
        return this.processJump(node, "continue");
      case "ReturnStatement":
        return this.processReturn(node);
      case "UnsupportedStatement":
      case "UnsupportedDeclaration":
      case "ErrorNode":
      case "UnknownStatement":
        this.markUncertain(node, "Esta instrucción puede cambiar el flujo y no se puede interpretar con seguridad.");
        return true;
      default: {
        const graphNode = this.resolveGraphNode(node);
        this.setCurrentNode(
          graphNode?.id ?? null,
          node,
          `Instrucción ${node.type} no simulada; se conserva el flujo secuencial.`,
        );
        this.addEvent("system", `No simulado (línea ${node.startLine}): ${sourceText(node, this.source)}`, node);
        return true;
      }
    }
  }

  pushStatements(statements) {
    for (let index = statements.length - 1; index >= 0; index -= 1) {
      this.state.tasks.push({ type: "statement", node: statements[index] });
    }
  }

  processExpressionStatement(node) {
    const expression = node.expression;
    const callName = expression?.type === "FunctionCall" ? getCallName(expression) : null;
    const graphNode = this.resolveGraphNode(node, callName && this.functions.has(callName) ? ["call"] : []);
    const context = this.createContext();

    if (callName && this.functions.has(callName)) {
      const callee = this.functions.get(callName);
      if (this.state.scopes.length >= 100) {
        this.setCurrentNode(graphNode?.id ?? null, node, "Se alcanzó el límite seguro de llamadas anidadas.");
        this.markUncertain(node, "La simulación se detuvo para proteger la interfaz: profundidad máxima de llamadas alcanzada.");
        return true;
      }
      const args = expression.arguments.map((argument) => evaluateExpression(argument, context));
      if (args.some((argument) => !argument.known)) {
        this.setCurrentNode(graphNode?.id ?? null, node, args.find((item) => !item.known).reason);
        this.addEvent(
          "system",
          `Línea ${node.startLine}: no se pudo simular la llamada a ${callName}() porque algún argumento es desconocido.`,
          node,
        );
        return true;
      }
      const scope = { name: callName, variables: {} };
      for (const [index, parameter] of (callee.parameters ?? []).entries()) {
        const name = getNodeName(parameter);
        if (name) scope.variables[name] = args[index] ?? unknownValue(nodeData(parameter, "valueType"), "No se proporcionó argumento.");
      }
      this.state.scopes.push(scope);
      this.state.tasks.push({ type: "function-return", functionName: callName });
      this.state.tasks.push({ type: "statement", node: callee.body });
      this.setCurrentNode(graphNode?.id ?? null, node, `Llamada simulada a ${callName}().`);
      return true;
    }

    if (expression?.type === "FunctionCall") {
      const args = expression.arguments.map((argument) => evaluateExpression(argument, context));
      const detail = args.some((argument) => !argument.known)
        ? args.find((argument) => !argument.known).reason
        : "";
      const evaluatedArgs = args.map((argument) => argument.known ? argument.value : null);
      const reportsUnknownValues = [
        ...PIN_OUTPUT_CALLS,
        ...PIN_MODE_CALLS,
        ...SERIAL_CALLS,
        SERIAL_BEGIN_CALL,
      ].includes(callName);
      const result = args.some((argument) => !argument.known) && !reportsUnknownValues
        ? unknownValue(null, detail)
        : this.simulateArduinoCall(callName, evaluatedArgs, expression, args);
      this.setCurrentNode(
        graphNode?.id ?? null,
        node,
        reportsUnknownValues
          ? `${callName}() registrada en la simulación.`
          : result.known ? `${callName}() evaluada.` : `${callName}() no ejecutada: ${result.reason}`,
      );
      if (!result.known && ![
        ...SENSOR_CALLS,
        ...PIN_OUTPUT_CALLS,
        ...PIN_MODE_CALLS,
        ...SERIAL_CALLS,
        SERIAL_BEGIN_CALL,
        "delay",
      ].includes(callName)) {
        this.addEvent("system", `No simulado (línea ${node.startLine}): ${result.reason}`, node);
      }
      return true;
    }

    const result = evaluateExpression(expression, context);
    this.setCurrentNode(
      graphNode?.id ?? null,
      node,
      result.known ? `Expresión evaluada: ${String(result.value)}.` : `Expresión no evaluada: ${result.reason}`,
    );
    if (!result.known) this.addEvent("system", `Línea ${node.startLine}: ${result.reason}`, node);
    return true;
  }

  processIf(node) {
    const result = booleanCondition(evaluateExpression(node.test, this.createContext()));
    const decision = this.resolveGraphNode(node, ["decision"]);
    if (!result.known) {
      this.setCurrentNode(decision?.id ?? null, node, result.reason ?? "La condición no produjo un resultado booleano.");
      this.state.conditionResult = "desconocida";
      this.markUncertain(
        node,
        `No se puede determinar la rama de if: ${result.reason ?? "condición no booleana"}.`,
        { type: "statement", node },
      );
      return true;
    }
    this.state.conditionResult = result.value ? "verdadera" : "falsa";
    this.setCurrentNode(decision?.id ?? null, node, `Condición if ${this.state.conditionResult}.`, result.value ? "yes" : "no");
    this.state.tasks.push({ type: "statement", node: result.value ? node.consequent : node.alternate });
    return Boolean(decision);
  }

  processFor(node) {
    if (node.initializer) {
      this.state.tasks.push({ type: "loop-check", loop: node });
      this.state.tasks.push({
        type: "statement",
        node: node.initializer.type === "VariableDeclaration"
          ? node.initializer
          : { ...node.initializer, type: "ExpressionStatement", expression: node.initializer },
      });
      return false;
    }
    this.state.tasks.push({ type: "loop-check", loop: node });
    return false;
  }

  processLoopCheck(loop) {
    const decision = this.resolveGraphNode(loop, ["decision"]);
    const result = loop.test
      ? booleanCondition(evaluateExpression(loop.test, this.createContext()))
      : knownValue(true, "boolean");
    if (!result.known) {
      this.setCurrentNode(decision?.id ?? null, loop, result.reason ?? "La condición del bucle no es booleana.");
      this.state.conditionResult = "desconocida";
      this.markUncertain(
        loop,
        `No se puede determinar la siguiente iteración: ${result.reason ?? "condición no booleana"}.`,
        { type: "loop-check", loop },
      );
      return true;
    }
    this.state.conditionResult = result.value ? "verdadera" : "falsa";
    if (!result.value) {
      this.setCurrentNode(decision?.id ?? null, loop, "Condición del bucle falsa; se toma la salida.", "no");
      return Boolean(decision);
    }
    this.state.loopIterations[loop.id] = (this.state.loopIterations[loop.id] ?? 0) + 1;
    this.setCurrentNode(
      decision?.id ?? null,
      loop,
      `Condición verdadera · iteración ${this.state.loopIterations[loop.id]}.`,
      "yes",
    );
    this.scheduleLoopBody(loop, loop.type === "ForStatement" ? "for" : "while");
    return Boolean(decision);
  }

  scheduleLoopBody(loop, loopType) {
    this.state.tasks.push({ type: "loop-after", loop, loopType });
    this.state.tasks.push({ type: "statement", node: loop.body });
  }

  processLoopAfter(task) {
    const { loop, loopType } = task;
    if (loopType === "do") {
      this.state.tasks.push({ type: "do-check", loop });
      return false;
    }
    if (loopType === "for" && loop.update) {
      this.state.tasks.push({ type: "loop-check", loop });
      this.state.tasks.push({ type: "statement", node: {
        ...loop.update,
        type: "ExpressionStatement",
        expression: loop.update,
      } });
      return false;
    }
    this.state.tasks.push({ type: "loop-check", loop });
    return false;
  }

  processDoCheck(loop) {
    const decision = this.resolveGraphNode(loop, ["decision"]);
    const result = booleanCondition(evaluateExpression(loop.test, this.createContext()));
    if (!result.known) {
      this.setCurrentNode(decision?.id ?? null, loop, result.reason ?? "La condición del do while no es booleana.");
      this.state.conditionResult = "desconocida";
      this.markUncertain(
        loop,
        `No se puede determinar la siguiente iteración: ${result.reason ?? "condición no booleana"}.`,
        { type: "do-check", loop },
      );
      return true;
    }
    this.state.conditionResult = result.value ? "verdadera" : "falsa";
    this.setCurrentNode(decision?.id ?? null, loop, `Condición do while ${this.state.conditionResult}.`, result.value ? "yes" : "no");
    if (result.value) {
      this.state.loopIterations[loop.id] = (this.state.loopIterations[loop.id] ?? 0) + 1;
      this.scheduleLoopBody(loop, "do");
    }
    return true;
  }

  processSwitch(node) {
    const value = evaluateExpression(node.discriminant, this.createContext());
    const decision = this.resolveGraphNode(node, ["decision"]);
    if (!value.known) {
      this.setCurrentNode(decision?.id ?? null, node, value.reason);
      this.state.conditionResult = "desconocida";
      this.markUncertain(node, `No se puede elegir un case: ${value.reason}`, {
        type: "statement",
        node,
      });
      return true;
    }
    const cases = (node.cases ?? []).filter((item) => item.type === "CaseStatement");
    let selectedIndex = -1;
    let defaultIndex = -1;
    for (const [index, item] of cases.entries()) {
      if (item.data?.isDefault) {
        defaultIndex = index;
        continue;
      }
      const test = evaluateExpression(item.test, this.createContext());
      if (!test.known) {
        this.setCurrentNode(decision?.id ?? null, node, test.reason);
        this.markUncertain(node, `No se pudo evaluar una etiqueta case: ${test.reason}`, {
          type: "statement",
          node,
        });
        return true;
      }
      if (test.value === value.value) {
        selectedIndex = index;
        break;
      }
    }
    if (selectedIndex < 0) selectedIndex = defaultIndex;
    this.state.conditionResult = selectedIndex < 0 ? "sin coincidencia" : "coincidencia";
    this.setCurrentNode(decision?.id ?? null, node, selectedIndex < 0 ? "Ninguna etiqueta case coincide." : "Se seleccionó una etiqueta case.", selectedIndex < 0 ? "no" : null);
    if (selectedIndex >= 0) {
      this.state.tasks.push({ type: "switch-exit" });
      const selectedGraphNode = this.resolveGraphNode(cases[selectedIndex], ["case"]);
      for (let index = cases.length - 1; index >= selectedIndex; index -= 1) {
        this.state.tasks.push({
          type: "switch-case",
          node: cases[index],
          graphNodeId: this.resolveGraphNode(cases[index], ["case"])?.id ?? selectedGraphNode?.id ?? null,
        });
      }
    }
    return Boolean(decision);
  }

  processJump(node, jumpType) {
    const graphNode = this.resolveGraphNode(node);
    this.setCurrentNode(graphNode?.id ?? null, node, `Se ejecuta ${jumpType}.`);
    const targetTypes = jumpType === "break" ? ["loop-after", "switch-exit"] : ["loop-after"];
    let targetIndex = -1;
    for (let index = this.state.tasks.length - 1; index >= 0; index -= 1) {
      if (targetTypes.includes(this.state.tasks[index].type)) {
        targetIndex = index;
        break;
      }
    }
    if (targetIndex < 0) {
      this.markUncertain(node, `No se encontró el destino de ${jumpType}.`);
      return true;
    }
    if (jumpType === "break") {
      this.state.tasks.splice(targetIndex);
    } else {
      this.state.tasks.splice(targetIndex + 1);
    }
    return Boolean(graphNode);
  }

  processReturn(node) {
    const result = node.argument ? evaluateExpression(node.argument, this.createContext()) : null;
    const graphNode = this.resolveGraphNode(node);
    this.setCurrentNode(
      graphNode?.id ?? null,
      node,
      result && !result.known ? `return no evaluado: ${result.reason}` : "Se retorna desde la función.",
    );
    const marker = this.state.tasks.findLastIndex((task) => task.type === "function-return");
    if (marker >= 0) {
      this.state.tasks.splice(marker);
      this.state.scopes.pop();
      return Boolean(graphNode);
    }
    this.state.tasks = [];
    return Boolean(graphNode);
  }

  markUncertain(node, message, retryTask = null) {
    this.state.status = "uncertain";
    this.state.message = message;
    this.state.lastOperation = node ? sourceText(node, this.source) : message;
    this.state.retryTask = retryTask;
    if (!retryTask) this.state.tasks = [];
  }
}
