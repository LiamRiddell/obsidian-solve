import { ResultWidget } from "@/codemirror/widgets/ResultWidget";
import { pluginEventBus } from "@/eventbus/PluginEventBus";
import { Pipeline } from "@/pipelines/definition/Pipeline";
import { SharedCommentsRemovalStage } from "@/pipelines/stages/CommentsRemovalStage";
import { SharedMarkdownRemovalStage } from "@/pipelines/stages/MarkdownRemovalStage";
import { PreviousResultSubstitutionStage } from "@/pipelines/stages/PreviousResultSubstitutionStage";
import { VariableProcessingStage } from "@/pipelines/stages/VariableProcessingStage";
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

export class MarkdownEditorViewPlugin implements PluginValue {
	public decorations: DecorationSet;
	private userSettings: UserSettings;

	private ignoreNodeForMaskString = [
		"Document",
		"quote",
		"list",
		"HyperMD-list-line",
	];

	private processingPipeline: Pipeline<string>;
	private previousResultSubstitutionStage: PreviousResultSubstitutionStage;

	constructor(view: EditorView) {
		logger.debug(`[SolveViewPlugin] Constructer`);

		this.userSettings = UserSettings.getInstance();

		this.previousResultSubstitutionStage =
			new PreviousResultSubstitutionStage();

		this.processingPipeline = new Pipeline<string>()
			.addStage(SharedMarkdownRemovalStage)
			.addStage(SharedCommentsRemovalStage)
			.addStage(this.previousResultSubstitutionStage)
			.addStage(new VariableProcessingStage());

		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate) {
		if (update.docChanged || update.viewportChanged) {
			pluginEventBus.emit(
				EPluginEvent.StatusBarUpdate,
				EPluginStatus.Solving
			);

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
				lineText = this.processingPipeline.process(lineText);
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
		if (this.userSettings.engine.explicitMode) {
			if (sentence.trimEnd().endsWith("=")) {
				sentence = sentence.substring(0, sentence.length - 1).trimEnd();
				isExplicitlyDefinedSentence = true;
			} else {
				return undefined;
			}
		}

		// Initial implementation will show the first valid result from available providers.
		const result = solveProviderManager.provideFirst<string>(sentence);

		if (result === undefined) {
			return undefined;
		}

		// If the input sentence and the output is the same value ignore it.
		// For example, 10 = 10
		const sentenceTrimmed = sentence.trim();
		const resultTrimmed = result.startsWith("= ")
			? result.substring(2).trim()
			: result.trim();

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
		this.previousResultSubstitutionStage.setPreviousResultString(
			resultTrimmed
		);

		return Decoration.widget({
			widget: new ResultWidget(result, lineNumber),
			side: 1,
		});
	}
}
