import { ExpressionResultWidget } from "@/codemirror/widgets/ExpressionResultWidget";
import { SolveHighlightProvider } from "@/codemirror/SolveHighlightProvider";
import { ExpressionEngine } from "@/engine/engine/ExpressionEngine";
import { Value, ValueType } from "@/engine/vm/Value";
import UserSettings from "@/settings/UserSettings";
import { logger } from "@/utilities/Logger";
// @ts-expect-error
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

const DEBUG_MODE_ENABLED = false;

interface CachedLineDecorations {
  lineText: string;
  decorations: Array<{from: number; to: number; deco: Decoration}>;
}

export class MarkdownEditorViewPlugin implements PluginValue {
	public decorations: DecorationSet;
	private userSettings: UserSettings;
	private highlightProvider: SolveHighlightProvider;
	private expressionEngine: ExpressionEngine;
	private lineDecorationCache: Map<number, CachedLineDecorations> = new Map();
	private dirtyLines: Set<number> = new Set();

	constructor(view: EditorView) {
		logger.debug(`[SolveViewPlugin] Constructor`);

		this.userSettings = UserSettings.getInstance();
		this.highlightProvider = new SolveHighlightProvider();
		this.expressionEngine = new ExpressionEngine();

		this.decorations = this.buildDecorations(view);
	}

update(update: ViewUpdate) {
		if (update.docChanged) {
			this.highlightProvider.invalidateCache();
			update.changes.iterChanges((fromA, toA) => {
				const startLine = update.view.state.doc.lineAt(fromA).number;
				const endLine = update.view.state.doc.lineAt(toA).number;
				for (let l = startLine; l <= endLine; l++) {
					this.lineDecorationCache.delete(l);
					this.dirtyLines.add(l);
				}
			});
		}

		if (update.docChanged || update.viewportChanged) {
			this.decorations = this.buildDecorations(update.view);
		}
	}

	destroy() {
		logger.debug(`[SolveViewPlugin] Destroyed`);
		this.lineDecorationCache.clear();
		this.dirtyLines.clear();
	}

	buildDecorations(view: EditorView): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();

		const markdownDocumentSyntaxTree = syntaxTree(view.state);

		const visibleRanges = view.visibleRanges;
		const seenLines = new Set();

		let firstNode = true;
		let previousTo = 0;
		let previousFrom = 0;
		let wasLastChild = false;

		for (const { from, to } of visibleRanges) {
			const doNotSolveMask = new Array<[from: number, to: number]>();

			markdownDocumentSyntaxTree.iterate({
				from,
				to,
				enter: (node: SyntaxNodeRef) => {
					if (this.isNodeIgnoredFromMask(node.type.name)) {
						return;
					}

					if (firstNode) {
						firstNode = false;
						previousTo = node.to;
						previousFrom = node.from;
					}

					const isNextTo = node.from - previousTo <= 1;

					if (node.to <= previousTo || isNextTo) {
						if (isNextTo) previousTo = node.to;
						wasLastChild = true;
					} else {
						doNotSolveMask.push([previousFrom, previousTo]);
						previousFrom = node.from;
						previousTo = node.to;
						wasLastChild = false;
					}
				},
			});

			if (wasLastChild) doNotSolveMask.push([previousFrom, previousTo]);

			const range = view.state.doc.iterRange(from, to);
			let nextLineTextOffset = 0;

			for (const lineTextRaw of range) {
				const linePosition = from + nextLineTextOffset;
				const line = view.state.doc.lineAt(linePosition);

				if (seenLines.has(line.number)) {
					nextLineTextOffset += lineTextRaw.length;
					continue;
				}
				seenLines.add(line.number);

				if (this.isRangeInMask(doNotSolveMask, line.from, line.to)) {
					nextLineTextOffset += lineTextRaw.length;
					continue;
				}

				if (!this.dirtyLines.has(line.number)) {
					const cached = this.lineDecorationCache.get(line.number);
					if (cached && cached.lineText === line.text) {
						for (const d of cached.decorations) {
							builder.add(d.from, d.to, d.deco);
						}
						nextLineTextOffset += lineTextRaw.length;
						continue;
					}
				}

				if (!line.text.trim() || line.text.trim().length === 0) {
					nextLineTextOffset += lineTextRaw.length;
					continue;
				}

				const decorations: Array<{from: number; to: number; deco: Decoration}> = [];

				this.buildLineDecorations(line.text, line.from, line.to, line.number, decorations);

				decorations.sort((a, b) => a.from - b.from || (a.deco.spec.side ?? 0) - (b.deco.spec.side ?? 0));
				for (const d of decorations) {
					builder.add(d.from, d.to, d.deco);
				}

				this.lineDecorationCache.set(line.number, { lineText: line.text, decorations });
				this.dirtyLines.delete(line.number);

				nextLineTextOffset += lineTextRaw.length;
			}
		}

