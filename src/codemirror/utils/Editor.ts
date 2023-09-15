import { EditorView } from "@codemirror/view";

export function forceRefreshEditor(editor: EditorView) {
	if (editor) {
		const docLength = editor.state.doc.length;

		editor.dispatch({
			changes: { from: docLength, to: docLength, insert: " " },
		});

		editor.dispatch({
			changes: { from: docLength, to: docLength + 1 },
		});
	}
}
