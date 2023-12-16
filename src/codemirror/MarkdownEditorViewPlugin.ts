import { ResultWidget } from "@/codemirror/widgets/ResultWidget";
import { pluginEventBus } from "@/eventbus/PluginEventBus";
import { ContextPipeline } from "@/pipelines/definition/ContextPipeline";
import { Pipeline } from "@/pipelines/definition/SimplePipeline";
import { SharedArithmeticInsertEqualSignStage } from "@/pipelines/stages/postprocess/ArithmeticPostProcessStage";
import { SharedDebugInformationStage } from "@/pipelines/stages/postprocess/DebugInformationStage";
import { SharedFormatResultStage } from "@/pipelines/stages/postprocess/FormatResultStage";
import { SharedCommentsRemovalStage } from "@/pipelines/stages/preprocess/CommentsRemovalStage";
import { SharedMarkdownRemovalStage } from "@/pipelines/stages/preprocess/MarkdownRemovalStage";
import { SharedMathJaxRemovalStage } from "@/pipelines/stages/preprocess/MathJaxRemovalStage";
import { PreviousResultSubstitutionStage } from "@/pipelines/stages/preprocess/PreviousResultSubstitutionStage";
import { SharedVariableAssignRemovalStage } from "@/pipelines/stages/preprocess/VariableAssignRemovalStage";
import { VariableProcessingStage } from "@/pipelines/stages/preprocess/VariableProcessingStage";
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

const DEBUG_MODE_ENABLED = true;

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

	private preprocesser: Pipeline<string>;
	private postprocessor: ContextPipeline<[IProvider, AnyResult], string>;
	private variableProcessingStage: VariableProcessingStage;
	private previousResultSubstitutionStage: PreviousResultSubstitutionStage;

	constructor(view: EditorView) {
		logger.debug(`[SolveViewPlugin] Constructer`);

		this.userSettings = UserSettings.getInstance();

		// Setup any stateful pipeline stages.
		this.previousResultSubstitutionStage =
			new PreviousResultSubstitutionStage();
		this.variableProcessingStage = new VariableProcessingStage();

		// Setup the preprocessor pipeline
		this.preprocesser = new Pipeline<string>()
			.addStage(SharedMarkdownRemovalStage)
			.addStage(SharedCommentsRemovalStage)
			.addStage(SharedMathJaxRemovalStage)
			.addStage(this.previousResultSubstitutionStage)
			.addStage(this.variableProcessingStage)
			.addStage(SharedVariableAssignRemovalStage);

		// Setup the post processor pipeline
		this.postprocessor = new ContextPipeline<
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

			console.time("[Solve] MarkdownEditorViewPlugin.buildDecorations");
			this.decorations = this.buildDecorations(update.view);
			console.timeEnd(
				"[Solve] MarkdownEditorViewPlugin.buildDecorations"
			);

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

				let lineText = line.text.trim();

				// Skip blank lines
				if (!lineText || lineText.length === 0) {
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

				// logger.debug("Before Pipeline:", lineText);
				lineText = this.preprocesser.process(lineText);
				// logger.debug("After Pipeline:", lineText);

				// The line is valid and decoration can be provided.
				const decoration = this.provideDecoration(
					lineText,
					line.number
				);

				if (decoration) {
					builder.add(line.to, line.to, decoration);
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

	private provideDecoration(sentence: string, lineNumber: number) {
		let isExplicitlyDefinedSentence = false;

		// When explicit mode is enabled the sentence will end with = sign.
		// This needs to be removed in order for grammars to match.
		// TODO: Convert this into a context preprocessor stage
		if (this.userSettings.engine.explicitMode) {
			if (sentence.trimEnd().endsWith("=")) {
				sentence = sentence.substring(0, sentence.length - 1).trimEnd();
				isExplicitlyDefinedSentence = true;
			} else {
				return undefined;
			}
		}

		// Initial implementation will show the first valid result from available providers.
		const solveResultTuple =
			solveProviderManager.provideFirst<AnyResult>(sentence);

		if (solveResultTuple === undefined) {
			return undefined;
		}

		// Post-process the result starting with empty string the pipeline will slowly build the result for the user.
		let postprocessedResult = this.postprocessor.process(
			solveResultTuple,
			""
		);

		// If the input sentence and the output is the same value ignore it.
		// For example, 10 = 10
		const sentenceTrimmed = sentence.trim();
		const resultTrimmed = postprocessedResult.startsWith("= ")
			? postprocessedResult.substring(2).trim()
			: postprocessedResult.trim();

		if (sentenceTrimmed.toLowerCase() === resultTrimmed.toLowerCase()) {
			return undefined;
		}

		// If we're in explicit mode, we should only show the result if it was defined explicitly `=`
		if (
			this.userSettings.engine.explicitMode &&
			!isExplicitlyDefinedSentence
		) {
			return undefined;
		}

		// Updates the previous solve to be the new solve that's passed the checks
		this.previousResultSubstitutionStage.setPreviousResult(
			solveResultTuple[1] // Result
		);

		// We need to add the debug information right before we display it. Otherwise we can cause issues with the above logic.
		if (DEBUG_MODE_ENABLED) {
			postprocessedResult = SharedDebugInformationStage.process(
				solveResultTuple,
				postprocessedResult
			);
		}

		return Decoration.widget({
			widget: new ResultWidget(postprocessedResult, lineNumber),
			side: 1,
		});
	}
}
