import {
  createDefaultComponentProperties,
  getArduinoTerminals,
  getComponentTerminals,
  hasValidComponentProperties,
  isArduinoTerminal,
  isComponentType,
  resistorValues,
} from "./circuit-catalog.js";

const STORAGE_KEY = "arduino-flowchart-circuit";
const CIRCUIT_VERSION = 2;
const LEGACY_CIRCUIT_VERSION = 1;
const DIGITAL_PINS = new Set(getArduinoTerminals()
  .filter((terminal) => terminal.kind === "digital")
  .map((terminal) => terminal.id));
const ANALOG_PINS = new Set(getArduinoTerminals()
  .filter((terminal) => terminal.kind === "analog")
  .map((terminal) => terminal.id));
const RAILS = new Set(getArduinoTerminals()
  .filter((terminal) => terminal.kind === "rail")
  .map((terminal) => terminal.id));
const RESISTOR_COLORS = [
  ["negro", "#252525"],
  ["marrón", "#8b4b28"],
  ["rojo", "#e04438"],
  ["naranja", "#ec8428"],
  ["amarillo", "#e9c63f"],
  ["verde", "#329665"],
  ["azul", "#387fc1"],
  ["violeta", "#8457ad"],
  ["gris", "#8b929b"],
  ["blanco", "#f4f4f4"],
];

function initialPosition(index) {
  return { x: 405 + (index % 3) * 112, y: 120 + Math.floor(index / 3) * 88 };
}

function validPosition(position) {
  return Boolean(
    position &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    position.x >= 300 &&
    position.x <= 760 &&
    position.y >= 85 &&
    position.y <= 430,
  );
}

function componentTerminalIds(component) {
  return getComponentTerminals(component.type).map(({ id }) => id);
}

function cloneValue(value) {
  return structuredClone(value);
}

