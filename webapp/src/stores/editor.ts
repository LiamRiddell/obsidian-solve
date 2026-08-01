import { create } from "zustand"

interface EditorRefHandle {
  insertExample(expr: string): void
}

interface EditorState {
  /** Initially null — first cursor update from CodeMirror sets the real value. */
  cursorLine: number | null
  /** Imperative handle exposed by the EditorPane component (via useImperativeHandle). */
  editorRef: EditorRefHandle | null

  setEditorRef: (ref: EditorRefHandle | null) => void
  updateCursorLine: (line: number) => void
  insertExample: (expression: string) => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  cursorLine: null,
  editorRef: null,

  setEditorRef: (ref) => set({ editorRef: ref }),
  updateCursorLine: (line) => set({ cursorLine: line }),
  insertExample: (expression) => get().editorRef?.insertExample(expression),
}))
