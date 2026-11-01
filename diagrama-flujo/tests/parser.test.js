import { describe, expect, it } from "vitest";
import { analyzeSource } from "../src/analyzer/analyzer.js";
import { completeArduinoExample } from "../src/examples/complete-arduino-example.js";
import { tokenize } from "../src/parser/lexer.js";
import { parse } from "../src/parser/parser.js";

function findNodes(root, type, results = []) {
  if (!root || typeof root !== "object") return results;
  if (root.type === type) results.push(root);
  for (const [key, value] of Object.entries(root)) {
    if (["comments", "endToken", "openToken", "data"].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((item) => findNodes(item, type, results));
    else if (value && typeof value === "object") findNodes(value, type, results);
  }
  return results;
}

describe("lexer", () => {
  it("tokenizes an empty program and appends EOF", () => {
    const result = tokenize("");
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].kind).toBe("eof");
    expect(result.diagnostics).toEqual([]);
  });

  it("recognizes C++ tokens, arrays, operators, numbers and preprocessor directives", () => {
    const result = tokenize('#include <Arduino.h>\nunsigned long value[2] = {1, 2.5f};\nvalue[0] += 1;\n');
    expect(result.tokens[0]).toMatchObject({ kind: "preprocessor", text: "#include <Arduino.h>" });
    expect(result.tokens.some((token) => token.kind === "type" && token.text === "unsigned")).toBe(true);
    expect(result.tokens.some((token) => token.kind === "number" && token.text === "2.5f")).toBe(true);
    expect(result.tokens.some((token) => token.kind === "operator" && token.text === "+=")).toBe(true);
    expect(result.tokens.some((token) => token.text === "[")).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("preserves line and block comments with exact text and source positions", () => {
    const source = "// lead\r\nint led = 13; /* block\ncomment */\n";
    const { comments } = tokenize(source);
    expect(comments.map((comment) => comment.text)).toEqual([
      "// lead",
      "/* block\ncomment */",
    ]);
    expect(comments[0]).toMatchObject({
      commentType: "line",
      line: 1,
      endLine: 1,
      column: 1,
      start: 0,
      end: 7,
    });
    expect(comments[1]).toMatchObject({
      commentType: "block",
      line: 2,
      endLine: 3,
      column: 15,
    });
  });

  it("does not interpret comment markers inside strings or characters as comments", () => {
    const result = tokenize('Serial.println("// not comment /* text */"); char marker = \'/\';');
    expect(result.comments).toHaveLength(0);
    expect(result.tokens.filter((token) => token.kind === "string")[0].text).toBe('"// not comment /* text */"');
    expect(result.tokens.filter((token) => token.kind === "character")[0].text).toBe("'/'");
  });

  it("recognizes raw strings and comments following preprocessor directives", () => {
    const result = tokenize('#define MESSAGE "/* literal */" // directive comment\nconst char* raw = R"tag(quote " // text /* still text */)tag";');
    expect(result.tokens[0].kind).toBe("preprocessor");
    expect(result.comments.map((comment) => comment.text)).toEqual(["// directive comment"]);
    expect(result.tokens.some((token) => token.kind === "string" && token.stringType === "raw")).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("reports an unterminated block comment", () => {
    const result = tokenize("/* comment");
    expect(result.diagnostics[0]).toMatchObject({
      type: "UnterminatedComment",
      severity: "error",
      line: 1,
      column: 1,
    });
    expect(result.comments[0].text).toBe("/* comment");
  });
});

describe("parser and analyzer", () => {
  it("parses an empty Arduino program", () => {
    const result = analyzeSource("");
    expect(result.ast.type).toBe("Program");
    expect(result.ast.body).toEqual([]);
    expect(result.success).toBe(true);
  });

  it("recognizes setup() and loop() and preserves source locations", () => {
    const result = analyzeSource("// Sketch\nvoid setup() { pinMode(13, OUTPUT); }\nvoid loop() { delay(10); }");
    expect(result.summary.functions.map((item) => item.name)).toEqual(["setup", "loop"]);
    expect(result.summary.functionCalls.map((item) => item.name)).toEqual(["pinMode", "delay"]);
    expect(result.summary.functionCalls.every((item) => item.isArduinoFunction)).toBe(true);
    expect(result.ast).toMatchObject({ start: 0, startLine: 1, endLine: 3 });
    expect(result.summary.functions[1].startLine).toBe(3);
    expect(findNodes(result.ast, "FunctionCall")[0].functionName).toBe("setup");
  });

  it("parses variables, constants, arrays, initializers and indexed accesses", () => {
    const result = analyzeSource(
      "const int led = 13; int samples[3] = {1, 2, 3}; void loop() { samples[0] = led; }",
    );
    expect(result.success).toBe(true);
    expect(result.summary.variables.map((item) => item.name)).toEqual(["led", "samples"]);
    expect(result.summary.variables[1].isArray).toBe(true);
    expect(findNodes(result.ast, "ArrayAccess")).toHaveLength(1);
  });

  it("recognizes Arduino aliases as types and still permits them as identifier names", () => {
    const result = analyzeSource("String message = \"ok\"; int String; void loop() { message = String; }");
    expect(result.summary.variables.map((item) => item.name)).toEqual(["message", "String"]);
    expect(result.diagnostics.some((item) => item.severity === "error")).toBe(false);
    expect(findNodes(result.ast, "Identifier").some((node) => node.name === "String")).toBe(true);
  });

  it("parses combined C++ integer type specifiers", () => {
    const result = analyzeSource("unsigned long led = 13; void loop() {}");
    expect(result.success).toBe(true);
    expect(result.summary.variables[0].valueType).toBe("unsigned long");
  });

  it("attaches leading and trailing comments and preserves unassociated comments", () => {
    const source = `// Variable del LED
int led = 13;
void setup() {
  // Configurar salida
  pinMode(led, OUTPUT);
  digitalWrite(led, HIGH); // encender
  /* nota independiente */
}`;
    const result = analyzeSource(source);
    expect(result.comments).toHaveLength(4);
    expect(result.comments[0].relation).toBe("leading");
    expect(result.comments[0].attachedTo).toBe(findNodes(result.ast, "VariableDeclaration")[0].id);
    expect(result.comments[1].relation).toBe("leading");
    expect(result.comments[2].relation).toBe("trailing");
    expect(result.comments[2].text).toBe("// encender");
    expect(findNodes(result.ast, "Comment")).toHaveLength(1);
  });

  it("parses if, else if, for, while, do while and switch/case/default", () => {
    const source = `void loop() {
      if (true) { delay(1); } else if (false) { delay(2); } else delay(3);
      for (int i = 0; i < 2; i++) { continue; }
      while (false) break;
      do { break; } while (false);
      switch (1) { case 0: break; default: continue; }
    }`;
    const result = analyzeSource(source);
    expect(result.success).toBe(true);
    expect(findNodes(result.ast, "IfStatement")).toHaveLength(2);
    expect(findNodes(result.ast, "ForStatement")).toHaveLength(1);
    expect(findNodes(result.ast, "WhileStatement")).toHaveLength(1);
    expect(findNodes(result.ast, "DoWhileStatement")).toHaveLength(1);
    expect(findNodes(result.ast, "SwitchStatement")).toHaveLength(1);
    expect(findNodes(result.ast, "CaseStatement")).toHaveLength(2);
    expect(findNodes(result.ast, "BreakStatement")).toHaveLength(3);
    expect(findNodes(result.ast, "ContinueStatement")).toHaveLength(2);
  });

  it("recognizes Arduino and unknown user/library calls without flagging unknown names", () => {
    const result = analyzeSource(
      "void loop() { analogRead(A0); Serial.println(unknownLibraryCall(42)); attachInterrupt(0, handler, RISING); }",
    );
    expect(result.success).toBe(true);
    expect(result.summary.functionCalls.find((item) => item.name === "analogRead").isArduinoFunction).toBe(true);
    expect(result.summary.functionCalls.find((item) => item.name === "Serial.println").isArduinoFunction).toBe(true);
    expect(result.summary.functionCalls.find((item) => item.name === "unknownLibraryCall").isArduinoFunction).toBe(false);
    expect(result.summary.functionCalls.find((item) => item.name === "unknownLibraryCall")).toBeDefined();
  });

  it("keeps unsupported C++ declarations as warnings instead of parser errors", () => {
    const result = analyzeSource("class Device { public: void begin(); }; void loop() {}");
    expect(result.success).toBe(true);
    expect(result.diagnostics.some((item) => item.severity === "warning")).toBe(true);
    expect(result.diagnostics.some((item) => item.severity === "error")).toBe(false);
    expect(findNodes(result.ast, "UnsupportedDeclaration")).toHaveLength(1);
  });

  it("recognizes helper function declarations and function prototypes", () => {
    const result = analyzeSource("int readSensor(int pin);\nint readSensor(int pin) { return analogRead(pin); }");
    expect(result.success).toBe(true);
    expect(result.summary.functions.map((item) => [item.name, item.isPrototype])).toEqual([
      ["readSensor", true],
      ["readSensor", false],
    ]);
  });

  it("reports syntax errors in Spanish with locations and continues parsing", () => {
    const source = "void setup() { int value = ; digitalWrite(13, HIGH) }";
    const result = analyzeSource(source);
    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(2);
    expect(result.diagnostics.every((item) => item.message && item.line > 0 && item.column > 0)).toBe(true);
    expect(result.diagnostics.some((item) => item.type === "IncompleteExpression")).toBe(true);
    expect(result.diagnostics.some((item) => item.type === "MissingSemicolon")).toBe(true);
    expect(findNodes(result.ast, "FunctionCall").some((node) => node.data.callee === "digitalWrite")).toBe(true);
  });

  it("reports unclosed delimiters, invalid declarations and missing semicolons", () => {
    const result = analyzeSource("void loop() { int = 4; digitalWrite(13, HIGH) ");
    expect(result.diagnostics.some((item) => item.type === "InvalidDeclaration")).toBe(true);
    expect(result.diagnostics.some((item) => item.type === "MissingSemicolon")).toBe(true);
    expect(result.diagnostics.some((item) => item.type === "UnclosedBrace")).toBe(true);
    expect(result.diagnostics.every((item) => item.message.length > 0 && item.fragment !== undefined)).toBe(true);
  });

  it("analyzes a complete Arduino sketch with multiple structures and comments", () => {
    const result = analyzeSource(completeArduinoExample);
    expect(result.success).toBe(true);
    expect(result.summary.counts).toMatchObject({
      functions: 3,
      comments: 3,
      controlStructures: 6,
    });
    expect(result.summary.functionCalls.some((call) => call.name === "Serial.println" && call.isArduinoFunction)).toBe(true);
    expect(result.comments.some((comment) => comment.text === "// conservar comentario final")).toBe(true);
    expect(result.tokens.some((token) => token.text === '"// esto es texto, no un comentario"')).toBe(true);
  });

  it("retains preprocessor includes in program order", () => {
    const result = parse("#include <Arduino.h>\nvoid setup() {}");
    expect(result.ast.body.map((node) => node.type)).toEqual(["IncludeDeclaration", "FunctionDeclaration"]);
  });
});
