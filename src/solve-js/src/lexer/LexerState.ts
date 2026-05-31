/**
 * Lexer state machine modes.
 * - Main: document-level scanning with markdown classification
 * - Inline: expression embedded in markdown inline solve (`s\`...\``)
 * - String: inside a double-quoted string literal
 */
export enum LexerState {
	Main = "main",
	Inline = "inline",
	String = "string",
}
