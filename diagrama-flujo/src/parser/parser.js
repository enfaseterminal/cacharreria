import { createNodeFactory } from "./ast.js";
import { tokenize } from "./lexer.js";

const BUILTIN_TYPES = new Set([
  "bool",
  "char",
  "char16_t",
  "char32_t",
  "double",
  "float",
  "int",
  "long",
  "short",
  "signed",
  "unsigned",
  "void",
  "wchar_t",
  "byte",
  "String",
  "size_t",
]);

const TYPE_QUALIFIERS = new Set([
  "const",
  "constexpr",
  "extern",
  "inline",
  "mutable",
  "register",
  "static",
  "thread_local",
  "volatile",
]);

const NON_RESERVED_TYPE_NAMES = new Set([
  "String",
  "byte",
  "boolean",
  "size_t",
  "word",
  "uint8_t",
  "uint16_t",
  "uint32_t",
  "uint64_t",
  "int8_t",
  "int16_t",
  "int32_t",
  "int64_t",
]);

const COMBINED_BUILTIN_TYPES = new Set(["long", "short", "signed", "unsigned"]);

const ARDUINO_FUNCTIONS = new Set([
  "pinMode",
  "digitalWrite",
  "digitalRead",
  "analogRead",
  "analogWrite",
  "delay",
  "delayMicroseconds",
  "millis",
  "micros",
  "Serial.begin",
  "Serial.print",
  "Serial.println",
  "attachInterrupt",
  "detachInterrupt",
]);

const ASSIGNMENT_OPERATORS = new Set(["=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>="]);

const PRECEDENCE = new Map([
  [",", 1],
  ["=", 2],
  ["+=", 2],
  ["-=", 2],
  ["*=", 2],
  ["/=", 2],
  ["%=", 2],
  ["&=", 2],
  ["|=", 2],
  ["^=", 2],
  ["<<=", 2],
  [">>=", 2],
  ["||", 4],
  ["&&", 5],
  ["|", 6],
  ["^", 7],
  ["&", 8],
  ["==", 9],
  ["!=", 9],
  ["<", 10],
  [">", 10],
  ["<=", 10],
  [">=", 10],
  ["<<", 11],
  [">>", 11],
  ["+", 12],
  ["-", 12],
  ["*", 13],
  ["/", 13],
  ["%", 13],
]);

const CONTROL_TYPES = new Set([
  "IfStatement",
  "ForStatement",
  "WhileStatement",
  "DoWhileStatement",
  "SwitchStatement",
  "CaseStatement",
]);

const STATEMENT_TYPES = new Set([
  "VariableDeclaration",
  "ExpressionStatement",
  "IfStatement",
  "ForStatement",
  "WhileStatement",
  "DoWhileStatement",
  "SwitchStatement",
  "ReturnStatement",
  "BreakStatement",
  "ContinueStatement",
  "FunctionDeclaration",
  "FunctionPrototype",
  "IncludeDeclaration",
  "PreprocessorDirective",
]);

function isIdentifierToken(token) {
  return token?.kind === "identifier" || (token?.kind === "type" && NON_RESERVED_TYPE_NAMES.has(token.text));
}

function isWordToken(token, word) {
  return token?.text === word;
}

function formatFragment(source, start, end) {
  const fragment = source.slice(start, end).split(/\r\n|\r|\n/, 1)[0].trim();
  return fragment.length > 120 ? `${fragment.slice(0, 117)}...` : fragment;
}

function commentNodeFromToken(token, createNode, source) {
  const node = createNode("Comment", token, token, {
    text: token.text,
    commentType: token.commentType,
    column: token.column,
  });
  node.text = token.text;
  node.commentType = token.commentType;
  node.column = token.column;
  node.fragment = formatFragment(source, token.start, token.end);
  node.attachedTo = null;
  node.relation = null;
  return node;
}

class Parser {
  constructor(source, lexerResult) {
    this.source = source;
    this.tokens = lexerResult.tokens.filter((token) => token.kind !== "comment");
    this.comments = lexerResult.comments;
    this.index = 0;
    this.createNode = createNodeFactory();
    this.diagnostics = [];
    this.functionName = null;
  }

  current(offset = 0) {
    return this.tokens[Math.min(this.index + offset, this.tokens.length - 1)];
  }

  previous() {
    return this.tokens[Math.max(0, this.index - 1)];
  }

  advance() {
    const token = this.current();
    if (token.kind !== "eof") this.index += 1;
    return token;
  }

  match(value) {
    if (!isWordToken(this.current(), value)) return null;
    return this.advance();
  }

