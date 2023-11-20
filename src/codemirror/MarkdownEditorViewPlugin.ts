import { ResultWidget } from "@/codemirror/widgets/ResultWidget";
import { pluginEventBus } from "@/eventbus/PluginEventBus";
import { MarkdownDocumentParser } from "@/markdown/MarkdownDocumentParser";
import { Pipeline } from "@/pipelines/definition/Pipeline";
import { SharedCommentsRemovalStage } from "@/pipelines/stages/CommentsRemovalStage";
import { SharedMarkdownRemovalStage } from "@/pipelines/stages/MarkdownRemovalStage";
import { VariableProcessingStage } from "@/pipelines/stages/VariableProcessingStage";
import UserSettings from "@/settings/UserSettings";
import { logger } from "@/utilities/Logger";
import { RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	PluginValue,
	ViewUpdate,
} from "@codemirror/view";
import { Token, Tokens, TokensList } from "marked";
import { EPluginEvent } from "../constants/EPluginEvent";
import { EPluginStatus } from "../constants/EPluginStatus";
import { solveProviderManager } from "../providers/ProviderManager";

export class MarkdownEditorViewPlugin implements PluginValue {
	public decorations: DecorationSet;
	private userSettings: UserSettings;

	private markdownParser: MarkdownDocumentParser;
	private processingPipeline: Pipeline<string>;

