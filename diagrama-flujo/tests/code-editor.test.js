// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createCodeEditor } from "../src/editor/code-editor.js";

const mounts = [];
const editors = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  for (const mount of mounts.splice(0)) mount.replaceChildren();
});

describe("CodeMirror flowchart navigation", () => {
  it("highlights and scrolls to a source line without changing the code or cursor", () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    mounts.push(mount);
    Range.prototype.getClientRects ??= () => [];
    Range.prototype.getBoundingClientRect ??= () => ({
      x: 0,
      y: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: 0,
      height: 0,
      toJSON() {},
    });
    const editor = createCodeEditor(mount, "void setup() {\n  pinMode(13, OUTPUT);\n}", () => {}, () => {});
    editors.push(editor);
    const original = editor.getValue();
    const initialSelection = editor.getSelection();

    editor.scrollToLine(2);

    expect(editor.getValue()).toBe(original);
    expect(editor.getSelection()).toEqual(initialSelection);
    expect(mount.querySelector(".cm-flowchart-highlight-line")).not.toBeNull();

    editor.clearHighlight();
    expect(mount.querySelector(".cm-flowchart-highlight-line")).toBeNull();
  });
});
