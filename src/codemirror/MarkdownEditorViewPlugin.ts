import { ExpressionResultWidget } from "@/codemirror/widgets/ExpressionResultWidget";
import { SolveHighlightProvider } from "@/codemirror/SolveHighlightProvider";
import { ExpressionEngine } from "@/engine/engine/ExpressionEngine";
import { Value } from "@/engine/vm/Value";
import { StatefulPipeline } from "@/pipelines/definition/StatefulPipeline";
import { SharedCommentsRemovalStage } from "@/pipelines/stages/expression/CommentsRemovalStage";
import { SharedExplicitModeRemovalStage } from "@/pipelines/stages/expression/ExplicitModeRemovalStage";
import { SharedExtractInlineSolveStage } from "@/pipelines/stages/expression/ExtractInlineSolveState";
import { SharedMarkdownRemovalStage } from "@/pipelines/stages/expression/MarkdownRemovalStage";
import { SharedMathJaxRemovalStage } from "@/pipelines/stages/expression/MathJaxRemovalStage";
import { PreviousResultSubstitutionStage } from "@/pipelines/stages/expression/PreviousResultSubstitutionStage";
import { SharedVariableAssignRemovalStage } from "@/pipelines/stages/expression/VariableAssignRemovalStage";
import { VariableProcessingStage } from "@/pipelines/stages/expression/VariableProcessingStage";
import { IExpressionProcessorState } from "@/pipelines/stages/expression/state/IExpressionProcessorState";
import { SharedArithmeticInsertEqualSignStage } from "@/pipelines/stages/result/ArithmeticPostProcessStage";
import { SharedDebugInformationStage } from "@/pipelines/stages/result/DebugInformationStage";
import { SharedFormatResultStage } from "@/pipelines/stages/result/FormatResultStage";
import { IProvider } from "@/providers/IProvider";
import { AnyResult } from "@/results/AnyResult";
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
import { solveProviderManager } from "../providers/ProviderManager";

const DEBUG_MODE_ENABLED = false;

interface CachedLineDecorations {
  lineText: string;
  decorations: Array<{from: number; to: number; deco: Decoration}>;
}

export class MarkdownEditorViewPlugin implements PluginValue {
	public decorations: DecorationSet;
	private userSettings: UserSettings;

	private ignoreNodeForMaskString = [
		"Document",
		"quote",
		"list",
		"HyperMD-list-line",
		"math",
	];

	private expressionProcesser: StatefulPipeline<
		IExpressionProcessorState,
		string
	>;
	private expressionProcesserArray: StatefulPipeline<
		IExpressionProcessorState,
		string[]
	>;
	private expressionProcesserFinal: StatefulPipeline<
		IExpressionProcessorState,
		string
	>;
	private resultProcessor: StatefulPipeline<[IProvider, AnyResult], string>;
	private variableProcessingStage: VariableProcessingStage;
	private previousResultSubstitutionStage: PreviousResultSubstitutionStage;
	private highlightProvider: SolveHighlightProvider;
	private expressionEngine: ExpressionEngine;
	private lineDecorationCache: Map<number, CachedLineDecorations> = new Map();
	private dirtyLines: Set<number> = new Set();

