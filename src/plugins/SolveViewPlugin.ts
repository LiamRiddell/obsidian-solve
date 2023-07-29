//// @ts-expect-error
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// import { syntaxTree } from "@codemirror/language";
import { SolveResultWidget } from "@/widgets/SolveResultWidget";
import { RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	PluginValue,
	ViewUpdate,
} from "@codemirror/view";

export class SolveViewPlugin implements PluginValue {
	decorations: DecorationSet;

	constructor(view: EditorView) {
		console.debug(`[SolveViewPlugin] Constructer`);
		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate) {
		if (update.docChanged || update.viewportChanged) {
			// console.debug(`[SolveViewPlugin] Document/View Changed`, update.state.doc.toString());
			this.decorations = this.buildDecorations(update.view);
		}
	}

	destroy() {
		console.debug(`[SolveViewPlugin] Destroyed`);
	}

	buildDecorations(view: EditorView): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();
		const visibleRanges = view.visibleRanges;
		const solvedLines = new Set();

		for (const { from, to } of visibleRanges) {
			let nextLineTextOffset = 0;

			const range = view.state.doc.iterRange(from, to);

			for (const lineTextRaw of range) {
				const linePositionOffset = from + nextLineTextOffset;

				const line = view.state.doc.lineAt(linePositionOffset);

				const lineText = line.text.trim();

				if (
					lineText &&
					lineText.length &&
					solvedLines.has(line.number) === false
				) {
					// TODO: Parse the line text with ANTLR4

					builder.add(
						line.to,
						line.to,
						Decoration.widget({
							widget: new SolveResultWidget("2001"),
						})
					);

					solvedLines.add(line.number);
				}

				nextLineTextOffset += lineTextRaw.length;
			}
		}

		return builder.finish();
	}

	// buildDecorations(view: EditorView): DecorationSet {
	// 	const builder = new RangeSetBuilder<Decoration>();

	// 	for (const { from, to } of view.visibleRanges) {
	// 		syntaxTree(view.state).iterate({
	// 			from,
	// 			to,
	// 			enter(node: any) {
	// 				if (node.type.name.startsWith("list")) {
	// 					// Position of the '-' or the '*'.
	// 					const listCharFrom = node.from - 2;

	// 					builder.add(
	// 						listCharFrom,
	// 						listCharFrom + 1,
	// 						Decoration.widget({
	// 							widget: new EmojiWidget(),
	// 						})
	// 					);
	// 				}
	// 			},
	// 		});
	// 	}

	// 	return builder.finish();
	// }
}