  expect(value, label = value) {
    if (isWordToken(this.current(), value)) return this.advance();
    this.report(
      "ExpectedToken",
      `Se esperaba "${label}" y se encontró ${this.describe(this.current())}.`,
      this.current(),
    );
    return {
      kind: "punctuation",
      text: value,
      value,
      start: this.current().start,
      end: this.current().start,
      line: this.current().line,
      column: this.current().column,
      endLine: this.current().line,
      endColumn: this.current().column,
      synthetic: true,
    };
  }

  describe(token) {
    return token.kind === "eof" ? "el final del archivo" : `"${token.text}"`;
  }

  report(type, message, token, severity = "error") {
    const start = token?.start ?? this.source.length;
    const end = token?.end ?? start;
    this.diagnostics.push({
      type,
      severity,
      message,
      line: token?.line ?? 1,
      column: token?.column ?? 1,
      fragment: formatFragment(this.source, start, end),
      start,
      end,
    });
  }

  makeNode(type, start, end, data = {}, fields = {}, functionName = this.functionName) {
    const node = this.createNode(type, start, end, data, functionName, fields);
    node.endToken = end;
    return node;
  }

  parse() {
    const first = this.current();
    const body = [];
    while (this.current().kind !== "eof") {
      const before = this.index;
      const item = this.parseTopLevel();
      if (item) body.push(item);
      if (this.index === before) this.advance();
    }

    const sourceStart = {
      start: 0,
      end: 0,
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 1,
    };
    const program = this.makeNode("Program", sourceStart, this.current(), {}, { body }, null);
    this.attachComments(program);
    return {
      ast: program,
      comments: this.commentNodes,
      diagnostics: this.diagnostics,
    };
  }

