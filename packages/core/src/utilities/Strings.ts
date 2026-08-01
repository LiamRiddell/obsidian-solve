/**
 * Strips a single layer of matching double quotes from a string, if present.
 * Returns the input unchanged if it isn't fully wrapped in quotes.
 *
 * Used for STRING token values, which the lexer emits with their surrounding
 * `"..."` quotes still attached.
 */
export function stripQuotes(value: string): string {
	return value.startsWith('"') && value.endsWith('"') && value.length >= 2
		? value.slice(1, -1)
		: value;
}
