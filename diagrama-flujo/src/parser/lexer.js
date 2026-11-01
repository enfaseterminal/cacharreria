const KEYWORDS = new Set(
  "alignas alignof and and_eq asm auto bitand bitor bool break case catch char8_t class compl concept const consteval constexpr constinit const_cast continue co_await co_return co_yield decltype default delete do else enum explicit export extern false for friend goto if inline mutable namespace new noexcept not not_eq nullptr operator or or_eq private protected public register reinterpret_cast requires return sizeof static static_assert static_cast struct switch template this thread_local throw true try typedef typeid typename union using virtual volatile while xor xor_eq".split(
    " ",
  ),
);

const TYPES = new Set(
  "bool char char8_t char16_t char32_t double float int long short signed void wchar_t unsigned byte boolean String size_t word uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t int64_t".split(" "),
);

const WORD_OPERATORS = new Map([
  ["and", "&&"],
  ["and_eq", "&="],
  ["bitand", "&"],
  ["bitor", "|"],
  ["compl", "~"],
  ["not", "!"],
  ["not_eq", "!="],
  ["or", "||"],
  ["or_eq", "|="],
  ["xor", "^"],
  ["xor_eq", "^="],
]);

const QUALIFIERS = new Set(
  "const constexpr extern inline mutable register signed static thread_local typedef unsigned volatile".split(
    " ",
  ),
);

const OPERATORS = [
  ">>=",
  "<<=",
  "->*",
  "...",
  "++",
  "--",
  "->",
  "&&",
  "||",
  "==",
  "!=",
  "<=",
  ">=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
  "<<",
  ">>",
  ".*",
  "::",
  "##",
  "+",
  "-",
  "*",
  "/",
  "%",
  "=",
  "<",
  ">",
  "!",
  "~",
  "&",
  "|",
  "^",
  "?",
  ":",
];

const PUNCTUATION = new Set(["(", ")", "{", "}", "[", "]", ",", ";", "."]);
const IDENTIFIER_START = /[A-Za-z_$]/;
const IDENTIFIER_PART = /[A-Za-z0-9_$]/;
const LINE_BREAK = /\r\n|\r|\n/g;

