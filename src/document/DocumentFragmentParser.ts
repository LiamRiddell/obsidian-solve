import grammar, {
	ObsidianMarkdownParserSemantics,
} from "@/grammars/document/DocumentFragmentParser.ohm-bundle";
import { logger } from "@/utilities/Logger";

export class ObsidianMarkdownParser {
	private semantics: ObsidianMarkdownParserSemantics;

	constructor() {
		this.semantics = grammar.createSemantics();

		this.semantics.addOperation<string | undefined>("visit", {
			// Elements
			Header(_, _1, textNode) {
				logger.debug(
					`\t- Header (Ignored) -> ${textNode.sourceString}`
				);
				return undefined;
			},

			Blockquote(_, _1, textNode) {
				logger.debug(`\t- Blockquote -> ${textNode.sourceString}`);
				return textNode.sourceString;
			},

			HorizontalRule(_, _1, _2, _3, _4) {
				logger.debug(
					`\t- HorizontalRule (Ignored) -> ${this.sourceString}`
				);
				return undefined;
			},

			UnorderedList(_, _1, textNode) {
				logger.debug(`\t- UnorderedList -> ${textNode.sourceString}`);
				return textNode.sourceString;
			},

			OrderedList(_, _1, _2, textNode) {
				logger.debug(`\t- OrderedList -> ${textNode.sourceString}`);
				return textNode.sourceString;
			},

			Paragraph(textNode) {
				logger.debug(`\t- Paragraph -> ${textNode.sourceString}`);
				return textNode.sourceString;
			},

			// Utilities
			// _iter(...children) {
			// 	children.map((c) => c.visit());
			// },
		});
	}

	public parseElement(line: string): string | undefined {
		const matchResult = grammar.match(line);

		if (matchResult.failed()) {
			return undefined;
		}

		return this.semantics(matchResult).visit();
	}
}
