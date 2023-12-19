import grammar, {
	ObsidianMarkdownParserSemantics,
} from "@/grammars/document/DocumentFragmentParser.ohm-bundle";
import { logger } from "@/utilities/Logger";

export class DocumentFragmentParser {
	private semantics: ObsidianMarkdownParserSemantics;

	private relativeLineIndex: number;
	private relativeColumnIndex: number;
	private onTextNode: (
		text: string,
		relativeLineIndex: number,
		relativeColumnIndex: number
	) => void;

	constructor() {
		this.semantics = grammar.createSemantics();

		// HACK: I'm not a really a fan of how this is handled.
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const documentFragmentParser = this;

		this.semantics.addOperation("visit", {
			// Fragment(arg0) {
			// 	console.log("FRAGMENT");
			// 	arg0.children.map((c) => c.visit());
			// },

			// Used for increasing the current line number.
			NonEmptyLine(elementNode, _) {
				// logger.debug(
				// 	`LINE - ${documentFragmentParser.relativeLineIndex}`,
				// 	elementNode.sourceString
				// );

				elementNode.visit();

				documentFragmentParser.relativeLineIndex += 1;
				documentFragmentParser.relativeColumnIndex +=
					this.sourceString.length;
			},

			EmptyLine(emptyNode, _2) {
				// logger.debug(
				// 	`EMPTY LINE - ${documentFragmentParser.relativeLineIndex}`
				// );

				documentFragmentParser.relativeLineIndex += 1;
				documentFragmentParser.relativeColumnIndex +=
					this.sourceString.length;
			},

			// Elements
			Header(_, _1, textNode) {
				// logger.debug(
				// 	`\t- Header (Ignored) -> ${textNode.sourceString}`
				// );
			},

			Blockquote(_, _1, textNode) {
				//logger.debug(`\t- Blockquote -> ${textNode.sourceString}`);
			},

			HorizontalRule(_, _1, _2, _3, _4) {
				// logger.debug(
				// 	`\t- HorizontalRule (Ignored) -> ${this.sourceString}`
				// );
			},

			UnorderedList(_, _1, textNode) {
				//logger.debug(`\t- UnorderedList -> ${textNode.sourceString}`);
			},

			OrderedList(_, _1, _2, textNode) {
				//logger.debug(`\t- OrderedList -> ${textNode.sourceString}`);
			},

			// IMPORTANT: When dealing with multiline blocks we need to handle updating the line count.
			Code(_0, _1, _2) {
				//logger.debug(`\t- Code (Ignored) -> ${this.sourceString}`);

				const lines = (this.sourceString.match(/\n/g) || "").length;
				//logger.debug(`\t\t- Number of Lines Added: ${lines}`);

				// Don't add additional + 1 here because it's done by default in Line rule.
				documentFragmentParser.relativeLineIndex += lines;
			},

			Paragraph(textNode) {
				// logger.debug(`\t- Paragraph -> ${textNode.sourceString}`);
				documentFragmentParser.onTextNode(
					textNode.sourceString,
					documentFragmentParser.relativeLineIndex,
					documentFragmentParser.relativeColumnIndex
				);
			},

			// Utilities
			_iter(...children) {
				return children.map((c) => c.visit());
			},
		});

		// We need to reset internal state that is used to calculate relative line index
		this.resetInternalState();
	}

	public parse(
		documentFragment: string,
		onTextNode: (
			text: string,
			relativeLineIndex: number,
			relativeColumnIndex: number
		) => void
	) {
		try {
			this.resetInternalState();

			// Bind the callback
			this.onTextNode = onTextNode;

			const matchResult = grammar.match(documentFragment);

			if (matchResult.failed()) {
				return undefined;
			}

			return this.semantics(matchResult).visit();
		} catch (e) {
			logger.error(e);
			return undefined;
		}
	}

	private resetInternalState() {
		this.relativeLineIndex = 1;
		this.relativeColumnIndex = 0;
	}
}