  parseTopLevel() {
    const token = this.current();
    if (token.kind === "preprocessor") {
      this.advance();
      if (/^\s*#\s*include\b/.test(token.text)) {
        return this.makeNode(
          "IncludeDeclaration",
          token,
          token,
          { directive: token.text.trim(), header: token.text.trim().replace(/^\s*#\s*include\s*/, "") },
        );
      }
      this.report("UnsupportedDirective", "Directiva del preprocesador conservada, pero no interpretada.", token, "warning");
      return this.makeNode("PreprocessorDirective", token, token, { directive: token.text.trim() });
    }
    if (isWordToken(token, ";")) {
      this.advance();
      return this.makeNode("EmptyStatement", token, token);
    }
    if (isWordToken(token, "}")) {
      this.report("UnexpectedClosingBrace", "Llave de cierre sin una llave de apertura correspondiente.", token);
      this.advance();
      return this.makeNode("ErrorNode", token, token, { source: token.text });
    }
    if (isWordToken(token, "else")) {
      this.report("UnexpectedElse", "La palabra else no tiene un if asociado.", token);
      this.advance();
      return this.makeNode("ErrorNode", token, token, { source: token.text }, {}, null);
    }
    if (this.looksLikeFunction(this.index)) return this.parseFunction();
    if (this.looksLikeDeclaration(this.index) || this.startsWithBuiltinType(this.index)) {
      return this.parseVariableDeclaration();
    }
    if (this.isUnsupportedDeclaration(token)) return this.parseUnsupported("UnsupportedDeclaration");

    return this.parseUnsupported("UnsupportedDeclaration");
  }

  isUnsupportedDeclaration(token) {
    return (
      token.kind === "keyword" &&
      ["class", "enum", "namespace", "struct", "template", "typedef", "union", "using"].includes(token.text)
    );
  }

  isUnsupportedStatement(token) {
    return token.kind === "keyword" && ["catch", "goto", "throw", "try"].includes(token.text);
  }

  parseUnsupported(type) {
    const start = this.current();
    this.report(
      "UnsupportedConstruct",
      "Construcción C++ no interpretada; se conserva como fragmento y no se marca como error.",
      start,
      "warning",
    );
    let end = start;
    let braceDepth = 0;
    let consumedBrace = false;
    while (this.current().kind !== "eof") {
      const token = this.advance();
      end = token;
      if (token.text === "{") {
        braceDepth += 1;
        consumedBrace = true;
      } else if (token.text === "}") {
        braceDepth -= 1;
        if (consumedBrace && braceDepth <= 0) break;
      } else if (token.text === ";" && braceDepth === 0) {
        break;
      }
    }
    return this.makeNode(type, start, end, { source: this.source.slice(start.start, end.end), unsupported: true });
  }

  skipTypeQualifiers(index) {
    let cursor = index;
    while (TYPE_QUALIFIERS.has(this.tokens[cursor]?.text)) cursor += 1;
    return cursor;
  }

  startsWithBuiltinType(index) {
    const typeIndex = this.skipTypeQualifiers(index);
    const token = this.tokens[typeIndex];
    return token?.kind === "type" || BUILTIN_TYPES.has(token?.text);
  }

  scanType(index) {
    let cursor = this.skipTypeQualifiers(index);
    const first = this.tokens[cursor];
    if (!first || first.kind === "eof") return null;

    if (first.kind === "type" || BUILTIN_TYPES.has(first.text)) {
      cursor += 1;
      if (COMBINED_BUILTIN_TYPES.has(first.text)) {
        while (COMBINED_BUILTIN_TYPES.has(this.tokens[cursor]?.text) || this.tokens[cursor]?.text === "int" || this.tokens[cursor]?.text === "double" || this.tokens[cursor]?.text === "char") {
          cursor += 1;
        }
      }
    } else if (isIdentifierToken(first)) {
      cursor += 1;
      while (this.tokens[cursor]?.text === "::" && isIdentifierToken(this.tokens[cursor + 1])) cursor += 2;
    } else {
      return null;
    }

    while (this.tokens[cursor]?.text === "*" || this.tokens[cursor]?.text === "&") {
      cursor += 1;
      while (this.tokens[cursor]?.text === "const" || this.tokens[cursor]?.text === "volatile") cursor += 1;
    }
    return { start: index, end: cursor };
  }

  looksLikeFunction(index) {
    const scannedType = this.scanType(index);
    if (!scannedType) return false;
    const name = this.tokens[scannedType.end];
    return isIdentifierToken(name) && this.tokens[scannedType.end + 1]?.text === "(";
  }

  looksLikeDeclaration(index) {
    const scannedType = this.scanType(index);
    if (!scannedType) return false;
    const declarator = this.tokens[scannedType.end];
    if (!isIdentifierToken(declarator)) return false;
    return !["(", "::"].includes(this.tokens[scannedType.end + 1]?.text);
  }

  parseTypeSpec() {
    const startIndex = this.index;
    const scannedType = this.scanType(this.index);
    if (!scannedType) {
      this.report("InvalidDeclaration", "No se pudo identificar el tipo de la declaración.", this.current());
      return "desconocido";
    }
    this.index = scannedType.end;
    return this.tokens.slice(startIndex, scannedType.end).map((token) => token.text).join(" ");
  }

  parseFunction() {
    const start = this.current();
    const returnType = this.parseTypeSpec();
    const nameToken = this.current();
    if (!isIdentifierToken(nameToken)) {
      this.report("InvalidFunction", "Se esperaba el nombre de la función.", nameToken);
      return this.parseUnsupported("ErrorNode");
    }
    this.advance();
    this.expect("(");
    const parameters = this.parseParameters();
    this.expect(")");
    const functionName = nameToken.text;
    for (const parameter of parameters) parameter.functionName = functionName;
    while (["const", "volatile", "noexcept", "override", "final"].includes(this.current().text)) this.advance();

    if (this.match(";")) {
      return this.makeNode(
        "FunctionPrototype",
        start,
        this.previous(),
        { name: functionName, returnType },
        { parameters, body: null },
        null,
      );
    }

    if (!isWordToken(this.current(), "{")) {
      this.report(
        "InvalidFunction",
        "Se esperaba un bloque de función \"{\" o un punto y coma después de la declaración.",
        this.current(),
      );
      const end = this.recoverTo([";", "}"]);
      if (isWordToken(this.current(), ";")) this.advance();
      return this.makeNode(
        "FunctionDeclaration",
        start,
        end,
        { name: functionName, returnType },
        { parameters, body: null },
        null,
      );
    }

    const previousFunction = this.functionName;
    this.functionName = functionName;
    const body = this.parseBlock();
    this.functionName = previousFunction;
    return this.makeNode(
      "FunctionDeclaration",
      start,
      body.endToken,
      { name: functionName, returnType },
      { parameters, body },
      null,
    );
  }

  parseParameters() {
    const parameters = [];
    if (isWordToken(this.current(), ")")) return parameters;
    if (isWordToken(this.current(), "void") && isWordToken(this.current(1), ")")) {
      this.advance();
      return parameters;
    }

    while (this.current().kind !== "eof" && !isWordToken(this.current(), ")")) {
      const start = this.current();
      if (!this.looksLikeDeclaration(this.index)) {
        this.report("InvalidParameter", "Parámetro de función no válido.", start);
        this.recoverTo([",", ")"]);
        if (this.match(",")) continue;
        break;
      }
      const type = this.parseTypeSpec();
      const nameToken = isIdentifierToken(this.current()) ? this.advance() : null;
      if (!nameToken && !isWordToken(this.current(), "[") && !isWordToken(this.current(), "=")) {
        this.report("InvalidParameter", "Se esperaba el nombre del parámetro.", this.current());
      }
      const dimensions = this.parseArrayDimensions();
      const defaultValue = this.match("=") ? this.parseExpression(2) : null;
      const end = defaultValue?.endToken ?? this.previous();
      parameters.push(
        this.makeNode(
          "Parameter",
          start,
          end,
          { name: nameToken?.text ?? null, valueType: type },
          { arrayDimensions: dimensions, defaultValue },
        ),
      );
      if (!this.match(",")) break;
    }
    return parameters;
  }

  parseVariableDeclaration(options = {}) {
    const start = this.current();
    const valueType = this.parseTypeSpec();
    const declarations = [];

    while (this.current().kind !== "eof") {
      while (this.match("*") || this.match("&")) {
        while (this.current().text === "const" || this.current().text === "volatile") this.advance();
      }
      const nameToken = isIdentifierToken(this.current()) ? this.advance() : null;
      if (!nameToken) {
        this.report("InvalidDeclaration", "Se esperaba un identificador de variable.", this.current());
        this.recoverTo(options.inFor ? [";", ")"] : [";", "}"]);
        break;
      }

      const dimensions = this.parseArrayDimensions();
      let initializer = null;
      if (this.match("=")) {
        initializer = this.current().text === "{" ? this.parseInitializerList() : this.parseExpression(2);
      } else if (isWordToken(this.current(), "{")) {
        initializer = this.parseInitializerList();
      }

      const end = initializer?.endToken ?? this.previous();
      declarations.push(
        this.makeNode(
          "VariableDeclarator",
          nameToken,
          end,
          { name: nameToken.text },
          { arrayDimensions: dimensions, initializer },
        ),
      );

      if (!this.match(",")) break;
    }

    let end = declarations.at(-1)?.endToken ?? this.previous();
    if (options.inFor) {
      if (this.match(";")) end = this.previous();
      else if (!isWordToken(this.current(), ";")) {
        this.report("MissingSemicolon", "Falta \";\" al final de la declaración del bucle for.", this.current());
      }
    } else {
      if (this.match(";")) end = this.previous();
      else {
        this.report("MissingSemicolon", "Falta \";\" al final de la declaración.", this.current());
      }
    }

    const declaration = this.makeNode(
      "VariableDeclaration",
      start,
      end,
      { valueType, isGlobal: this.functionName === null },
      { declarations },
    );
    for (const declarator of declarations) declarator.valueType = valueType;
    return declaration;
  }

  parseArrayDimensions() {
    const dimensions = [];
    while (this.match("[")) {
      const open = this.previous();
      const size = isWordToken(this.current(), "]") ? null : this.parseExpression(2);
      const closing = this.expect("]");
      dimensions.push(
        this.makeNode("ArrayDimension", open, closing, {}, { size }),
      );
    }
    return dimensions;
  }

  parseInitializerList() {
    const open = this.expect("{");
    const elements = [];
    while (this.current().kind !== "eof" && !isWordToken(this.current(), "}")) {
      elements.push(this.parseExpression(2));
      if (!this.match(",")) break;
      if (isWordToken(this.current(), "}")) break;
    }
    const closing = this.expect("}");
    return this.makeNode("InitializerList", open, closing, {}, { elements });
  }

  parseBlock() {
    const open = this.expect("{");
    const body = [];
    while (this.current().kind !== "eof" && !isWordToken(this.current(), "}")) {
      const before = this.index;
      const statement = this.parseStatement();
      if (statement) body.push(statement);
      if (before === this.index) this.advance();
    }
    let closing;
    if (this.match("}")) {
      closing = this.previous();
    } else {
      this.report("UnclosedBrace", "Llave de apertura sin su correspondiente \"}\".", open);
      closing = this.current();
    }
    const block = this.makeNode("BlockStatement", open, closing, {}, { body });
    block.endToken = closing;
    return block;
  }

  parseStatement() {
    const token = this.current();
    if (isWordToken(token, "{")) return this.parseBlock();
    if (isWordToken(token, ";")) {
      this.advance();
      return this.makeNode("EmptyStatement", token, token);
    }
    if (isWordToken(token, "if")) return this.parseIf();
    if (isWordToken(token, "for")) return this.parseFor();
    if (isWordToken(token, "while")) return this.parseWhile();
    if (isWordToken(token, "do")) return this.parseDoWhile();
    if (isWordToken(token, "switch")) return this.parseSwitch();
    if (isWordToken(token, "case") || isWordToken(token, "default")) {
      this.report("CaseOutsideSwitch", "Una etiqueta case/default debe estar dentro de switch.", token);
      return this.parseCase();
    }
    if (isWordToken(token, "else")) {
      this.report("UnexpectedElse", "La palabra else no tiene un if asociado.", token);
      this.advance();
      return this.makeNode("ErrorNode", token, token, { source: token.text });
    }
    if (isWordToken(token, "return")) return this.parseReturn();
    if (isWordToken(token, "break")) return this.parseJump("BreakStatement");
    if (isWordToken(token, "continue")) return this.parseJump("ContinueStatement");
    if (token.kind === "preprocessor") return this.parseTopLevel();
    if (this.isUnsupportedDeclaration(token) || this.isUnsupportedStatement(token)) {
      return this.parseUnsupported("UnsupportedStatement");
    }
    if (isIdentifierToken(token) && isWordToken(this.current(1), ":")) {
      return this.parseUnsupported("UnsupportedStatement");
    }
    if (this.looksLikeDeclaration(this.index) || this.startsWithBuiltinType(this.index)) {
      return this.parseVariableDeclaration();
    }
    return this.parseExpressionStatement();
  }

  parseIf() {
    const start = this.advance();
    this.expect("(");
    const test = this.parseExpression(1);
    this.expect(")");
    const consequent = this.parseStatement();
    let alternate = null;
    if (this.match("else")) alternate = this.parseStatement();
    const end = alternate?.endToken ?? consequent?.endToken ?? this.previous();
    const node = this.makeNode(
      "IfStatement",
      start,
      end,
      { hasElse: alternate !== null },
      { test, consequent, alternate },
    );
    node.endToken = end;
    return node;
  }

  parseFor() {
    const start = this.advance();
    this.expect("(");
    let initializer = null;
    if (!isWordToken(this.current(), ";")) {
      initializer = this.looksLikeDeclaration(this.index)
        ? this.parseVariableDeclaration({ inFor: true })
        : this.parseExpressionStatement(true);
    } else {
      this.advance();
    }
    let test = null;
    if (!isWordToken(this.current(), ";")) test = this.parseExpression(1);
    this.expect(";");
    let update = null;
    if (!isWordToken(this.current(), ")")) update = this.parseExpression(1);
    this.expect(")");
    const body = this.parseStatement();
    const end = body?.endToken ?? this.previous();
    const node = this.makeNode(
      "ForStatement",
      start,
      end,
      {},
      { initializer, test, update, body },
    );
    node.endToken = end;
    return node;
  }

  parseWhile() {
    const start = this.advance();
    this.expect("(");
    const test = this.parseExpression(1);
    this.expect(")");
    const body = this.parseStatement();
    const end = body?.endToken ?? this.previous();
    const node = this.makeNode("WhileStatement", start, end, {}, { test, body });
    node.endToken = end;
    return node;
  }

  parseDoWhile() {
    const start = this.advance();
    const body = this.parseStatement();
    this.expect("while");
    this.expect("(");
    const test = this.parseExpression(1);
    this.expect(")");
    const semicolon = this.expect(";", "punto y coma después de do while");
    const end = semicolon.synthetic ? this.previous() : semicolon;
    const node = this.makeNode("DoWhileStatement", start, end, {}, { body, test });
    node.endToken = end;
    return node;
  }

  parseSwitch() {
    const start = this.advance();
    this.expect("(");
    const discriminant = this.parseExpression(1);
    this.expect(")");
    const open = this.expect("{");
    const cases = [];
    while (this.current().kind !== "eof" && !isWordToken(this.current(), "}")) {
      const before = this.index;
      if (isWordToken(this.current(), "case") || isWordToken(this.current(), "default")) {
        cases.push(this.parseCase());
      } else {
        this.report(
          "StatementOutsideCase",
          "Se esperaba una etiqueta case/default dentro de switch.",
          this.current(),
          "warning",
        );
        const statement = this.parseStatement();
        if (statement) cases.push(statement);
      }
      if (before === this.index) this.advance();
    }
    let closing = this.current();
    if (this.match("}")) closing = this.previous();
    else this.report("UnclosedBrace", "Bloque switch sin su correspondiente llave de cierre.", open);
    const node = this.makeNode(
      "SwitchStatement",
      start,
      closing,
      {},
      { discriminant, cases },
    );
    node.endToken = closing;
    return node;
  }

  parseCase() {
    const start = this.advance();
    const isDefault = start.text === "default";
    const test = isDefault ? null : this.parseExpression(2);
    const colon = this.expect(":");
    const body = [];
    while (
      this.current().kind !== "eof" &&
      !isWordToken(this.current(), "}") &&
      !isWordToken(this.current(), "case") &&
      !isWordToken(this.current(), "default")
    ) {
      const before = this.index;
      const statement = this.parseStatement();
      if (statement) body.push(statement);
      if (before === this.index) this.advance();
    }
    const end = body.at(-1)?.endToken ?? colon;
    const node = this.makeNode(
      "CaseStatement",
      start,
      end,
      { isDefault },
      { test, body },
    );
    node.endToken = end;
    return node;
  }

  parseReturn() {
    const start = this.advance();
    const argument = isWordToken(this.current(), ";") ? null : this.parseExpression(1);
    const semicolon = this.expect(";", "punto y coma después de return");
    const end = semicolon.synthetic ? argument?.endToken ?? start : semicolon;
    const node = this.makeNode("ReturnStatement", start, end, {}, { argument });
    node.endToken = end;
    return node;
  }

  parseJump(type) {
    const start = this.advance();
    const semicolon = this.expect(";", "punto y coma después de la instrucción");
    const end = semicolon.synthetic ? start : semicolon;
    const node = this.makeNode(type, start, end);
    node.endToken = end;
    return node;
  }

  parseExpressionStatement(inFor = false) {
    const start = this.current();
    const expression = this.parseExpression(1);
    let end = expression?.endToken ?? start;
    if (inFor) {
      if (this.match(";")) end = this.previous();
    } else if (this.match(";")) {
      end = this.previous();
    } else {
      this.report("MissingSemicolon", "Falta \";\" al final de la instrucción.", this.current());
      if (this.index === 0 || expression?.end === this.current().start) this.advance();
    }
    const node = this.makeNode("ExpressionStatement", start, end, {}, { expression });
    node.endToken = end;
    return node;
  }

  parseExpression(minimumPrecedence = 1) {
    let left = this.parsePrefix();
    if (!left) return this.makeMissingExpression();
    left = this.parsePostfix(left);

    while (this.current().kind !== "eof") {
      const operator = this.current();
      if (operator.text === "?" && minimumPrecedence <= 3) {
        this.advance();
        const consequent = this.parseExpression(1);
        this.expect(":");
        const alternate = this.parseExpression(3);
        left = this.makeNode(
          "ConditionalExpression",
          this.tokenAt(left.start),
          alternate?.endToken ?? this.previous(),
          {},
          { test: left, consequent, alternate },
        );
        left.endToken = alternate?.endToken ?? this.previous();
        continue;
      }

      const operatorText = operator.normalizedOperator ?? operator.text;
      const precedence = PRECEDENCE.get(operatorText);
      if (precedence === undefined || precedence < minimumPrecedence) break;
      this.advance();
      const rightAssociative = ASSIGNMENT_OPERATORS.has(operatorText);
      const right = this.parseExpression(precedence + (rightAssociative ? 0 : 1));
      if (!right) {
        this.report("IncompleteExpression", `La expresión está incompleta después de "${operator.text}".`, operator);
        break;
      }
      const endToken = right.endToken ?? this.previous();
      const type = ASSIGNMENT_OPERATORS.has(operatorText) ? "Assignment" : "BinaryExpression";
      left = this.makeNode(
        type,
        this.tokenAt(left.start),
        endToken,
        { operator: operatorText },
        { operator: operatorText, left, right },
      );
      left.endToken = endToken;
    }
    return left;
  }

  parsePrefix() {
    const token = this.current();
    const prefixOperator = token.normalizedOperator ?? token.text;
    if (["!", "~", "+", "-", "++", "--", "*", "&", "sizeof", "co_await"].includes(prefixOperator)) {
      this.advance();
      const argument = this.parseExpression(14);
      if (!argument) this.report("IncompleteExpression", "Operador unario sin operando.", token);
      const node = this.makeNode(
        "UnaryExpression",
        token,
        argument?.endToken ?? token,
        { operator: prefixOperator, prefix: true },
        { operator: prefixOperator, prefix: true, argument },
      );
      node.endToken = argument?.endToken ?? token;
      return node;
    }
    if (["new", "delete"].includes(token.text)) return this.parseOpaqueExpression();

    if (isIdentifierToken(token)) {
      this.advance();
      const node = this.makeNode("Identifier", token, token, { name: token.text });
      node.name = token.text;
      node.endToken = token;
      return node;
    }
    if (["number", "string", "character"].includes(token.kind) || ["true", "false", "nullptr"].includes(token.text)) {
      this.advance();
      const literalType = token.kind === "number" ? "NumberLiteral" : token.kind === "string" ? "StringLiteral" : token.kind === "character" ? "CharacterLiteral" : "BooleanLiteral";
      const node = this.makeNode(literalType, token, token, { value: token.text });
      node.value = token.text;
      node.endToken = token;
      return node;
    }
    if (this.match("(")) {
      const open = this.previous();
      const expression = this.parseExpression(1);
      const closing = this.expect(")");
      const node = this.makeNode("ParenthesizedExpression", open, closing, {}, { expression });
      node.endToken = closing;
      return node;
    }
    if (isWordToken(token, "{")) return this.parseInitializerList();

    if (
      [";", ")", "]", "}", ":", ","].includes(token.text) ||
      token.kind === "eof"
    ) {
      this.report("IncompleteExpression", "Se esperaba una expresión.", token);
      return null;
    }

    this.report(
      "UnsupportedExpression",
      "Expresión no reconocida; se conserva como fragmento no interpretado.",
      token,
      "warning",
    );
    this.advance();
    const node = this.makeNode("UnknownExpression", token, token, { source: token.text });
    node.endToken = token;
    return node;
  }

  parseOpaqueExpression() {
    const start = this.advance();
    this.report(
      "UnsupportedExpression",
      "Expresión C++ no interpretada; se conserva como fragmento sin detener el análisis.",
      start,
      "warning",
    );
    let end = start;
    let parentheses = 0;
    let brackets = 0;
    let braces = 0;
    while (this.current().kind !== "eof") {
      const current = this.current();
      if (
        parentheses === 0 &&
        brackets === 0 &&
        braces === 0 &&
        [";", ",", ")", "]", "}"].includes(current.text)
      ) {
        break;
      }
      const token = this.advance();
      end = token;
      if (token.text === "(") parentheses += 1;
      else if (token.text === ")" && parentheses > 0) parentheses -= 1;
      else if (token.text === "[") brackets += 1;
      else if (token.text === "]" && brackets > 0) brackets -= 1;
      else if (token.text === "{") braces += 1;
      else if (token.text === "}" && braces > 0) braces -= 1;
    }
    const node = this.makeNode("UnknownExpression", start, end, {
      source: this.source.slice(start.start, end.end),
      unsupported: true,
    });
    return node;
  }

  parsePostfix(expression) {
    let result = expression;
    while (this.current().kind !== "eof") {
      if (this.match("(")) {
        const open = this.previous();
        const argumentsList = [];
        while (this.current().kind !== "eof" && !isWordToken(this.current(), ")")) {
          const before = this.index;
          argumentsList.push(this.parseExpression(2));
          if (!this.match(",")) break;
          if (before === this.index) break;
        }
        const closing = this.expect(")");
        const calleeName = this.getCalleeName(result);
        const node = this.makeNode(
          "FunctionCall",
          this.tokenAt(result.start),
          closing,
          {
            callee: calleeName,
            isArduinoFunction: ARDUINO_FUNCTIONS.has(calleeName),
            functionCategory: ARDUINO_FUNCTIONS.has(calleeName) ? "arduino" : "user-or-library",
          },
          { callee: result, arguments: argumentsList, callName: calleeName, isArduinoFunction: ARDUINO_FUNCTIONS.has(calleeName) },
        );
        node.endToken = closing;
        result = node;
        continue;
      }

      if (this.match("[")) {
        const open = this.previous();
        const index = this.parseExpression(1);
        const closing = this.expect("]");
        const node = this.makeNode(
          "ArrayAccess",
          this.tokenAt(result.start),
          closing,
          {},
          { array: result, index },
        );
        node.openToken = open;
        node.endToken = closing;
        result = node;
        continue;
      }

      if ([".", "->", "::"].includes(this.current().text)) {
        const operator = this.advance();
        const property = this.current();
        if (!isIdentifierToken(property)) {
          this.report("InvalidMemberAccess", "Se esperaba un identificador después del operador de acceso.", property);
          break;
        }
        this.advance();
        const node = this.makeNode(
          "MemberExpression",
          this.tokenAt(result.start),
          property,
          { operator: operator.text, property: property.text },
          { object: result, property: property.text, operator: operator.text },
        );
        node.endToken = property;
        result = node;
        continue;
      }

      if (["++", "--"].includes(this.current().text)) {
        const operator = this.advance();
        const node = this.makeNode(
          "UnaryExpression",
          this.tokenAt(result.start),
          operator,
          { operator: operator.text, prefix: false },
          { operator: operator.text, prefix: false, argument: result },
        );
        node.endToken = operator;
        result = node;
        continue;
      }
      break;
    }
    return result;
  }

  getCalleeName(expression) {
    if (expression?.type === "Identifier") return expression.name;
    if (expression?.type === "MemberExpression") {
      const left = this.getCalleeName(expression.object);
      return left ? `${left}${expression.operator}${expression.property}` : expression.property;
    }
    if (expression?.type === "ParenthesizedExpression") return this.getCalleeName(expression.expression);
    return "<expresión>";
  }

  makeMissingExpression() {
    const token = this.current();
    const node = this.makeNode("UnknownExpression", token, token, { source: "" });
    node.endToken = token;
    return node;
  }

  tokenAt(position) {
    return this.tokens.find((token) => token.start === position) ?? this.current();
  }

  recoverTo(values) {
    let end = this.current();
    while (this.current().kind !== "eof" && !values.includes(this.current().text)) {
      end = this.advance();
    }
    return end;
  }

  attachComments(program) {
    const source = this.source;
    const commentNodes = this.comments.map((token) => commentNodeFromToken(token, this.createNode, source));
    this.commentNodes = commentNodes;
    const allNodes = [];
    const scopes = [];
    const seen = new Set();

    function visit(value) {
      if (!value || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      if (typeof value.type === "string" && Number.isInteger(value.start) && Number.isInteger(value.end)) {
        allNodes.push(value);
        if (value.type === "Program" || value.type === "BlockStatement") scopes.push(value);
      }
      for (const [key, child] of Object.entries(value)) {
        if (key === "comments" || key === "endToken" || key === "openToken") continue;
        if (Array.isArray(child)) child.forEach(visit);
        else if (child && typeof child === "object") visit(child);
      }
    }
    visit(program);

    const statementNodes = allNodes.filter((node) => STATEMENT_TYPES.has(node.type));
    const sourceWithoutComments = source.split("");
    for (const comment of commentNodes) {
      for (let position = comment.start; position < comment.end; position += 1) {
        if (sourceWithoutComments[position] !== "\n" && sourceWithoutComments[position] !== "\r") {
          sourceWithoutComments[position] = " ";
        }
      }
    }
    const maskedSource = sourceWithoutComments.join("");

    for (const comment of commentNodes) {
      let owner = statementNodes
        .filter((node) => node.end <= comment.start && node.endLine === comment.startLine)
        .filter((node) => source.slice(node.end, comment.start).trim() === "")
        .sort((left, right) => left.end - right.end || left.start - right.start)
        .at(-1);
      let relation = owner ? "trailing" : null;

      if (!owner) {
        const nextCandidates = statementNodes
          .filter((node) => node.start >= comment.end)
          .map((node) => {
            const gap = maskedSource.slice(comment.end, node.start);
            const lineBreakCount = (gap.match(/\r\n|\r|\n/g) ?? []).length;
            const interveningComments = commentNodes.filter(
              (other) => other.start >= comment.end && other.end <= node.start,
            ).length;
            return { node, gap, lineBreakCount, interveningComments };
          })
          .filter(
            ({ gap, lineBreakCount, interveningComments }) =>
              gap.trim() === "" && lineBreakCount <= interveningComments + 1,
          )
          .sort((left, right) => left.node.start - right.node.start);
        owner = nextCandidates[0]?.node ?? null;
        if (owner) relation = "leading";
      }

      if (owner) {
        comment.attachedTo = owner.id;
        comment.relation = relation;
        comment.functionName = owner.functionName;
        owner.comments.push(comment);
        continue;
      }

      const scope = scopes
        .filter((candidate) => candidate.start <= comment.start && candidate.end >= comment.end)
        .sort((left, right) => left.end - left.start - (right.end - right.start))[0];
      comment.functionName = scope?.functionName ?? null;
      (scope?.body ?? program.body).push(comment);
    }

    const sortedNodes = new Set();
    const sortNode = (node) => {
      if (!node || typeof node !== "object" || sortedNodes.has(node)) return;
      sortedNodes.add(node);
      for (const [key, child] of Object.entries(node)) {
        if (["comments", "endToken", "openToken"].includes(key)) continue;
        if (Array.isArray(child)) {
          if (child.every((item) => item && typeof item === "object" && Number.isInteger(item.start))) {
            child.sort((left, right) => left.start - right.start);
          }
          child.forEach(sortNode);
        } else if (child && typeof child === "object") sortNode(child);
      }
    };
    sortNode(program);
    program.comments = commentNodes;
  }
}

export function parse(source, lexerResult = tokenize(source)) {
  const parser = new Parser(source, lexerResult);
  return parser.parse();
}

export { ARDUINO_FUNCTIONS, CONTROL_TYPES };
