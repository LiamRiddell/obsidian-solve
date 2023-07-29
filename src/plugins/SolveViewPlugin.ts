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

		for (const { from, to } of visibleRanges) {
			// Create Solve Ignore Mask
			const solveIgnoreRangesMask = new Array<
				[from: number, to: number]
			>();

			let previousNode: SyntaxNodeRef | undefined = undefined;
			let previousMaskFrom: number | undefined = undefined;
			let previousMaskTo: number | undefined = undefined;

			markdownDocumentSyntaxTree.iterate({
				from,
				to,
				enter: (node: SyntaxNodeRef) => {
					if (node.type.id === SyntaxNodeType.Document) return;

					if (previousNode !== undefined) {
						if (
							node.from >= previousNode.from &&
							node.to <= previousNode.to
						) {
							console.log(
								"Child",
								node.node?.index,
								node.type.name,
								node.type.id,
								node.from,
								node.to
							);
						} else {
							const isNextTo = node.from - previousNode.to <= 1;

							console.log(
								"Parent",
								node.node?.index,
								node.type.name,
								node.type.id,
								node.from,
								node.to,
								isNextTo
							);

							if (isNextTo) {
								previousMaskTo = node.to;
							}
							// Check for text region between the last node and end of document
							if (
								// @ts-expect-error
								lastNode?.index === node.node?.index &&
								previousMaskFrom !== undefined &&
								previousMaskTo !== undefined
							) {
								solveIgnoreRangesMask.push([
									previousMaskFrom,
									previousMaskTo,
								]);
							} else if (
								!isNextTo &&
								previousMaskFrom !== undefined &&
								previousMaskTo !== undefined
							) {
								// No longer next to each other so save the longest mask
								solveIgnoreRangesMask.push([
									previousMaskFrom,
									previousMaskTo,
								]);

								// Reset the mask this this node
								previousMaskFrom = node.from;
								previousMaskTo = node.to;
							}

							previousNode = { ...node };
						}
					} else {
						console.log(
							"Parent",
							node.node?.index,
							node.type.name,
							node.type.id,
							node.from,
							node.to
						);

						if (
							previousMaskFrom === undefined &&
							previousMaskTo === undefined
						) {
							previousMaskFrom = node.from;
							previousMaskTo = node.to;
							console.log(previousMaskFrom, previousMaskTo);
						}

						previousNode = { ...node };
					}
				},
			});

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