function setRecordValue(record, key, value) {
  Object.defineProperty(record, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function createComponent(id, type) {
  return { id, type, properties: createDefaultComponentProperties(type) };
}

function normalizedCircuit(value) {
  if (
    !value ||
    ![LEGACY_CIRCUIT_VERSION, CIRCUIT_VERSION].includes(value.version) ||
    !Array.isArray(value.components) ||
    !Array.isArray(value.wires) ||
    value.components.some((component) =>
      !component ||
      typeof component.id !== "string" ||
      !component.id ||
      typeof component.type !== "string" ||
      !component.type ||
      !component.properties ||
      typeof component.properties !== "object" ||
      Array.isArray(component.properties) ||
      (isComponentType(component.type) && !hasValidComponentProperties(component.type, component.properties)),
    ) ||
    value.wires.some((wire) =>
      !wire ||
      typeof wire.id !== "string" ||
      !wire.id ||
      typeof wire.from !== "string" ||
      !wire.from ||
      typeof wire.to !== "string" ||
      !wire.to ||
      wire.from === wire.to,
    )
  ) return null;

  const ids = new Set();
  for (const component of value.components) {
    if (ids.has(component.id)) return null;
    ids.add(component.id);
  }
  const wireIds = new Set();
  for (const wire of value.wires) {
    if (wireIds.has(wire.id)) return null;
    wireIds.add(wire.id);
  }
  const savedPositions = value.version === LEGACY_CIRCUIT_VERSION
    ? null
    : value.visual?.positions;
  if (savedPositions !== undefined && savedPositions !== null && (
    typeof savedPositions !== "object" || Array.isArray(savedPositions)
  )) return null;
  const positions = {};
  const components = value.components.map((component, index) => {
    const position = savedPositions?.[component.id] ?? component.position;
    setRecordValue(
      positions,
      component.id,
      validPosition(position) ? { x: position.x, y: position.y } : initialPosition(index),
    );
    const logicalComponent = cloneValue(component);
    delete logicalComponent.position;
    return {
      ...logicalComponent,
      properties: cloneValue(component.properties),
    };
  });
  return {
    version: CIRCUIT_VERSION,
    components,
    visual: { positions },
    wires: value.wires.map((wire) => cloneValue(wire)),
  };
}

function endpointExists(circuit, endpoint) {
  if (endpoint.startsWith("arduino:")) {
    return isArduinoTerminal(endpoint.slice("arduino:".length));
  }
  const separator = endpoint.lastIndexOf(":");
  if (separator < 1) return false;
  const component = circuit.components.find((item) => item.id === endpoint.slice(0, separator));
  return Boolean(component && componentTerminalIds(component).includes(endpoint.slice(separator + 1)));
}

function wireReachable(circuit, start, target) {
  const queue = [start];
  const visited = new Set(queue);
  while (queue.length) {
    const endpoint = queue.shift();
    if (endpoint === target) return true;
    for (const wire of circuit.wires) {
      const neighbor = wire.from === endpoint ? wire.to : wire.to === endpoint ? wire.from : null;
      if (neighbor && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return false;
}

function circuitGraph(circuit, inputs) {
  const edges = circuit.wires.map((wire) => ({ from: wire.from, to: wire.to, resistor: false }));
  for (const component of circuit.components) {
    if (component.type === "resistor") {
      edges.push({
        from: `${component.id}:lead1`,
        to: `${component.id}:lead2`,
        resistor: true,
      });
    } else if (component.type === "button" && inputs[component.id] === true) {
      edges.push({
        from: `${component.id}:contact1`,
        to: `${component.id}:contact2`,
        resistor: false,
      });
    }
  }
  return edges;
}

function graphPath(edges, start, target, requireResistor = false) {
  const queue = [{ endpoint: start, hasResistor: false }];
  const visited = new Set([`${start}:false`]);
  while (queue.length) {
    const current = queue.shift();
    if (current.endpoint === target && (!requireResistor || current.hasResistor)) return true;
    for (const edge of edges) {
      const neighbor = edge.from === current.endpoint
        ? edge.to
        : edge.to === current.endpoint ? edge.from : null;
      if (!neighbor) continue;
      const hasResistor = current.hasResistor || edge.resistor;
      const key = `${neighbor}:${hasResistor}`;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push({ endpoint: neighbor, hasResistor });
      }
    }
  }
  return false;
}

function digitalEndpoint(pin) {
  const normalized = String(pin).toUpperCase();
  return `arduino:${/^\d+$/.test(normalized) ? `D${normalized}` : normalized}`;
}

export function resistorBands(ohms, bandCount = 4, tolerance = 5) {
  if (!resistorValues.includes(Number(ohms)) || ![3, 4, 5].includes(Number(bandCount))) {
    throw new RangeError("Valor o número de bandas de resistencia no admitido.");
  }
  const significantDigits = bandCount === 5 ? 3 : 2;
  const digits = String(Number(ohms)).replace(/0+$/, "");
  const significant = digits.slice(0, significantDigits).padEnd(significantDigits, "0");
  const multiplier = String(Number(ohms)).length - significantDigits;
  const bands = [...significant].map((digit) => RESISTOR_COLORS[Number(digit)][0]);
  bands.push(RESISTOR_COLORS[Math.max(0, Math.min(9, multiplier))][0]);
  if (bandCount !== 3) {
    const toleranceBand = new Map([[1, "marrón"], [2, "rojo"], [5, "dorado"], [10, "plateado"]]).get(Number(tolerance));
    if (!toleranceBand) throw new RangeError("Tolerancia de resistencia no admitida.");
    bands.push(toleranceBand);
  }
  return bands;
}

export function createCircuitModel(storage = globalThis.localStorage, onError = () => {}) {
  let state = { version: CIRCUIT_VERSION, components: [], visual: { positions: {} }, wires: [] };
  let nextId = 1;
  if (storage) {
    try {
      const saved = storage.getItem(STORAGE_KEY);
      if (saved) {
        const savedCircuit = JSON.parse(saved);
        const parsed = normalizedCircuit(savedCircuit);
        if (!parsed) onError(new Error("El montaje guardado no es compatible; se ha iniciado un laboratorio vacío."));
        else {
          state = parsed;
          if (savedCircuit.version !== CIRCUIT_VERSION) persist("visual");
          nextId = Math.max(
            1,
            ...state.components.map((component) => Number(component.id.match(/\d+$/)?.[0] ?? 0) + 1),
            ...state.wires.map((wire) => Number(wire.id.match(/\d+$/)?.[0] ?? 0) + 1),
          );
        }
      }
    } catch (error) {
      onError(new Error(`No se pudo recuperar el montaje del laboratorio: ${error.message}`));
    }
  }

  function snapshot() {
    return cloneValue(state);
  }

  function componentForConsumer(component) {
    return {
      ...cloneValue(component),
      position: { ...state.visual.positions[component.id] },
    };
  }

  function persist(changeType = "topology") {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      onError(new Error(`No se pudo guardar el montaje del laboratorio: ${error.message}`));
    }
    return changeType;
  }

  function update(changeType = "topology") {
    persist(changeType);
    return { state: snapshot(), changeType };
  }

  function createInitialInputs() {
    return Object.fromEntries(state.components
      .filter((component) => component.type === "button" || component.type === "potentiometer")
      .map((component) => [
        component.id,
        component.type === "button" ? Boolean(component.properties.pressed) : Number(component.properties.value),
      ]));
  }

  return {
    getState: snapshot,
    getComponents: () => state.components.map(componentForConsumer),
    getVisualState: () => cloneValue(state.visual),
    getComponentPosition(id) {
      const position = state.visual.positions[id];
      return position ? { ...position } : null;
    },
    getWires: () => state.wires.map((wire) => cloneValue(wire)),
    getInitialInputs: createInitialInputs,
    addComponent(type) {
      if (!isComponentType(type)) throw new TypeError("Tipo de componente desconocido.");
      if (state.components.length >= 12) throw new RangeError("El montaje admite hasta 12 componentes.");
      const component = createComponent(`component-${nextId++}`, type);
      state.components.push(component);
      state.visual.positions[component.id] = initialPosition(state.components.length - 1);
      return { component: componentForConsumer(component), ...update("topology") };
    },
    removeComponent(id) {
      const before = state.components.length;
      state.components = state.components.filter((component) => component.id !== id);
      if (before === state.components.length) return null;
      delete state.visual.positions[id];
      state.wires = state.wires.filter((wire) => !wire.from.startsWith(`${id}:`) && !wire.to.startsWith(`${id}:`));
      return update("topology");
    },
    setComponentPosition(id, position) {
      if (!state.components.some((component) => component.id === id)) {
        throw new Error("El componente seleccionado ya no existe.");
      }
      if (!validPosition(position)) {
        throw new RangeError("La posición debe estar dentro de los límites del montaje.");
      }
      state.visual.positions[id] = { x: position.x, y: position.y };
      return { position: { ...state.visual.positions[id] }, ...update("visual") };
    },
    addWire(from, to) {
      if (from === to || !endpointExists(state, from) || !endpointExists(state, to)) {
        throw new TypeError("Selecciona dos terminales distintos y válidos.");
      }
      if (state.wires.some((wire) =>
        (wire.from === from && wire.to === to) || (wire.from === to && wire.to === from),
      )) throw new Error("Esos terminales ya están conectados.");
      const wire = { id: `wire-${nextId++}`, from, to };
      state.wires.push(wire);
      return { wire: cloneValue(wire), ...update("topology") };
    },
    removeWire(id) {
      const previousLength = state.wires.length;
      state.wires = state.wires.filter((wire) => wire.id !== id);
      if (state.wires.length === previousLength) return null;
      return update("topology");
    },
    updateProperty(id, name, value) {
      const component = state.components.find((item) => item.id === id);
      if (!component) throw new Error("El componente seleccionado ya no existe.");
      if (component.type === "led" && name === "color" && ["rojo", "verde", "amarillo", "azul"].includes(value)) {
        component.properties.color = value;
      } else if (component.type === "resistor" && name === "ohms" && resistorValues.includes(Number(value))) {
        component.properties.ohms = Number(value);
      } else if (component.type === "resistor" && name === "bandCount" && [3, 4, 5].includes(Number(value))) {
        component.properties.bandCount = Number(value);
      } else if (component.type === "resistor" && name === "tolerance" && [1, 2, 5, 10].includes(Number(value))) {
        component.properties.tolerance = Number(value);
      } else if (component.type === "button" && name === "pressed" && typeof value === "boolean") {
        component.properties.pressed = value;
        return { ...update("input"), component: componentForConsumer(component) };
      } else if (component.type === "potentiometer" && name === "value") {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1023) throw new RangeError("El valor debe estar entre 0 y 1023.");
        component.properties.value = parsed;
        return { ...update("input"), component: componentForConsumer(component) };
      } else {
        throw new TypeError("Propiedad de componente no válida.");
      }
      return { ...update("topology"), component: componentForConsumer(component) };
    },
    loadDemo() {
      state = createDemoCircuit();
      nextId = 10;
      return update("topology");
    },
    clear() {
      state = { version: CIRCUIT_VERSION, components: [], visual: { positions: {} }, wires: [] };
      nextId = 1;
      return update("topology");
    },
    getEndpoints() {
      const endpoints = [
        ...getArduinoTerminals().map(({ id: pin }) => ({ id: `arduino:${pin}`, label: `Arduino ${pin}` })),
      ];
      for (const component of state.components) {
        for (const terminal of componentTerminalIds(component)) {
          endpoints.push({
            id: `${component.id}:${terminal}`,
            label: `${component.id} · ${terminal}`,
          });
        }
      }
      return endpoints;
    },
    getWarnings() {
      const warnings = [];
      for (const component of state.components) {
        if (!isComponentType(component.type)) {
          warnings.push(`${component.id}: el componente «${component.type}» se conserva, pero no se simula.`);
          continue;
        }
        for (const terminal of componentTerminalIds(component)) {
          if (!state.wires.some((wire) => wire.from === `${component.id}:${terminal}` || wire.to === `${component.id}:${terminal}`)) {
            warnings.push(`${component.id}: terminal ${terminal} sin conectar.`);
          }
        }
        if (component.type === "led") {
          const edges = circuitGraph(state, createInitialInputs());
          const wiredToPin = [...DIGITAL_PINS].some((pin) =>
            graphPath(edges, `arduino:${pin}`, `${component.id}:anode`, true),
          );
          if (!wiredToPin || !graphPath(edges, `${component.id}:cathode`, "arduino:GND")) {
            warnings.push(`${component.id}: conecta el ánodo a una salida a través de una resistencia y el cátodo a GND.`);
          }
        } else if (component.type === "button") {
          const first = `${component.id}:contact1`;
          const second = `${component.id}:contact2`;
          const endpoints = [...DIGITAL_PINS].map((pin) => `arduino:${pin}`);
          const rails = [...RAILS].map((rail) => `arduino:${rail}`);
          const valid = endpoints.some((pin) =>
            (wireReachable(state, first, pin) && rails.some((rail) => wireReachable(state, second, rail))) ||
            (wireReachable(state, second, pin) && rails.some((rail) => wireReachable(state, first, rail))),
          );
          if (!valid) warnings.push(`${component.id}: conecta un contacto a un pin digital y el otro a GND o 5V.`);
        } else if (component.type === "potentiometer") {
          const valid = [...ANALOG_PINS].some((pin) =>
            this.readInput("analogRead", pin.slice(1), {}, createInitialInputs()).known,
          );
          if (!valid) warnings.push(`${component.id}: conecta el wiper a A0–A5 y los extremos a 5V y GND.`);
        }
      }
      for (const wire of state.wires) {
        if (!endpointExists(state, wire.from) || !endpointExists(state, wire.to)) {
          warnings.push(`${wire.id}: conexión desconocida conservada (${wire.from} ↔ ${wire.to}).`);
        }
      }
      return warnings;
    },
    getLedStates(pinStates = {}, inputs = createInitialInputs()) {
      const edges = circuitGraph(state, inputs);
      const result = {};
      for (const component of state.components.filter((item) => item.type === "led")) {
        const connectedPin = [...DIGITAL_PINS].find((pin) => {
          const digitalPin = pin.slice(1);
          const pinState = pinStates[digitalPin];
          return pinState?.mode === "OUTPUT" &&
            graphPath(edges, `arduino:${pin}`, `${component.id}:anode`, true) &&
            graphPath(edges, `${component.id}:cathode`, "arduino:GND");
        });
        const pinState = connectedPin ? pinStates[connectedPin.slice(1)] : null;
        result[component.id] = {
          connected: Boolean(connectedPin),
          state: !connectedPin || ![0, 1].includes(pinState.value)
            ? "unknown"
            : pinState.value === 1 ? "on" : "off",
          pin: connectedPin ? connectedPin.slice(1) : null,
        };
      }
      return result;
    },
    readInput(callName, pin, pinStates = {}, inputs = createInitialInputs()) {
      if (callName === "digitalRead") {
        const endpoint = digitalEndpoint(pin);
        const pinNumber = endpoint.slice("arduino:D".length);
        const mode = pinStates[pinNumber]?.mode;
        if (!DIGITAL_PINS.has(endpoint.slice("arduino:".length)) || !["INPUT", "INPUT_PULLUP"].includes(mode)) {
          return { known: false, reason: `El pin ${pin} no está configurado como entrada digital.` };
        }
        for (const button of state.components.filter((item) => item.type === "button")) {
          const first = `${button.id}:contact1`;
          const second = `${button.id}:contact2`;
          const railForFirst = ["GND", "5V"].find((rail) => wireReachable(state, first, `arduino:${rail}`));
          const railForSecond = ["GND", "5V"].find((rail) => wireReachable(state, second, `arduino:${rail}`));
          const pinOnFirst = wireReachable(state, first, endpoint);
          const pinOnSecond = wireReachable(state, second, endpoint);
          const rail = pinOnFirst ? railForSecond : pinOnSecond ? railForFirst : null;
          const connected = (pinOnFirst && railForSecond) || (pinOnSecond && railForFirst);
          if (!connected || !rail) continue;
          const pressed = Boolean(inputs[button.id]);
          if (!pressed && mode === "INPUT_PULLUP" && rail === "GND") return { known: true, value: 1 };
          if (!pressed) continue;
          return { known: true, value: rail === "5V" ? 1 : 0 };
        }
        return { known: false, reason: `No hay un pulsador conectado de forma válida al pin ${pin}.` };
      }
      if (callName === "analogRead") {
        const endpoint = `arduino:${String(pin).toUpperCase()}`;
        if (!ANALOG_PINS.has(endpoint.slice("arduino:".length))) {
          return { known: false, reason: `El pin analógico ${pin} no es válido.` };
        }
        for (const potentiometer of state.components.filter((item) => item.type === "potentiometer")) {
          const wiper = `${potentiometer.id}:wiper`;
          const end1 = `${potentiometer.id}:end1`;
          const end2 = `${potentiometer.id}:end2`;
          const poweredRails = [
            [wireReachable(state, end1, "arduino:5V"), wireReachable(state, end2, "arduino:GND")],
            [wireReachable(state, end2, "arduino:5V"), wireReachable(state, end1, "arduino:GND")],
          ];
          if (wireReachable(state, wiper, endpoint) && poweredRails.some(([high, low]) => high && low)) {
            return { known: true, value: Number(inputs[potentiometer.id]) };
          }
        }
        return { known: false, reason: `No hay un potenciómetro conectado de forma válida al pin ${pin}.` };
      }
      return { known: false, reason: "Entrada virtual no admitida." };
    },
  };
}

export function createDemoCircuit() {
  const resistor = createComponent("component-1", "resistor");
  const led = createComponent("component-2", "led");
  led.properties.color = "rojo";
  return {
    version: CIRCUIT_VERSION,
    components: [resistor, led],
    visual: {
      positions: {
        "component-1": initialPosition(0),
        "component-2": initialPosition(1),
      },
    },
    wires: [
      { id: "wire-3", from: "arduino:D13", to: "component-1:lead1" },
      { id: "wire-4", from: "component-1:lead2", to: "component-2:anode" },
      { id: "wire-5", from: "component-2:cathode", to: "arduino:GND" },
    ],
  };
}

export const circuitStorageKey = STORAGE_KEY;
export { resistorValues };
