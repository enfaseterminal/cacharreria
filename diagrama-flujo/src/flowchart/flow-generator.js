function sourceText(node, source, fallback = "") {
  if (!node || !Number.isInteger(node.start) || !Number.isInteger(node.end)) return fallback;
  return source.slice(node.start, node.end).trim().replace(/\s+/g, " ") || fallback;
}

function statementCanComplete(node) {
  if (!node) return true;
  if (node.type === "ReturnStatement" || node.type === "BreakStatement" || node.type === "ContinueStatement") {
    return false;
  }
  if (node.type === "BlockStatement") return node.body.every(statementCanComplete);
  if (node.type === "IfStatement") {
    return !node.alternate || statementCanComplete(node.consequent) || statementCanComplete(node.alternate);
  }
  return true;
}

function commentsOf(node) {
  return (node?.comments ?? []).map((comment) => ({
    id: comment.id,
    text: comment.text,
    commentType: comment.commentType,
    start: comment.start,
    end: comment.end,
    startLine: comment.startLine,
    endLine: comment.endLine,
    column: comment.column,
    relation: comment.relation,
  }));
}

function createFunctionDiagram(astNode, source, descriptor) {
  const nodes = [];
  const edges = [];
  const functionWarnings = [];
  let connectorCount = 0;
  let nextEdgeId = 1;

  function addNode(ast, kind, label, options = {}) {
    const node = {
      id: options.id ?? `flow-${ast?.id ?? descriptor.id}-${options.suffix ?? kind}`,
      kind,
      label,
      startLine: ast?.startLine ?? descriptor.startLine,
      endLine: ast?.endLine ?? ast?.startLine ?? descriptor.startLine,
      start: ast?.start ?? descriptor.start,
      end: ast?.end ?? descriptor.end,
      astStartLine: ast?.startLine ?? descriptor.startLine,
      astEndLine: ast?.endLine ?? ast?.startLine ?? descriptor.startLine,
      astNodeId: ast?.id ?? null,
      astType: ast?.type ?? null,
      sourceNavigable:
        options.sourceNavigable ??
        Boolean(ast?.id && !["start", "end", "connector"].includes(kind)),
      functionName: descriptor.name,
      comments: commentsOf(ast),
      ...options,
    };
    delete node.suffix;
    nodes.push(node);
    return node.id;
  }

  function connect(from, to, type = "flow", label = "", details = {}) {
    if (!from || !to) return;
    edges.push({ id: `edge-${nextEdgeId++}`, from, to, type, label, ...details });
  }

  function nodeItem(id) {
    return { type: "node", nodeId: id };
  }

  function sequence(items) {
    return { type: "sequence", items };
  }

  function nextConnectorLabel() {
    const index = connectorCount++;
    return index < 26 ? String.fromCharCode(65 + index) : `C${index + 1}`;
  }

  function compileSequence(statements, continuation, context) {
    let entry = continuation;
    const items = [];
    for (let index = statements.length - 1; index >= 0; index -= 1) {
      const statement = statements[index];
      if (statement.type === "Comment") {
        const noteId = addNode(statement, "comment", statement.text, {
          commentType: statement.commentType,
          relation: statement.relation,
        });
        items.unshift(nodeItem(noteId));
        continue;
      }
      const compiled = compileStatement(statement, entry, context);
      entry = compiled.entry;
      items.unshift(compiled.layout);
    }
    return { entry, layout: sequence(items) };
  }

  function compileStatement(ast, continuation, context) {
    if (!ast) return { entry: continuation, layout: sequence([]) };
    if (ast.type === "BlockStatement") return compileSequence(ast.body, continuation, context);

    if (ast.type === "IfStatement") {
      const decision = addNode(ast, "decision", sourceText(ast.test, source, "condición"), {
        start: ast.test?.start ?? ast.start,
        end: ast.test?.end ?? ast.end,
        startLine: ast.test?.startLine ?? ast.startLine,
        endLine: ast.test?.endLine ?? ast.startLine,
      });
      const hasJoin =
        statementCanComplete(ast.consequent) || statementCanComplete(ast.alternate);
      const join = hasJoin
        ? addNode(ast, "connector", nextConnectorLabel(), {
            suffix: "join",
            startLine: ast.endLine,
            endLine: ast.endLine,
          })
        : continuation;
      if (hasJoin) connect(join, continuation);

      const yes = compileStatement(ast.consequent, join, context);
      const no = ast.alternate
        ? compileStatement(ast.alternate, join, context)
        : { entry: join, layout: sequence([]) };
      connect(decision, yes.entry, "yes", "Sí");
      connect(decision, no.entry, "no", "No");
      return {
        entry: decision,
        layout: {
          type: "branch",
          decisionId: decision,
          yes: yes.layout,
          no: no.layout,
          joinId: hasJoin ? join : null,
        },
      };
    }

    if (ast.type === "ForStatement" || ast.type === "WhileStatement" || ast.type === "DoWhileStatement") {
      return compileLoop(ast, continuation, context);
    }

    if (ast.type === "SwitchStatement") return compileSwitch(ast, continuation, context);

    if (ast.type === "ReturnStatement") {
      const id = addNode(ast, "process", ast.argument ? `return ${sourceText(ast.argument, source)};` : "return;");
      connect(id, context.functionEnd, "return", "return");
      return { entry: id, layout: nodeItem(id) };
    }

    if (ast.type === "BreakStatement" || ast.type === "ContinueStatement") {
      const isBreak = ast.type === "BreakStatement";
      const target = isBreak ? context.breakTarget : context.continueTarget;
      const id = addNode(ast, "process", isBreak ? "break;" : "continue;");
      if (target) {
        connect(id, target, isBreak ? "break" : "continue", isBreak ? "break" : "continue");
      } else {
        functionWarnings.push({
          type: "UnresolvedJump",
          message: `La instrucción ${isBreak ? "break" : "continue"} no tiene un destino de control reconocido; se conecta al final de la función.`,
          line: ast.startLine,
          functionName: descriptor.name,
        });
        connect(id, context.functionEnd, "warning", "salida");
      }
      return { entry: id, layout: nodeItem(id) };
    }

    if (ast.type === "EmptyStatement") {
      const id = addNode(ast, "process", "(instrucción vacía)");
      connect(id, continuation);
      return { entry: id, layout: nodeItem(id) };
    }

    const id = compileAtomic(ast);
    connect(id, continuation);
    return { entry: id, layout: nodeItem(id) };
  }

  function compileAtomic(ast) {
    let kind = "process";
    let label = sourceText(ast, source, ast.type);

    if (ast.type === "ExpressionStatement" && ast.expression?.type === "FunctionCall") {
      const callName = ast.expression.callName ?? sourceText(ast.expression.callee, source, "función");
      if (["digitalRead", "analogRead", "millis", "micros"].includes(callName)) kind = "input";
      else if (["digitalWrite", "analogWrite", "Serial.print", "Serial.println"].includes(callName)) kind = "output";
      else kind = "call";
      label = sourceText(ast, source, `${callName}()`);
    } else if (ast.type === "VariableDeclaration") {
      kind = "process";
    } else if (ast.type === "UnsupportedStatement" || ast.type === "UnsupportedDeclaration") {
      functionWarnings.push({
        type: "UnsupportedInstruction",
        message: "Instrucción C++ conservada en un bloque genérico; su flujo interno no se interpreta.",
        line: ast.startLine,
        functionName: descriptor.name,
      });
      label = sourceText(ast, source, "Construcción no interpretada");
    } else if (ast.type === "ErrorNode") {
      functionWarnings.push({
        type: "RecoveredSyntax",
        message: "Fragmento recuperado por el parser, representado como bloque genérico.",
        line: ast.startLine,
        functionName: descriptor.name,
      });
      label = sourceText(ast, source, "Fragmento recuperado");
    } else if (ast.type !== "VariableDeclaration" && ast.type !== "ExpressionStatement") {
      functionWarnings.push({
        type: "GenericInstruction",
        message: `La instrucción ${ast.type} se conserva en un bloque genérico.`,
        line: ast.startLine,
        functionName: descriptor.name,
      });
      label = sourceText(ast, source, ast.type);
    }

    return addNode(ast, kind, label);
  }

  function compileLoop(ast, continuation, context) {
    const isFor = ast.type === "ForStatement";
    const isDo = ast.type === "DoWhileStatement";
    const test = ast.test;
    const conditionLabel = test
      ? sourceText(test, source, "condición")
      : "sin condición (bucle infinito)";
    const condition = addNode(ast, "decision", conditionLabel, {
      suffix: "condition",
      isInfinite: isFor && !test,
      start: test?.start ?? ast.start,
      end: test?.end ?? ast.end,
      startLine: test?.startLine ?? ast.startLine,
      endLine: test?.endLine ?? ast.startLine,
    });

    let initializer = null;
    if (isFor && ast.initializer) {
      initializer = compileAtomic(ast.initializer);
      connect(initializer, condition);
    }

    let update = null;
    if (isFor && ast.update) {
      update = addNode(ast, "process", sourceText(ast.update, source, "actualización"), {
        suffix: "update",
        startLine: ast.update.startLine,
        endLine: ast.update.endLine,
        start: ast.update.start,
        end: ast.update.end,
        astNodeId: ast.update.id,
        comments: commentsOf(ast.update),
      });
      connect(update, condition, "loop-back");
    }

    const bodyContinuation = update ?? condition;
    const nestedContext = {
      ...context,
      breakTarget: continuation,
      continueTarget: bodyContinuation,
    };
    const body = compileStatement(ast.body, bodyContinuation, nestedContext);

    if (isDo) {
      connect(condition, body.entry, "yes", "Sí");
      connect(condition, continuation, "loop-exit", "No");
    } else {
      connect(condition, body.entry, "yes", "Sí");
      if (!isFor || test) connect(condition, continuation, "loop-exit", "No");
    }

    if (isDo) {
      return {
        entry: body.entry,
        layout: { type: "do-loop", conditionId: condition, body: body.layout },
      };
    }

    return {
      entry: initializer ?? condition,
      layout: {
        type: "loop",
        conditionId: condition,
        body: body.layout,
        initializerId: initializer,
        updateId: update,
      },
    };
  }

  function compileSwitch(ast, continuation, context) {
    const decision = addNode(ast, "decision", sourceText(ast.discriminant, source, "valor de selección"), {
      start: ast.discriminant?.start ?? ast.start,
      end: ast.discriminant?.end ?? ast.end,
      startLine: ast.discriminant?.startLine ?? ast.startLine,
      endLine: ast.discriminant?.endLine ?? ast.startLine,
    });
    const join = addNode(ast, "connector", nextConnectorLabel(), {
      suffix: "switch-join",
      startLine: ast.endLine,
      endLine: ast.endLine,
    });
    connect(join, continuation);

    let nextArm = join;
    const arms = [];
    const switchContext = { ...context, breakTarget: join };
    for (let index = ast.cases.length - 1; index >= 0; index -= 1) {
      const caseNode = ast.cases[index];
      if (caseNode.type !== "CaseStatement") {
        functionWarnings.push({
          type: "UnsupportedSwitchEntry",
          message: "Instrucción fuera de una etiqueta case; se muestra como fragmento genérico.",
          line: caseNode.startLine,
          functionName: descriptor.name,
        });
        const fallback = compileStatement(caseNode, nextArm, switchContext);
        arms.unshift({ layout: fallback.layout, entry: fallback.entry, label: "fragmento" });
        nextArm = fallback.entry;
        continue;
      }

      const label = caseNode.data.isDefault
        ? "default"
        : `case ${sourceText(caseNode.test, source, "?")}`;
      const caseId = addNode(caseNode, "case", label, {
        suffix: "case",
        start: caseNode.test?.start ?? caseNode.start,
        end: caseNode.test?.end ?? caseNode.end,
        startLine: caseNode.startLine,
        endLine: caseNode.test?.endLine ?? caseNode.startLine,
      });
      const body = compileSequence(caseNode.body, nextArm, switchContext);
      connect(caseId, body.entry);
      arms.unshift({
        layout: sequence([nodeItem(caseId), body.layout]),
        entry: caseId,
        label,
        isDefault: Boolean(caseNode.data.isDefault),
      });
      nextArm = caseId;
    }

    const hasDefault = arms.some((arm) => arm.isDefault);
    for (const [index, arm] of arms.entries()) {
      connect(decision, arm.entry, "dispatch", arm.label, {
        routeIndex: index,
        dispatchGroup: decision,
      });
    }
    if (!hasDefault) connect(decision, join, "switch-no-match", "Sin coincidencia");

    return {
      entry: decision,
      layout: { type: "switch", decisionId: decision, arms: arms.map((arm) => arm.layout), joinId: join },
    };
  }

  const startId = addNode(astNode, "start", descriptor.startLabel, {
    id: `flow-${descriptor.id}-start`,
    detail: descriptor.startDetail,
  });
  const endId = addNode(astNode, "end", descriptor.endLabel, {
    id: `flow-${descriptor.id}-end`,
    detail: descriptor.endDetail,
  });
  const body = astNode?.body?.type === "BlockStatement" ? astNode.body.body : [];
  const context = { functionEnd: endId, breakTarget: null, continueTarget: null };
  const compiledBody = compileSequence(body, endId, context);
  connect(startId, compiledBody.entry);

  if (descriptor.isLoop) connect(endId, startId, "loop-repeat", "repetición continua de loop()");

  const diagram = {
    id: `diagram-${descriptor.id}`,
    functionName: descriptor.name,
    title: descriptor.title,
    description: descriptor.description,
    functionNodeId: astNode?.id ?? null,
    startLine: descriptor.startLine,
    endLine: descriptor.endLine,
    nodes,
    edges,
    layout: sequence([nodeItem(startId), compiledBody.layout, nodeItem(endId)]),
    warnings: functionWarnings,
  };
  return diagram;
}