function restRawStringPrefix(rest) {
  return rest.match(/^(?:u8|u|U|L)?R"/)?.[0] ?? null;
}

function locationAt(source, position) {
  const before = source.slice(0, position);
  const lineBreaks = before.match(LINE_BREAK);
  const lastBreak = Math.max(before.lastIndexOf("\n"), before.lastIndexOf("\r"));
  return {
    line: (lineBreaks?.length ?? 0) + 1,
    column: position - lastBreak,
  };
}

function endLocation(text, line, column) {
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      line += 1;
      column = 1;
    } else if (text[index] === "\r") {
      if (text[index + 1] !== "\n") {
        line += 1;
        column = 1;
      }
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function diagnostic(source, type, message, start, end = start) {
  const { line, column } = locationAt(source, start);
  const lineStart = Math.max(source.lastIndexOf("\n", start - 1), source.lastIndexOf("\r", start - 1)) + 1;
  const lineEndCandidates = [source.indexOf("\n", start), source.indexOf("\r", start)].filter((index) => index >= 0);
  const lineEnd = lineEndCandidates.length ? Math.min(...lineEndCandidates) : source.length;
  return {
    type,
    severity: "error",
    message,
    line,
    column,
    fragment: source.slice(lineStart, lineEnd).trim(),
    start,
    end,
  };
}

export function tokenize(source) {
  const tokens = [];
  const comments = [];
  const diagnostics = [];
  let position = 0;
  let line = 1;
  let column = 1;

  function advance(end) {
    const text = source.slice(position, end);
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (character === "\n") {
        line += 1;
        column = 1;
      } else if (character === "\r") {
        if (text[index + 1] !== "\n") {
          line += 1;
          column = 1;
        }
      } else {
        column += 1;
      }
    }
    position = end;
  }

  function emit(kind, start, startLine, startColumn, end, extra = {}) {
    const text = source.slice(start, end);
    const endLocationInfo = endLocation(text, startLine, startColumn);
    const token = {
      kind,
      type: kind,
      text,
      value: extra.value ?? text,
      start,
      end,
      line: startLine,
      column: startColumn,
      endLine: endLocationInfo.line,
      endColumn: endLocationInfo.column,
      ...extra,
    };
    tokens.push(token);
    return token;
  }

  while (position < source.length) {
    const character = source[position];
    if (/\s/.test(character)) {
      advance(position + (character === "\r" && source[position + 1] === "\n" ? 2 : 1));
      continue;
    }

    const start = position;
    const startLine = line;
    const startColumn = column;

    if (character === "#" && source.slice(Math.max(source.lastIndexOf("\n", position - 1), source.lastIndexOf("\r", position - 1)) + 1, position).trim() === "") {
      let end = position;
      let quote = null;
      let escaped = false;
      while (end < source.length) {
        const current = source[end];
        if (quote) {
          if (escaped) escaped = false;
          else if (current === "\\") escaped = true;
          else if (current === quote) quote = null;
          end += 1;
          continue;
        }
        if (current === '"' || current === "'") {
          quote = current;
          end += 1;
          continue;
        }
        if (source.startsWith("//", end) || source.startsWith("/*", end)) break;
        if (current !== "\n" && current !== "\r") {
          end += 1;
          continue;
        }
        let backslashes = 0;
        for (let cursor = end - 1; cursor >= start && source[cursor] === "\\"; cursor -= 1) {
          backslashes += 1;
        }
        if (backslashes % 2 === 0) break;
        end += source.startsWith("\r\n", end) ? 2 : 1;
      }
      if (end === position) {
        diagnostics.push(diagnostic(source, "InvalidDirective", "No se pudo leer la directiva del preprocesador.", start));
        end += 1;
      }
      emit("preprocessor", start, startLine, startColumn, end);
      advance(end);
      continue;
    }

    if (source.startsWith("//", position)) {
      let end = position + 2;
      while (end < source.length && source[end] !== "\n" && source[end] !== "\r") end += 1;
      const token = emit("comment", start, startLine, startColumn, end, {
        commentType: "line",
        text: source.slice(start, end),
      });
      comments.push(token);
      advance(end);
      continue;
    }

    if (source.startsWith("/*", position)) {
      const closing = source.indexOf("*/", position + 2);
      const end = closing < 0 ? source.length : closing + 2;
      const token = emit("comment", start, startLine, startColumn, end, {
        commentType: "block",
        text: source.slice(start, end),
      });
      comments.push(token);
      if (closing < 0) {
        diagnostics.push(diagnostic(source, "UnterminatedComment", "Comentario multilínea sin cerrar.", start, end));
      }
      advance(end);
      continue;
    }

    const rawStringPrefix = restRawStringPrefix(source.slice(position));
    if (rawStringPrefix) {
      const delimiterStart = position + rawStringPrefix.length;
      const openParen = source.indexOf("(", delimiterStart);
      const delimiter = openParen < 0 ? "" : source.slice(delimiterStart, openParen);
      const validDelimiter = openParen >= 0 && openParen - delimiterStart <= 16 && !/[\s()\\]/.test(delimiter);
      const closing = validDelimiter ? source.indexOf(`)${delimiter}"`, openParen + 1) : -1;
      const end = closing < 0 ? source.length : closing + delimiter.length + 2;
      emit("string", start, startLine, startColumn, end, { stringType: "raw" });
      if (!validDelimiter || closing < 0) {
        diagnostics.push(diagnostic(source, "UnterminatedString", "Cadena raw sin cerrar correctamente.", start, end));
      }
      advance(end);
      continue;
    }

    if (character === '"' || character === "'") {
      const quote = character;
      let end = position + 1;
      let closed = false;
      while (end < source.length) {
        if (source[end] === "\\") {
          end += Math.min(2, source.length - end);
          continue;
        }
        if (source[end] === quote) {
          end += 1;
          closed = true;
          break;
        }
        if (source[end] === "\n" || source[end] === "\r") break;
        end += 1;
      }
      const kind = quote === '"' ? "string" : "character";
      emit(kind, start, startLine, startColumn, end);
      if (!closed) {
        diagnostics.push(
          diagnostic(
            source,
            "UnterminatedString",
            quote === '"' ? "Cadena de texto sin cerrar." : "Literal de carácter sin cerrar.",
            start,
            end,
          ),
        );
      }
      advance(end);
      continue;
    }

    const rest = source.slice(position);
    const numberMatch = rest.match(
      /^(?:0[xX][\da-fA-F]+|0[bB][01]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(?:[uUlLfF]*)/,
    );
    if (numberMatch) {
      const end = position + numberMatch[0].length;
      emit("number", start, startLine, startColumn, end);
      advance(end);
      continue;
    }

    if (IDENTIFIER_START.test(character)) {
      let end = position + 1;
      while (end < source.length && IDENTIFIER_PART.test(source[end])) end += 1;
      const value = source.slice(position, end);
      const kind = TYPES.has(value)
        ? "type"
        : WORD_OPERATORS.has(value)
          ? "operator"
          : QUALIFIERS.has(value) || KEYWORDS.has(value)
            ? "keyword"
            : "identifier";
      emit(kind, start, startLine, startColumn, end, {
        ...(WORD_OPERATORS.has(value) ? { normalizedOperator: WORD_OPERATORS.get(value) } : {}),
      });
      advance(end);
      continue;
    }

    const operator = OPERATORS.find((candidate) => source.startsWith(candidate, position));
    if (operator) {
      const end = position + operator.length;
      emit("operator", start, startLine, startColumn, end);
      advance(end);
      continue;
    }

    if (PUNCTUATION.has(character)) {
      emit("punctuation", start, startLine, startColumn, start + 1);
      advance(start + 1);
      continue;
    }

    emit("unknown", start, startLine, startColumn, start + 1);
    diagnostics.push(
      diagnostic(source, "UnexpectedCharacter", `Carácter no reconocido: "${character}".`, start, start + 1),
    );
    advance(start + 1);
  }

  const eofLocation = locationAt(source, source.length);
  tokens.push({
    kind: "eof",
    type: "eof",
    text: "",
    value: "",
    start: source.length,
    end: source.length,
    line: eofLocation.line,
    column: eofLocation.column,
    endLine: eofLocation.line,
    endColumn: eofLocation.column,
  });

  return { tokens, comments, diagnostics };
}

export const lexerVocabulary = Object.freeze({
  keywords: [...KEYWORDS],
  types: [...TYPES],
  operators: [...OPERATORS],
});
