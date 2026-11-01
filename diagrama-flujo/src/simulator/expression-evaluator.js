import { knownValue, unknownValue } from "./simulation-state.js";

const UNKNOWN = (reason) => unknownValue(null, reason);

export class SimulationInputRequired extends Error {
  constructor(callName, args, node) {
    super(`Introduce un valor simulado para ${callName}().`);
    this.name = "SimulationInputRequired";
    this.callName = callName;
    this.args = args;
    this.node = node;
  }
}

function decodeString(raw) {
  return raw.slice(1, -1).replace(/\\(\\|"|'|n|r|t|0)/g, (_, escape) => {
    const escapes = { n: "\n", r: "\r", t: "\t", 0: "\0" };
    return escapes[escape] ?? escape;
  });
}

function numberFromLiteral(raw) {
  const suffixPattern = /^0[xX]/.test(raw) ? /[uUlL]+$/ : /[uUlLfF]+$/;
  const clean = raw.replace(suffixPattern, "");
  const value = /^0[xX]/.test(clean)
    ? Number.parseInt(clean.slice(2), 16)
    : /^0[bB]/.test(clean)
      ? Number.parseInt(clean.slice(2), 2)
      : Number(clean);
  return Number.isFinite(value) ? knownValue(value, "number") : UNKNOWN("Literal numérico no reconocido.");
}

function getVariable(context, name) {
  for (let index = context.scopes.length - 1; index >= 0; index -= 1) {
    if (Object.hasOwn(context.scopes[index].variables, name)) {
      return context.scopes[index].variables[name];
    }
  }
  if (Object.hasOwn(context.globalVariables, name)) return context.globalVariables[name];
  if (name === "HIGH") return knownValue(1, "constant");
  if (name === "LOW") return knownValue(0, "constant");
  if (name === "INPUT" || name === "OUTPUT" || name === "INPUT_PULLUP") return knownValue(name, "constant");
  if (/^[A-Z]\d+$/.test(name)) return knownValue(name, "constant");
  return UNKNOWN(`La variable «${name}» no está declarada en el estado simulado.`);
}

function setVariable(context, name, value) {
  for (let index = context.scopes.length - 1; index >= 0; index -= 1) {
    if (Object.hasOwn(context.scopes[index].variables, name)) {
      context.scopes[index].variables[name] = value;
      return true;
    }
  }
  if (Object.hasOwn(context.globalVariables, name)) {
    context.globalVariables[name] = value;
    return true;
  }
  return false;
}

function applyUnary(operator, operand) {
  if (!operand.known) return operand;
  switch (operator) {
    case "!": return knownValue(!operand.value, "boolean");
    case "+": return typeof operand.value === "number" ? operand : UNKNOWN("El operador + requiere un número.");
    case "-": return typeof operand.value === "number" ? knownValue(-operand.value, "number") : UNKNOWN("El operador - requiere un número.");
    case "~": return Number.isInteger(operand.value) ? knownValue(~operand.value, "number") : UNKNOWN("El operador ~ requiere un entero.");
    default: return UNKNOWN(`El operador unario «${operator}» no está soportado.`);
  }
}

function applyBinary(operator, left, right) {
  if (!left.known || !right.known) return UNKNOWN(left.reason ?? right.reason);
  const a = left.value;
  const b = right.value;
  try {
    switch (operator) {
      case "+": return typeof a === "string" || typeof b === "string"
        ? knownValue(String(a) + String(b), "string")
        : knownValue(a + b, "number");
      case "-": return knownValue(a - b, "number");
      case "*": return knownValue(a * b, "number");
      case "/": return b === 0 ? UNKNOWN("División por cero.") : knownValue(a / b, "number");
      case "%": return b === 0 ? UNKNOWN("Módulo por cero.") : knownValue(a % b, "number");
      case "<": return knownValue(a < b, "boolean");
      case "<=": return knownValue(a <= b, "boolean");
      case ">": return knownValue(a > b, "boolean");
      case ">=": return knownValue(a >= b, "boolean");
      case "==":
      case "===": return knownValue(a === b, "boolean");
      case "!=":
      case "!==": return knownValue(a !== b, "boolean");
      case "&&": return knownValue(Boolean(a) && Boolean(b), "boolean");
      case "||": return knownValue(Boolean(a) || Boolean(b), "boolean");
      case "&": return knownValue(a & b, "number");
      case "|": return knownValue(a | b, "number");
      case "^": return knownValue(a ^ b, "number");
      case "<<": return knownValue(a << b, "number");
      case ">>": return knownValue(a >> b, "number");
      default: return UNKNOWN(`El operador «${operator}» no está soportado.`);
    }
  } catch {
    return UNKNOWN(`No se pudo evaluar el operador «${operator}».`);
  }
}

