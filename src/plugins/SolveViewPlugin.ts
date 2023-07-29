// @ts-expect-error
import { SyntaxNodeType } from "@/constants/SyntaxNodeType";
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	PluginValue,
	ViewUpdate,
} from "@codemirror/view";
import { SyntaxNodeRef } from "@lezer/common";

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
		console.log(`--------------- BUILD DECORATIONS ---------------`);
		const builder = new RangeSetBuilder<Decoration>();

		const markdownDocumentSyntaxTree = syntaxTree(view.state);

		if (markdownDocumentSyntaxTree.length === 0) {
			return builder.finish();
		}

		const lastNode = markdownDocumentSyntaxTree.topNode.lastChild;

		const visibleRanges = view.visibleRanges;

		let firstNode = true;
		let previousTo = 0;
		let previousFrom = 0;
		let wasLastChild = false;

		for (const { from, to } of visibleRanges) {
			const solveIgnoreRangesMask = new Array<
				[from: number, to: number]
			>();

			markdownDocumentSyntaxTree.iterate({
				from,
				to,
				enter: (node: SyntaxNodeRef) => {
					if (node.type.id === SyntaxNodeType.Document) return;

					if (firstNode) {
						firstNode = false;
						previousTo = node.to;
						previousFrom = node.from;
					}

					//console.log("Prev: ", previousTo);

					let isNextTo = node.from - previousTo == 1;

					if (node.to <= previousTo || isNextTo) {
						console.log(
							"Child: ",
							isNextTo,
							node.from,
							", ",
							node.to
						);

						if (isNextTo) {
							previousTo = node.to; // Let it continue to the new node.to
						}

						wasLastChild = true;
					} else {
						solveIgnoreRangesMask.push([previousFrom, previousTo]);

						console.log("Parent: ", node.from, ", ", node.to);

						previousFrom = node.from;
						previousTo = node.to;

						wasLastChild = false;
					}
				},
			});

			if (wasLastChild)
				solveIgnoreRangesMask.push([previousFrom, previousTo]);

			console.log(wasLastChild);
			console.log(solveIgnoreRangesMask);

			// We need to essentially cut out all of the unwanted regions

			// let nextLineTextOffset = 0;

			// const range = view.state.doc.iterRange(from, to);

			// for (const lineTextRaw of range) {
			// 	const linePositionOffset = from + nextLineTextOffset;

			// 	const line = view.state.doc.lineAt(linePositionOffset);

			// 	const lineText = line.text.trim();

			// 	if (
			// 		lineText &&
			// 		lineText.length &&
			// 		solvedLines.has(line.number) === false
			// 	) {
			// 		// TODO: Parse the line text with ANTLR4

			// 		builder.add(
			// 			line.to,
			// 			line.to,
			// 			Decoration.widget({
			// 				widget: new SolveResultWidget("2001"),
			// 			})
			// 		);

			// 		solvedLines.add(line.number);
			// 	}

			// 	nextLineTextOffset += lineTextRaw.length;
			// }
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
