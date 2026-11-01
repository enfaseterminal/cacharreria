export function createSimulationState() {
  return {
    status: "idle",
    step: 0,
    maxSteps: 500,
    currentNodeId: null,
    currentEdgeId: null,
    currentAstNodeId: null,
    currentLine: null,
    currentInstruction: "",
    lastOperation: "La simulación todavía no ha comenzado.",
    conditionResult: null,
    loopIterations: {},
    scopes: [],
    globalVariables: {},
    tasks: [],
    events: [],
    serialOutput: "",
    serialBaudRate: null,
    pins: {},
    circuitInputs: {},
    waitingInput: null,
    pendingInput: null,
    retryTask: null,
    message: "Genera el diagrama y pulsa Iniciar para recorrer esta función.",
  };
}

export function cloneSimulationState(state) {
  return {
    ...state,
    loopIterations: { ...state.loopIterations },
    scopes: state.scopes.map((scope) => ({
      ...scope,
      variables: Object.fromEntries(
        Object.entries(scope.variables).map(([name, value]) => [name, { ...value }]),
      ),
    })),
    globalVariables: Object.fromEntries(
      Object.entries(state.globalVariables).map(([name, value]) => [name, { ...value }]),
    ),
    tasks: state.tasks.map((task) => ({ ...task })),
    events: state.events.map((event) => ({ ...event })),
    serialOutput: state.serialOutput,
    serialBaudRate: state.serialBaudRate,
    pins: Object.fromEntries(
      Object.entries(state.pins).map(([pin, stateForPin]) => [pin, { ...stateForPin }]),
    ),
    circuitInputs: { ...state.circuitInputs },
    waitingInput: state.waitingInput ? { ...state.waitingInput } : null,
    pendingInput: state.pendingInput ? { ...state.pendingInput } : null,
    retryTask: state.retryTask ? { ...state.retryTask } : null,
  };
}

export function knownValue(value, type = null) {
  return { known: true, value, type };
}

export function unknownValue(type = null, reason = "El valor todavía no se conoce.") {
  return { known: false, value: null, type, reason };
}