function globalDiagram(ast, source) {
  const globals = ast.body.filter((node) =>
    ["VariableDeclaration", "UnsupportedDeclaration", "Comment"].includes(node.type),
  );
  if (!globals.length) return null;
  const hasDeclarations = globals.some((node) => node.type !== "Comment");
  const name = hasDeclarations ? "Inicialización global" : "Notas globales";
  const id = hasDeclarations ? "global-initialization" : "global-notes";

  const pseudoFunction = {
    data: { name },
    start: globals[0]?.start ?? 0,
    end: globals.at(-1)?.end ?? 0,
    startLine: globals[0]?.startLine ?? 1,
    endLine: globals.at(-1)?.endLine ?? 1,
    body: { type: "BlockStatement", body: globals },
  };
  return createFunctionDiagram(
    pseudoFunction,
    source,
    {
      id,
      name,
      title: name,
      description: hasDeclarations
        ? "Declaraciones de ámbito global; no forman parte del cuerpo de una función."
        : "Comentarios independientes fuera de funciones; no representan instrucciones ejecutables.",
      startLabel: "Inicio",
      startDetail: "antes de setup()",
      endLabel: "Fin de inicialización",
      endDetail: "",
      start: pseudoFunction.start,
      end: pseudoFunction.end,
      startLine: pseudoFunction.startLine,
      endLine: pseudoFunction.endLine,
      isLoop: false,
    },
  );
}