	constructor(view: EditorView) {
		logger.debug(`[SolveViewPlugin] Constructer`);

		this.userSettings = UserSettings.getInstance();

		// Setup any stateful pipeline stages.
		this.previousResultSubstitutionStage =
			new PreviousResultSubstitutionStage();
		this.variableProcessingStage = new VariableProcessingStage();

		// Setup the expression processor pipeline
		this.expressionProcesser = new StatefulPipeline<
			IExpressionProcessorState,
			string
		>()
			.addStage(SharedMarkdownRemovalStage)
			.addStage(SharedCommentsRemovalStage)
			.addStage(SharedMathJaxRemovalStage)

		this.expressionProcesserArray = new StatefulPipeline<
			IExpressionProcessorState,
			string[]
		>()
			.addStage(SharedExtractInlineSolveStage);
		
		this.expressionProcesserFinal = new StatefulPipeline<
			IExpressionProcessorState,
			string
		>()	
			.addStage(this.previousResultSubstitutionStage)
			.addStage(this.variableProcessingStage)
			.addStage(SharedExplicitModeRemovalStage)
			.addStage(SharedVariableAssignRemovalStage);

		// Setup the post processor pipeline
		this.resultProcessor = new StatefulPipeline<
			[IProvider, AnyResult],
			string
		>()
			.addStage(SharedFormatResultStage)
			.addStage(SharedArithmeticInsertEqualSignStage);

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
			if (update.docChanged) {
				this.variableProcessingStage.reset();
			}

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

			// Performant approach to ignoring nodes e.g. titles, code blocks, etc...
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

			// Performant approach to iterating only line in the visible range.
			const range = view.state.doc.iterRange(from, to);

			let nextLineTextOffset = 0;

			for (const lineTextRaw of range) {
				const linePosition = from + nextLineTextOffset;

				const line = view.state.doc.lineAt(linePosition);

				// Skip seen lines
				if (seenLines.has(line.number)) {
					nextLineTextOffset += lineTextRaw.length;
					continue;
				}
				seenLines.add(line.number);

				// Skip if line is in mask range
				if (this.isRangeInMask(doNotSolveMask, line.from, line.to)) {
					nextLineTextOffset += lineTextRaw.length;
					continue;
				}

				// Check cache first: if we have a non-dirty cached entry with matching text, reuse it
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

				let expression = line.text.trimStart();
				const padding = line.text.length - expression.length;
				expression = expression.trimEnd();

				// Skip blank lines
				if (!expression || expression.length === 0) {
					nextLineTextOffset += lineTextRaw.length;
					continue;
				}

				const state: IExpressionProcessorState = {
					lineNumber: line.number,
					originalLineText: expression,
					isAllowedExplicitModeExpression: false,
				};

				expression = this.expressionProcesser.process(
					state,
					expression
				);

				const inlineExpressions = this.expressionProcesserArray.process(
					state,
					[expression]
				);

				const decorations: Array<{from: number; to: number; deco: Decoration}> = [];

				for (let i = 0; i < inlineExpressions.length; i++) {
					const inlineExpression = inlineExpressions[i]
					expression = this.expressionProcesserFinal.process(
						state,
						inlineExpression
					);

					const decoration = this.provideDecoration(state, expression, line.text, line.number);
					if (!decoration) {
						continue;
					}

					if (state.isInlineSolve && state.inlineSolveIndices) {
						const inlineSolvePosition =
							line.from +
							3 +
							state.inlineSolveIndices[i] +
							padding +
							inlineExpression.length;

						decorations.push({ from: inlineSolvePosition, to: inlineSolvePosition, deco: decoration });
					} else {
						decorations.push({ from: line.to, to: line.to, deco: decoration });
					}
				}

				if (!state.isInlineSolve) {
					const ranges = this.highlightProvider.getLineHighlights(line.text, line.number);
					for (const r of ranges) {
						const from = line.from + r.from;
						const to = line.from + r.to;
						const deco = Decoration.mark({ class: r.className });
						decorations.push({ from, to, deco });
					}
				}

				decorations.sort((a, b) => a.from - b.from || a.deco.spec.side - b.deco.spec.side);
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

	private isNodeIgnoredFromMask(name: string) {
		for (let i = 0; i < this.ignoreNodeForMaskString.length; i++) {
			const nodeName = this.ignoreNodeForMaskString[i];

			if (name.startsWith(nodeName)) {
				return true;
			}
		}

		return false;
	}

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

	private provideDecoration(
		state: IExpressionProcessorState,
		expression: string,
		lineText: string,
		lineNumber: number
	) {
		if (
			this.userSettings.engine.explicitMode &&
			!state.isAllowedExplicitModeExpression
		) {
			return undefined;
		}

		const result = this.computeResult(expression, lineNumber, lineText);
		if (result === undefined) {
			return undefined;
		}

		const sentenceTrimmed = expression.trim();
		const resultTrimmed = result.startsWith("= ")
			? result.substring(2).trim()
			: result.trim();

		if (sentenceTrimmed.toLowerCase() === resultTrimmed.toLowerCase()) {
			return undefined;
		}

		if (DEBUG_MODE_ENABLED) {
			// result already includes debug info from computeResult
		}

		return Decoration.widget({
			widget: new ExpressionResultWidget(state, expression, result),
			side: 1,
		});
	}

	private computeResult(expression: string, lineNumber: number, lineText: string): string | undefined {
		try {
			const value = this.expressionEngine.evaluateLine(lineNumber, lineText);
			const result = this.formatValue(value);
			return result;
		} catch {
			// Fall back to old provider pipeline
		}

		const solveResultTuple = solveProviderManager.provideFirst(expression);
		if (solveResultTuple === undefined) {
			return undefined;
		}

		let result = this.resultProcessor.process(solveResultTuple, "");
		this.previousResultSubstitutionStage.setPreviousResult(
			solveResultTuple[1]
		);
		return result;
	}

	private formatValue(value: Value): string {
		switch (value.type) {
			case 'number':
				return `= ${value.value}`;
			case 'hex':
				return `= 0x${(value.value as number).toString(16).toUpperCase()}`;
			case 'bigint':
				return `= ${value.value}`;
			case 'string':
				return `= ${value.value}`;
			case 'boolean':
				return `= ${value.value}`;
			case 'datetime':
				return `= ${new Date(value.value as number).toLocaleString()}`;
			case 'uom':
				return `= ${value.value} ${value.unit}`;
			case 'vector2':
			case 'vector3':
			case 'vector4':
				return `= [${(value.value as number[]).join(', ')}]`;
			default:
				return `= ${value.value}`;
		}
	}
}
