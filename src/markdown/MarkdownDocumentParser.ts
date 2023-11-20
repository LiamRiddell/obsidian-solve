import { Token, Tokens, TokensList, marked } from "marked";

export class MarkdownDocumentParser {
	private documentOffset: number = 0;
	private documentLineCount: number = 0;

	public reset() {
		this.documentOffset = 0;
		this.documentLineCount = 1;
	}

	public parse(
		markdown: string,
		onTextDiscovered: (
			text: string,
			from: number,
			to: number,
			line: number
		) => void
	) {
		const tokens = marked.lexer(markdown);

		console.log(tokens);

		this.parseTokensInternal(tokens, onTextDiscovered);
	}

	private parseTokensInternal(
		tokens: Token[] | TokensList,
		onTextDiscovered: (
			text: string,
			from: number,
			to: number,
			line: number
		) => void
	) {
		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];

			switch (token.type) {
				case "text": {
					// For text tokens, call the callback with the current line number
					const textToken = token as Tokens.Text;

					onTextDiscovered(
						textToken.text,
						this.documentOffset,
						this.documentOffset + textToken.raw.length,
						this.documentLineCount
					);

					this.documentOffset += textToken.raw.length;
					break;
				}
				case "space": {
					// Space tokens may contain multiple new lines
					const spaceToken = token as Tokens.Space;

					const newLines = (spaceToken.raw.match(/\n/g) || []).length;

					console.log(
						`SPACE DETECTED ADDING ${newLines} LINES TO COUNTER`
					);

					this.documentLineCount += newLines;

					this.documentOffset += spaceToken.raw.length;

					break;
				}
				case "list": {
					// For lists, handle each item separately and account for new lines
					const listToken = token as Tokens.List;
					for (const item of listToken.items) {
						this.documentOffset += 2; // Assuming 2 characters for "- " or "1. "

						this.documentLineCount++; // Each list item starts on a new line

						this.parseTokensInternal(item.tokens, onTextDiscovered);

						// Add one more line if there's a trailing newline after a list item
						if (item.raw.endsWith("\n")) {
							this.documentLineCount++;
						}
					}
					break;
				}
				default: {
					// For all other tokens, just add their raw length to the offset
					this.documentOffset += token.raw.length;

					// Count the number of new lines in the raw content
					const newLines = (token.raw.match(/\n/g) || []).length;

					this.parseTokensInternal(
						(token as any)?.tokens,
						onTextDiscovered
					);

					console.log(
						`TOKEN: ${token.type} ADDING ${newLines} TO COUNTER`
					);

					this.documentLineCount += newLines;
					break;
				}
			}
		}
	}
}