export function generateFlowcharts(ast, source = "") {
  if (!ast || ast.type !== "Program" || !Array.isArray(ast.body)) {
    throw new TypeError("Se esperaba un nodo Program válido del AST.");
  }
  if (typeof source !== "string") throw new TypeError("El código fuente debe ser una cadena.");

  const functions = ast.body.filter(
    (node) => node.type === "FunctionDeclaration" && node.body?.type === "BlockStatement",
  );
  const warnings = [];
  const diagrams = [];
  const globals = globalDiagram(ast, source);
  if (globals) {
    diagrams.push(globals);
    warnings.push(...globals.warnings);
  }

  for (const fn of functions) {
    const name = fn.data.name;
    const isSetup = name === "setup";
    const isLoop = name === "loop";
    const diagram = createFunctionDiagram(
      fn,
      source,
      {
        id: fn.id,
        name,
        title: `${name}()`,
        description: isSetup
          ? "Rutina de inicialización: Arduino la ejecuta una vez al arrancar."
          : isLoop
            ? "Rutina principal: Arduino vuelve a ejecutarla continuamente."
            : `Función auxiliar (${fn.data.returnType ?? "función"}).`,
        startLabel: `Inicio: ${name}()`,
        startDetail: isSetup ? "se ejecuta una vez" : isLoop ? "rutina repetida por Arduino" : "función auxiliar",
        endLabel: `Fin: ${name}()`,
        endDetail: isLoop ? "Arduino vuelve a invocar loop()" : "",
        start: fn.start,
        end: fn.end,
        startLine: fn.startLine,
        endLine: fn.endLine,
        isLoop,
      },
    );
    diagrams.push(diagram);
    warnings.push(...diagram.warnings);
  }

  if (!functions.some((fn) => fn.data.name === "setup")) {
    warnings.push({
      type: "MissingSetup",
      message: "No se encontró setup(); se muestran únicamente las funciones disponibles.",
      line: 1,
    });
  }
  if (!functions.some((fn) => fn.data.name === "loop")) {
    warnings.push({
      type: "MissingLoop",
      message: "No se encontró loop(); el diagrama no incluirá una repetición principal de Arduino.",
      line: 1,
    });
  }
  if (!diagrams.length) {
    warnings.push({
      type: "NoFunctions",
      message: "No hay funciones ni declaraciones globales que puedan representarse.",
      line: 1,
    });
  }

  const distinctWarnings = [...new Map(warnings.map((warning) => [
    `${warning.type}:${warning.functionName ?? ""}:${warning.line}`,
    warning,
  ])).values()];
  return {
    diagrams,
    warnings: distinctWarnings,
    counts: {
      functions: functions.length,
      blocks: diagrams.reduce((total, diagram) => total + diagram.nodes.length, 0),
      connections: diagrams.reduce((total, diagram) => total + diagram.edges.length, 0),
    },
  };
}

export function generateFlowchart(ast, source = "", functionName = null) {
  const result = generateFlowcharts(ast, source);
  if (functionName === null) return result.diagrams[0] ?? null;
  return result.diagrams.find((diagram) => diagram.functionName === functionName) ?? null;
}
