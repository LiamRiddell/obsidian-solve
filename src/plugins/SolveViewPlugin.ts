// @ts-expect-error
import { SyntaxNodeType } from "@/constants/SyntaxNodeType";
import { SolveResultWidget } from "@/widgets/SolveResultWidget";
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

		const visibleRanges = view.visibleRanges;
		const seenLines = new Set();
		const ignoreNodeTypes = [
			SyntaxNodeType.Document,
			SyntaxNodeType.List1,
			SyntaxNodeType.List2,
			SyntaxNodeType.List3,
			SyntaxNodeType.BlockQuote,
		];

		let firstNode = true;
		let previousTo = 0;
		let previousFrom = 0;
		let wasLastChild = false;

		for (const { from, to } of visibleRanges) {
			const solveIgnoreRangesMask = new Array<
				[from: number, to: number]
			>();

			// Create Node Mask
			markdownDocumentSyntaxTree.iterate({
				from,
				to,
				enter: (node: SyntaxNodeRef) => {
					if (ignoreNodeTypes.contains(node.type.id)) {
						return;
					}

					if (firstNode) {
						firstNode = false;
						previousTo = node.to;
						previousFrom = node.from;
					}

					const isNextTo = node.from - previousTo <= 1;

					console.debug(node.type);

					if (node.to <= previousTo || isNextTo) {
						if (isNextTo) {
							previousTo = node.to;
						}

						wasLastChild = true;
					} else {
						solveIgnoreRangesMask.push([previousFrom, previousTo]);

						previousFrom = node.from;
						previousTo = node.to;

						wasLastChild = false;
					}
				},
			});

			if (wasLastChild)
				solveIgnoreRangesMask.push([previousFrom, previousTo]);

			console.log(solveIgnoreRangesMask);

			// Parse the lines
			let nextLineTextOffset = 0;
			const range = view.state.doc.iterRange(from, to);

			for (const lineTextRaw of range) {
				const linePositionOffset = from + nextLineTextOffset;

				const line = view.state.doc.lineAt(linePositionOffset);

				const lineText = line.text.trim();

				if (
					lineText &&
					lineText.length &&
					seenLines.has(line.number) === false
				) {
					// TODO: Parse the line text with ANTLR4
					const isInMask = this.isInMask(
						solveIgnoreRangesMask,
						line.from,
						line.to
					);

					if (isInMask === false) {
						console.log(line, isInMask);
						builder.add(
							line.to,
							line.to,
							Decoration.widget({
								widget: new SolveResultWidget("2001"),
							})
						);
					}

					seenLines.add(line.number);
				}

				nextLineTextOffset += lineTextRaw.length;
			}
		}

		return builder.finish();
	}

	isInMask(
		mask: [from: number, to: number][],
		from: number,
		to: number
	): boolean {
		for (let i = 0; i < mask.length; i++) {
			const [maskFrom, maskTo] = mask[i];

			if (from >= maskFrom && to <= maskTo) return true;
		}

		return false;
	}
}
