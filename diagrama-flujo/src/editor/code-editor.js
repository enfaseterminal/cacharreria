import { indentWithTab } from "@codemirror/commands";
import { cpp } from "@codemirror/lang-cpp";
import { indentUnit, syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";
import {
  Decoration,
  drawSelection,
  EditorView,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";

const setFlowchartHighlight = StateEffect.define();
const flowchartHighlight = StateField.define({
  create: () => Decoration.none,
  update(value, transaction) {
    if (transaction.docChanged || transaction.selectionSet) return Decoration.none;
    for (const effect of transaction.effects) {
      if (!effect.is(setFlowchartHighlight)) continue;
      if (effect.value === null) return Decoration.none;
      const lineNumber = Math.max(1, Math.min(transaction.state.doc.lines, effect.value));
      const line = transaction.state.doc.line(lineNumber);
      return Decoration.set(Decoration.line({ class: "cm-flowchart-highlight-line" }).range(line.from));
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const arduinoHighlighting = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword], color: "var(--syntax-keyword)" },
  { tag: [t.typeName, t.standard(t.typeName)], color: "var(--syntax-type)" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--syntax-function)" },
  { tag: [t.variableName, t.propertyName], color: "var(--syntax-variable)" },
  { tag: [t.string, t.special(t.string)], color: "var(--syntax-string)" },
  { tag: [t.number, t.bool, t.null], color: "var(--syntax-number)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: [t.operator, t.punctuation], color: "var(--syntax-operator)" },
]);

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--text-primary)",
    backgroundColor: "var(--editor-background)",
    fontSize: "13px",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
    lineHeight: "1.7",
  },
  ".cm-content": {
    padding: "18px 0",
    caretColor: "var(--accent)",
  },
  ".cm-line": {
    padding: "0 16px",
  },
  ".cm-gutters": {
    color: "var(--text-muted)",
    backgroundColor: "var(--editor-gutter)",
    border: "none",
    borderRight: "1px solid var(--border)",
  },
  ".cm-activeLineGutter": {
    color: "var(--text-primary)",
    backgroundColor: "var(--editor-active-line)",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--editor-active-line)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--selection-background) !important",
  },
});

export function createCodeEditor(parent, initialValue, onChange, onLineCount, onSelectionChange = () => {}) {
  const state = EditorState.create({
    doc: initialValue,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      drawSelection(),
      flowchartHighlight,
      indentUnit.of("  "),
      cpp(),
      syntaxHighlighting(arduinoHighlighting),
      editorTheme,
      EditorView.lineWrapping,
      keymap.of([indentWithTab]),
      EditorView.contentAttributes.of({ "aria-label": "Código fuente Arduino" }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange(update.state.doc.toString());
          onLineCount(update.state.doc.lines);
        }
        if (update.selectionSet && !update.docChanged) {
          const position = update.state.selection.main.head;
          onSelectionChange({
            line: update.state.doc.lineAt(position).number,
            position,
          });
          queueMicrotask(() => {
            if (!destroyed) view.dispatch({ effects: setFlowchartHighlight.of(null) });
          });
        }
      }),
    ],
  });

  const view = new EditorView({ state, parent });
  let destroyed = false;
  onLineCount(view.state.doc.lines);

  return {
    getValue: () => view.state.doc.toString(),
    setValue(value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        selection: { anchor: 0 },
      });
      view.focus();
    },
    scrollToLine(lineNumber) {
      const safeLine = Math.max(1, Math.min(view.state.doc.lines, lineNumber));
      const position = view.state.doc.line(safeLine).from;
      view.dispatch({
        effects: [
          setFlowchartHighlight.of(safeLine),
          EditorView.scrollIntoView(position, { y: "center" }),
        ],
      });
    },
    clearHighlight() {
      view.dispatch({ effects: setFlowchartHighlight.of(null) });
    },
    getSelection: () => view.state.selection.main,
    destroy() {
      destroyed = true;
      view.destroy();
    },
    focus: () => view.focus(),
  };
}
