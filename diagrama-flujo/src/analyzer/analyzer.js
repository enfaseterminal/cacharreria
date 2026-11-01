import { parse } from "../parser/parser.js";
import { tokenize } from "../parser/lexer.js";

const CONTROL_TYPES = new Set([
  "IfStatement",
  "ForStatement",
  "WhileStatement",
  "DoWhileStatement",
  "SwitchStatement",
  "CaseStatement",
]);

const INSTRUCTION_TYPES = new Set([
  "VariableDeclaration",
  "ExpressionStatement",
  "ReturnStatement",
  "BreakStatement",
  "ContinueStatement",
  "IfStatement",
  "ForStatement",
  "WhileStatement",
  "DoWhileStatement",
  "SwitchStatement",
]);

function walkAst(root, visitor) {
  const visited = new Set();
  function visit(value) {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (typeof value.type === "string" && Number.isInteger(value.start)) visitor(value);
    for (const [key, child] of Object.entries(value)) {
      if (["comments", "endToken", "openToken", "data"].includes(key)) continue;
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") visit(child);
    }
  }
  visit(root);
}

function summarize(ast, comments) {
  const functions = [];
  const variables = [];
  const controls = [];
  const instructions = [];
  const functionCalls = [];
  const includes = [];

  walkAst(ast, (node) => {
    if (node.type === "FunctionDeclaration" || node.type === "FunctionPrototype") {
      functions.push({
        name: node.data.name,
        returnType: node.data.returnType,
        parameters: node.parameters ?? [],
        isPrototype: node.type === "FunctionPrototype",
        startLine: node.startLine,
        endLine: node.endLine,
        id: node.id,
      });
    } else if (node.type === "VariableDeclarator") {
      variables.push({
        name: node.data.name,
        valueType: node.valueType ?? "desconocido",
        isArray: (node.arrayDimensions ?? []).length > 0,
        functionName: node.functionName,
        startLine: node.startLine,
        endLine: node.endLine,
        id: node.id,
      });
    } else if (CONTROL_TYPES.has(node.type)) {
      controls.push({
        type: node.type,
        line: node.startLine,
        functionName: node.functionName,
        detail:
          node.type === "CaseStatement"
            ? node.data.isDefault
              ? "default"
              : "case"
            : node.data.name ?? "",
        id: node.id,
      });
    }
    if (INSTRUCTION_TYPES.has(node.type)) instructions.push(node);
    if (node.type === "FunctionCall") {
      functionCalls.push({
        name: node.callName,
        isArduinoFunction: node.isArduinoFunction,
        line: node.startLine,
        functionName: node.functionName,
        id: node.id,
      });
    }
    if (node.type === "IncludeDeclaration") {
      includes.push({ header: node.data.header, line: node.startLine, id: node.id });
    }
  });

  return {
    functions,
    variables,
    controls,
    instructions,
    functionCalls,
    includes,
    counts: {
      functions: functions.filter((item) => !item.isPrototype).length,
      instructions: instructions.length,
      comments: comments.length,
      variables: variables.length,
      controlStructures: controls.filter((item) => item.type !== "CaseStatement").length,
      caseLabels: controls.filter((item) => item.type === "CaseStatement").length,
    },
  };
}

export function analyzeSource(source) {
  const lexical = tokenize(source);
  const parsed = parse(source, lexical);
  const diagnostics = [...lexical.diagnostics, ...parsed.diagnostics].sort(
    (left, right) => left.start - right.start || left.column - right.column,
  );
  const summary = summarize(parsed.ast, parsed.comments);

  return {
    ast: parsed.ast,
    tokens: lexical.tokens.filter((token) => token.kind !== "eof"),
    comments: parsed.comments,
    diagnostics,
    summary,
    success: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
  };
}

export function getAnalyzerStatus(source) {
  return analyzeSource(source);
}
