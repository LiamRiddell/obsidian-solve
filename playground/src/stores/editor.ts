import { defineStore } from 'pinia';
import { ref, type Ref } from 'vue';

export const useEditorStore = defineStore('editor', () => {
  /* ── State ──────────────────────────────────────────────── */
  /** Initially null — first cursor update from CodeMirror sets the real value. */
  const cursorLine = ref<number | null>(null);

  /**
   * Ref to the EditorPane component instance.
   * Used by Sidebar/App to call insertExample() on the CodeMirror editor.
   */
  let editorRef: Ref<{ insertExample(expr: string): void } | null> | null = null;

  /* ── Actions ────────────────────────────────────────────── */
  function setEditorRef(refVal: Ref<{ insertExample(expr: string): void } | null>): void {
    editorRef = refVal;
  }

  function updateCursorLine(line: number): void {
    cursorLine.value = line;
  }

  function insertExample(expression: string): void {
    if (editorRef?.value) {
      editorRef.value.insertExample(expression);
    }
  }

  return {
    cursorLine,
    setEditorRef,
    updateCursorLine,
    insertExample,
  };
});