		return builder.finish();
	}

	private buildLineDecorations(
		lineText: string,
		lineFrom: number,
		lineTo: number,
		lineNumber: number,
		decorations: Array<{from: number; to: number; deco: Decoration}>
	): void {
		const inlineSolvePositions = this.findInlineSolves(lineText);

		if (inlineSolvePositions.length > 0) {
			let offset = 0;
			for (const isp of inlineSolvePositions) {
				const expr = isp.expression;
				const lineExpr = expr.trim();
				if (!lineExpr) continue;

				const result = this.evaluateLine(lineNumber, lineExpr);
				if (result === undefined) continue;

				const widgetPos = lineFrom + isp.start + 3 + offset;
				decorations.push({
					from: widgetPos,
					to: widgetPos,
					deco: Decoration.widget({
						widget: new ExpressionResultWidget(lineNumber, true, lineExpr, result),
						side: 1,
					}),
				});
			}

			this.addHighlightDecorations(lineText, lineFrom, lineNumber, decorations);
		} else {
			const expression = lineText.trim();
			if (!expression) return;

			const result = this.evaluateLine(lineNumber, expression);
			if (result !== undefined) {
				decorations.push({
					from: lineTo,
					to: lineTo,
					deco: Decoration.widget({
						widget: new ExpressionResultWidget(lineNumber, false, expression, result),
						side: 1,
					}),
				});
			}

			this.addHighlightDecorations(lineText, lineFrom, lineNumber, decorations);
		}
	}

	private findInlineSolves(lineText: string): Array<{start: number; expression: string}> {
		const results: Array<{start: number; expression: string}> = [];
		const regex = /s`([^`]*)`/g;
		let match: RegExpExecArray | null;
		while ((match = regex.exec(lineText)) !== null) {
			results.push({ start: match.index, expression: match[1] });
		}
		return results;
	}

	private evaluateLine(lineNumber: number, expression: string): string | undefined {
		try {
			const value = this.expressionEngine.evaluateLine(lineNumber, expression);
			return this.formatValue(value);
		} catch {
			return undefined;
		}
	}

	private addHighlightDecorations(
		lineText: string,
		lineFrom: number,
		lineNumber: number,
		decorations: Array<{from: number; to: number; deco: Decoration}>
	): void {
		const ranges = this.highlightProvider.getLineHighlights(lineText, lineNumber);
		for (const r of ranges) {
			decorations.push({
				from: lineFrom + r.from,
				to: lineFrom + r.to,
				deco: Decoration.mark({ class: r.className }),
			});
		}
	}

	private formatValue(value: Value): string {
		switch (value.type) {
			case ValueType.Number:
				return `= ${value.value}`;
			case ValueType.Hex:
				return `= 0x${(value.value as number).toString(16).toUpperCase()}`;
			case ValueType.BigInt:
				return `= ${value.value}`;
			case ValueType.String:
				return `= ${value.value}`;
			case ValueType.Boolean:
				return `= ${value.value}`;
			case ValueType.Datetime:
				return `= ${new Date(value.value as number).toLocaleString()}`;
			case ValueType.Uom:
				return `= ${value.value} ${value.unit}`;
			case ValueType.Vector2:
			case ValueType.Vector3:
			case ValueType.Vector4:
				return `= [${(value.value as number[]).join(', ')}]`;
			default:
				return `= ${String(value.value)}`;
		}
	}

	private isNodeIgnoredFromMask(name: string) {
		for (let i = 0; i < this.ignoreNodeForMaskString.length; i++) {
			const nodeName = this.ignoreNodeForMaskString[i];
			if (name.startsWith(nodeName)) {
				return true;
			}
		}
		return false;
	}

	private ignoreNodeForMaskString = [
		"Document",
		"quote",
		"list",
		"HyperMD-list-line",
		"math",
	];

	private isRangeInMask(
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
