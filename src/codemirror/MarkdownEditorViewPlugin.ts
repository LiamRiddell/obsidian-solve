import { ExpressionResultWidget } from "@/codemirror/widgets/ExpressionResultWidget";
import { pluginEventBus } from "@/eventbus/PluginEventBus";
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
import { EPluginEvent } from "../constants/EPluginEvent";
import { EPluginStatus } from "../constants/EPluginStatus";
import { solveProviderManager } from "../providers/ProviderManager";

const DEBUG_MODE_ENABLED = false;

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
	private resultProcessor: StatefulPipeline<[IProvider, AnyResult], string>;
	private variableProcessingStage: VariableProcessingStage;
	private previousResultSubstitutionStage: PreviousResultSubstitutionStage;

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
			.addStage(SharedExtractInlineSolveStage)
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

		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate) {
		if (update.docChanged || update.viewportChanged) {
			pluginEventBus.emit(
				EPluginEvent.StatusBarUpdate,
				EPluginStatus.Solving
			);

			// Before building our next set of decorations we need to reset any state e.g. variables
			this.variableProcessingStage.reset();

			// console.time("[Solve] MarkdownEditorViewPlugin.buildDecorations");
			this.decorations = this.buildDecorations(update.view);
			// console.timeEnd(
			// 	"[Solve] MarkdownEditorViewPlugin.buildDecorations"
			// );

			pluginEventBus.emit(
				EPluginEvent.StatusBarUpdate,
				EPluginStatus.Idle
			);
		}
	}

	destroy() {
		logger.debug(`[SolveViewPlugin] Destroyed`);
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
					// console.log(
					// 	node.type.name,
					// 	node.from,
					// 	node.to,
					// 	view.state.doc.sliceString(node.from, node.to)
					// );

					if (this.isNodeIgnoredFromMask(node.type.name)) {
						return;
					}

					// logger.debug(node.type.id, node.type.name);

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

				let expression = line.text.trim();

				// Skip blank lines
				if (!expression || expression.length === 0) {
					nextLineTextOffset += lineTextRaw.length;
					continue;
				}

				// Skip seen lines
				if (seenLines.has(line.number)) {
					nextLineTextOffset += lineTextRaw.length;
					continue;
				}

				// Skip if line is in mask range
				if (this.isRangeInMask(doNotSolveMask, line.from, line.to)) {
					nextLineTextOffset += lineTextRaw.length;
					continue;
				}

				const state: IExpressionProcessorState = {
					lineNumber: line.number,
					originalLineText: expression,
					isAllowedExplicitModeExpression: false,
				};

				//logger.debug("Before Expression Processor:", state, expression);
				expression = this.expressionProcesser.process(
					state,
					expression
				);
				//logger.debug("After Expression Processor:", state, expression);

				// The line is valid and decoration can be provided.
				const decoration = this.provideDecoration(state, expression);

				if (decoration) {
					if (state.isInlineSolve && state.inlineSolveIndex) {
						// Result is displayed at the end of the inline solve position
						const inlineSolvePosition =
							line.from + // Start of the line
							3 + // Unaccounted inline solve characters s``
							state.inlineSolveIndex + // Position of the inline solve
							expression.length; // Length of the inline solve

						builder.add(
							inlineSolvePosition,
							inlineSolvePosition,
							decoration
						);
					} else {
						// Result is displayed at the end of the line.
						builder.add(line.to, line.to, decoration);
					}
				}

				seenLines.add(line.number);
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
		expression: string
	) {
		// If explicit mode is enabled then only process allowed expressions
		if (
			this.userSettings.engine.explicitMode &&
			!state.isAllowedExplicitModeExpression
		) {
			// logger.debug(
			// 	"MarkdownEditorViewPlugin.provideDecoration: This is not an allowed explicit mode expression.",
			// 	expression,
			// 	state
			// );

			return undefined;
		}

		// Initial implementation will show the first valid result from available providers.
		const solveResultTuple = solveProviderManager.provideFirst(expression);

		if (solveResultTuple === undefined) {
			return undefined;
		}

		// Post-process the result starting with empty string the pipeline will slowly build the result for the user.
		let result = this.resultProcessor.process(solveResultTuple, "");

		// If the input sentence and the output is the same value ignore it.
		// For example, 10 = 10
		const sentenceTrimmed = expression.trim();
		const resultTrimmed = result.startsWith("= ")
			? result.substring(2).trim()
			: result.trim();

		if (sentenceTrimmed.toLowerCase() === resultTrimmed.toLowerCase()) {
			return undefined;
		}

		// Updates the previous solve to be the new solve that's passed the checks
		this.previousResultSubstitutionStage.setPreviousResult(
			solveResultTuple[1] // Result
		);

		// We need to add the debug information right before we display it. Otherwise we can cause issues with the above logic.
		if (DEBUG_MODE_ENABLED) {
			result = SharedDebugInformationStage.process(
				solveResultTuple,
				result
			);
		}

		return Decoration.widget({
			widget: new ExpressionResultWidget(state, expression, result),
			side: 1,
		});
	}
}