	constructor(view: EditorView) {
		logger.debug(`[SolveViewPlugin] Constructer`);

		this.userSettings = UserSettings.getInstance();

		this.markdownParser = new MarkdownDocumentParser();

		this.processingPipeline = new Pipeline<string>()
			.addStage(SharedMarkdownRemovalStage)
			.addStage(SharedCommentsRemovalStage)
			.addStage(new VariableProcessingStage());

		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate) {
		if (update.docChanged || update.viewportChanged) {
			pluginEventBus.emit(
				EPluginEvent.StatusBarUpdate,
				EPluginStatus.Solving
			);

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

	// buildDecorations(view: EditorView): DecorationSet {
	// 	const builder = new RangeSetBuilder<Decoration>();
	// 	const visibleRanges = view.visibleRanges;
	// 	const seenLines = new Set<number>();

	// 	let lines = [];

	// 	for (const { from, to } of visibleRanges) {
	// 		let nextLineTextOffset = 0;

	// 		for (const lineTextRaw of view.state.doc.iterRange(from, to)) {
	// 			const linePosition = from + nextLineTextOffset;
	// 			const line = view.state.doc.lineAt(linePosition);
	// 			let lineText = line.text.trim();

	// 			if (
	// 				!lineText ||
	// 				seenLines.has(line.number) ||
	// 				lineText.startsWith("#") ||
	// 				lineText.startsWith("[")
	// 			) {
	// 				nextLineTextOffset += lineTextRaw.length;
	// 				continue;
	// 			}

	// 			lines.push(lineText.trimStart());
	// 			//logger.debug(`Before Pipeline:\n${lineText}`);
	// 			lineText = this.processingPipeline.process(lineText);
	// 			//logger.debug(`After Pipeline:\n${lineText}`);

	// 			const decoration = this.provideDecoration(
	// 				lineText,
	// 				line.number
	// 			);

	// 			if (decoration) {
	// 				builder.add(line.to, line.to, decoration);
	// 			}

	// 			seenLines.add(line.number);
	// 			nextLineTextOffset += lineTextRaw.length;
	// 		}
	// 	}

	// 	logger.debug(lines);

	// 	return builder.finish();
	// }

	buildDecorations(view: EditorView) {
		const builder = new RangeSetBuilder<Decoration>();

		this.markdownParser.reset();

		for (const { from, to } of view.visibleRanges) {
			const rangeStartLine = view.state.doc.lineAt(from);
			const rangeEndLine = view.state.doc.lineAt(to);

			console.log(
				`Process Range From Line ${rangeStartLine.number} -> ${rangeEndLine.number}`
			);

			this.markdownParser.parse(
				view.state.sliceDoc(from, to),
				(text, from, to, line) => {
					try {
						const lineDesc = view.state.doc.line(line);

						console.log(
							`[Markdown Document Parser] Lines ${lineDesc.number}|${line} -> ${text}`
						);

						builder.add(
							lineDesc.to,
							lineDesc.to,
							Decoration.widget({
								widget: new ResultWidget(
									`Line ${lineDesc.number} = ${lineDesc.text} | Ours = ${text}`,
									lineDesc.number
								),
								side: 1,
							})
						);
					} catch (error) {
						console.error(error);
					}
				}
			);
		}

		return builder.finish();
	}

	private processTokens(
		tokens: TokensList | Token[],
		documentPosition: number,
		onTextToken: (token: Tokens.Text, from: number, to: number) => void
	) {
		for (const token of tokens) {
			if (token.type === "text") {
				// Call the callback for text tokens
				onTextToken(
					token as Tokens.Text,
					documentPosition,
					documentPosition + token.raw.length
				);
			}

			let tokenLength = token.raw.length;

			// If there are nested tokens, process them recursively
			if ((token as any)?.tokens && (token as any)?.tokens.length) {
				this.processTokens(
					(token as any)?.tokens,
					documentPosition,
					onTextToken
				);
				// After processing nested tokens, find the last token's length to update the position
				const lastNestedToken = (token as any)?.tokens[
					(token as any)?.tokens.length - 1
				];
				tokenLength = lastNestedToken.raw.length; // Or calculate the full nested structure length if needed
			}

			// Update documentPosition for the next token
			documentPosition += tokenLength;

			// If the token represents a newline or space, additional handling might be needed
			if (token.type === "space") {
				// Adjust the documentPosition by counting the newlines
				const newlines = token.raw.match(/\n/g) || [];
				documentPosition += newlines.length; // This assumes each newline represents a new line
			}
		}
	}

	// private processDocumentTokens(
	// 	documentTokens: TokensList,
	// 	onTextToken: (token: Tokens.Text, from: number, to: number) => void
	// ) {
	// 	// Iterate the top level tokens
	// 	let documentOffset = 0;

	// 	for (const token of documentTokens) {
	// 		// If List Handle
	// 		if (
	// 			(token as Tokens.List)?.items &&
	// 			(token as Tokens.List).items.length
	// 		) {
	// 			// this.processTokens(
	// 			// 	(token as Tokens.List).items as Token[],
	// 			// 	documentPosition,
	// 			// 	onTextToken
	// 			// );
	// 			// for (const listItem of (token as Tokens.List).items) {
	// 			// }
	// 		}

	// 		// Otherwise Extract Text
	// 		if ((token as any)?.tokens && (token as any).tokens.length) {
	// 			const text = this.extractText((token as any).tokens);
	// 			onTextToken(
	// 				token as Tokens.Text,
	// 				documentOffset,
	// 				documentOffset
	// 			);
	// 		}

	// 		// Increment
	// 		documentOffset += token.raw.length;
	// 	}
	// }

	private extractText(tokens: TokensList | Token[]): string {
		for (const token of tokens) {
			if (token.type === "text" && !(token as any)?.tokens) {
				return token.text;
			}

			if ((token as any)?.tokens && (token as any).tokens.length) {
				return this.extractText((token as any).tokens);
			}
		}

		return "";
	}

	// private processTokens(
	// 	tokens: TokensList | Token[],
	// 	documentPosition: number,
	// 	onTextToken: (token: Tokens.Text, from: number, to: number) => void
	// ) {
	// 	for (const token of tokens) {
	// 		// If there are nested tokens, process them recursively
	// 		if ((token as any)?.tokens && (token as any)?.tokens.length) {
	// 			this.processTokens(
	// 				(token as any)?.tokens,
	// 				documentPosition,
	// 				onTextToken
	// 			);
	// 		}
	// 		// Special handling for list items
	// 		else if (
	// 			(token as Tokens.List)?.items &&
	// 			(token as Tokens.List)?.items.length
	// 		) {
	// 			this.processTokens(
	// 				(token as Tokens.List).items as Token[],
	// 				documentPosition,
	// 				onTextToken
	// 			);
	// 		}

	// 		// Update documentPosition for the next token
	// 		if (
	// 			token.type !== "text" &&
	// 			token.type !== "list" &&
	// 			token.type !== "list_item"
	// 		) {
	// 			logger.debug(
	// 				`Token: ${token.type} -> ${documentPosition} + ${token.raw.length} [${token.raw}]`
	// 			);

	// 			documentPosition += token.raw.length;
	// 		}

	// 		if (token.type === "text" && !(token as any)?.tokens) {
	// 			onTextToken(
	// 				token as Tokens.Text,
	// 				documentPosition,
	// 				documentPosition
	// 			);
	// 		}
	// 	}
	// }

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
		const result = solveProviderManager.provideFirst(sentence);

		if (result === undefined) {
			return undefined;
		}

		// If the input sentence and the output is the same value ignore it.
		// For example, 10 = 10
		const sentenceLowercasedTrimmed = sentence.toLowerCase().trim();
		const resultLowercaseTrimmed = result.startsWith("= ")
			? result.substring(2).toLocaleLowerCase().trim()
			: result.toLowerCase().trim();

		if (sentenceLowercasedTrimmed === resultLowercaseTrimmed) {
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
			widget: new ResultWidget(result, lineNumber),
			side: 1,
		});
	}
}