function assign(context, node, value) {
  if (node?.type !== "Identifier") return UNKNOWN("Solo se pueden asignar valores a variables simples.");
  if (!setVariable(context, node.name, value)) {
    return UNKNOWN(`La variable «${node.name}» no existe en el estado simulado.`);
  }
  return value;
}

export function evaluateExpression(node, context) {
  if (!node) return UNKNOWN("La expresión está vacía.");
  switch (node.type) {
    case "NumberLiteral":
      return numberFromLiteral(String(node.value));
    case "StringLiteral":
      return knownValue(decodeString(String(node.value)), "string");
    case "CharacterLiteral":
      return knownValue(decodeString(String(node.value)), "character");
    case "BooleanLiteral":
      return knownValue(String(node.value) === "true", "boolean");
    case "Identifier":
      return getVariable(context, node.name);
    case "ParenthesizedExpression":
      return evaluateExpression(node.expression, context);
    case "UnaryExpression": {
      const operator = node.operator;
      const argument = node.argument;
      if (["++", "--"].includes(operator)) {
        const previous = evaluateExpression(argument, context);
        if (!previous.known || typeof previous.value !== "number") {
          return UNKNOWN(`No se puede incrementar «${argument?.name ?? "la expresión"}» porque su valor no es numérico.`);
        }
        const updated = knownValue(previous.value + (operator === "++" ? 1 : -1), "number");
        const result = assign(context, argument, updated);
        return node.prefix === false ? previous : result;
      }
      return applyUnary(operator, evaluateExpression(argument, context));
    }
    case "BinaryExpression": {
      const left = evaluateExpression(node.left, context);
      if (node.operator === "&&" && left.known && !left.value) return knownValue(false, "boolean");
      if (node.operator === "||" && left.known && left.value) return knownValue(true, "boolean");
      return applyBinary(node.operator, left, evaluateExpression(node.right, context));
    }
    case "Assignment": {
      const right = evaluateExpression(node.right, context);
      if (node.operator === "=") return assign(context, node.left, right);
      const operator = node.operator.slice(0, -1);
      return assign(context, node.left, applyBinary(operator, evaluateExpression(node.left, context), right));
    }
    case "ConditionalExpression": {
      const test = evaluateExpression(node.test, context);
      if (!test.known) return test;
      return evaluateExpression(test.value ? node.consequent : node.alternate, context);
    }
    case "FunctionCall": {
      const args = node.arguments.map((argument) => evaluateExpression(argument, context));
      if (args.some((argument) => !argument.known)) {
        return UNKNOWN(args.find((argument) => !argument.known)?.reason ?? "Argumento desconocido.");
      }
      return context.call
        ? context.call(node.callName, args.map((argument) => argument.value), node)
        : UNKNOWN(`La llamada a «${node.callName}» no está soportada aquí.`);
    }
    case "PostfixExpression":
      return UNKNOWN("Esta expresión postfix no está soportada.");
    default:
      return UNKNOWN(`La expresión «${node.type}» no está soportada por el simulador.`);
  }
}

export function expressionHasSensorRead(node) {
  if (!node || typeof node !== "object") return false;
  if (node.type === "FunctionCall" && ["digitalRead", "analogRead"].includes(node.callName)) return true;
  return Object.values(node).some((value) =>
    Array.isArray(value)
      ? value.some(expressionHasSensorRead)
      : value && typeof value === "object" && expressionHasSensorRead(value),
  );
}

export function parseUserValue(raw, type = null) {
  const value = String(raw).trim();
  if (type === "boolean" || type === "bool") {
    if (/^(true|high|1)$/i.test(value)) return knownValue(value.toLowerCase() === "true" || value.toUpperCase() === "HIGH" || value === "1", type);
    if (/^(false|low|0)$/i.test(value)) return knownValue(false, type);
    return unknownValue(type, "Introduce true/false o HIGH/LOW.");
  }
  if (type === "string" || type === "String" || type === "char") return knownValue(value, type);
  const number = Number(value);
  if (value !== "" && Number.isFinite(number)) return knownValue(number, type ?? "number");
  if (/^(HIGH|LOW)$/i.test(value)) return knownValue(value.toUpperCase(), type ?? "constant");
  return unknownValue(type, "Introduce un número, texto o HIGH/LOW válido.");
}
