import { ResultWidget } from "@/codemirror/widgets/ResultWidget";
import { pluginEventBus } from "@/eventbus/PluginEventBus";
import { IResult } from "@/results/definition/IResult";
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
	private variableAssignmentRegex = new RegExp(/^(\$\w+)\s+=/);
	private variableSubstitutionRegex = new RegExp(/(\$\w+)/g);
	private variableMap = new Map<string, IResult<any>>();

	constructor(view: EditorView) {
		logger.debug(`[SolveViewPlugin] Constructer`);

		this.userSettings = UserSettings.getInstance();

		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate) {
		if (update.docChanged || update.viewportChanged) {
			pluginEventBus.emit(
				EPluginEvent.StatusBarUpdate,
				EPluginStatus.Solving
			);

			this.variableMap.clear();

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

				// Ignored nodes e.g. block qoutes (>), lists (-), checked list ([ ]) will remove the
				// markdown formatting at the start of the string.
				lineText = lineText.replace(
					/^(?:(?:[-+*>]|(?:\[\s\])|(?:\d+\.))\s)+/m,
					""
				);

				// Variable Support (Scoped to view)
				lineText = this.handleVariables(lineText);

				// The line is valid and decoration can be provided.
				const decoration = this.provideDecoration(lineText);

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

	private provideDecoration(sentence: string) {
		let isExplicitlyDefinedSentence = false;

		// When explicit mode is enabled the sentence will end with = sign.
		// This needs to be removed in order for grammars to match.
		if (
			this.userSettings.engine.explicitMode &&
			sentence.trimEnd().endsWith("=")
		) {
			sentence = sentence.substring(0, sentence.length - 1).trimEnd();
			isExplicitlyDefinedSentence = true;
		}

		// Initial implementation will show the first valid result from available providers.
		const result = solveProviderManager.provideFirst(sentence);

		if (result === undefined) {
			return undefined;
		}

		// If the input sentence and the output is the same value ignore it.
		// For example, 10 = 10
		if (result.toLowerCase().trim() === sentence.toLowerCase().trim()) {
			return undefined;
		}

		// If we're in explicit mode, we should only show the result if it was defined explicitly `=`
		if (
			this.userSettings.engine.explicitMode &&
			!isExplicitlyDefinedSentence
		) {
			return undefined;
		}

		return Decoration.widget({
			widget: new ResultWidget(result),
			side: 1,
		});
	}

	//#region Variables
	private handleVariables(sentence: string) {
		const variableAssignmentMatch = sentence.match(
			this.variableAssignmentRegex
		);

		if (variableAssignmentMatch && variableAssignmentMatch.length > 0) {
			this.parseVariable(variableAssignmentMatch[1], sentence);
		} else {
			const variableMatches = [
				...sentence.matchAll(this.variableSubstitutionRegex),
			];

			if (variableMatches.length > 0) {
				sentence = this.substituteVariables(sentence, variableMatches);
			}
		}

		return sentence;
	}

	private parseVariable(name: string, expression: string) {
		const assignmentPosition = expression.indexOf("=");
		if (assignmentPosition > -1) {
			const assignmentExpression = expression.substring(
				assignmentPosition + 1
			);

			const result = solveProviderManager.provideFirst(
				assignmentExpression,
				true
			);

			if (result !== undefined) {
				this.variableMap.set(name, result as any as IResult<any>);
			}
		}

		return false;
	}

	private substituteVariables(
		expression: string,
		variablesMatches: RegExpMatchArray[]
	) {
		let expressionSubstituted = expression;

		for (let i = 0; i < variablesMatches.length; i++) {
			const variableMatch = variablesMatches[i];

			if (!variableMatch) continue;

			const variableName = variableMatch[0];

			if (this.variableMap.has(variableName)) {
				const variableValue = this.variableMap.get(variableName);

				if (variableValue) {
					expressionSubstituted = expressionSubstituted.replace(
						variableName,
						variableValue.value
					);
				}
			}
		}

		return expressionSubstituted;
	}
	//#endregion
}
