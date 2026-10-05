/**
 * What committing a result writes into a line (#92).
 *
 * A full-line commit used to append the value, so `1000 + 200` became
 * `1000 + 200 = 1,200`. The engine reads that as a parse error, and every line
 * that reads it fails too, so one commit could blank a column of totals. The
 * value is now committed as a trailing comment, `1000 + 200 // = 1,200`: the
 * engine skips a comment, so the line keeps its value and nothing that reads
 * it changes.
 *
 * - A line that already has a comment keeps the value inside it:
 *   `1000 + 200 // rent` becomes `1000 + 200 // rent = 1,200`.
 * - Committing again replaces the value an earlier commit wrote, rather than
 *   adding a second.
 * - In explicit mode the line already ends in `=`; the comment replaces it.
 * - `#` no longer starts a comment: in solve-engine 2.x `#food` is a category
 *   tag, so a tagged line keeps its tag and the comment follows it.
 *
 * The boundary: an inline solve keeps its own path, which replaces the
 * `` s`...` `` span with plain text on purpose, since there the reader is
 * freezing a value into prose.
 */

/** How an inline-solve commit is written, from the plugin's inline-solve settings. */
export interface InlineCommitOptions {
	includeEqualsOnCommit: boolean;
	includeExpressionOnCommit: boolean;
	includeBackticksOnCommit: boolean;
}

/**
 * Where a line's `//` comment begins, or -1, skipping a `//` inside a quoted
 * string, as the engine does (`"a // b"` is text).
 *
 * @param line - The line's text.
 * @returns The index of the comment's first slash, or -1.
 */
export function commentStart(line: string): number {
	let quote: string | null = null;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (quote !== null) {
			if (ch === "\\") i++;
			else if (ch === quote) quote = null;
			continue;
		}
		if (ch === '"' || ch === "'" || ch === "`") quote = ch;
		else if (ch === "/" && line[i + 1] === "/") return i;
	}
	return -1;
}

/** The code before a comment with one space after it, or nothing when there is no code. */
function withSpace(code: string): string {
	return code ? `${code} ` : "";
}

/** The value as committed: `= ` and the formatted result, whichever way it arrived. */
function committedValue(result: string): string {
	const value = result.trim().replace(/^=\s*/, "");
	return `= ${value}`;
}

/**
 * A full-line commit: the line with its value as a trailing comment.
 *
 * @param line - The line's text.
 * @param result - The formatted result, as the widget shows it (`= 1,200`).
 * @returns The line to write.
 */
export function commitFullLine(line: string, result: string): string {
	const value = committedValue(result);
	const start = commentStart(line);
	if (start === -1) {
		// Explicit mode: the line ends in `=`, which the comment replaces.
		const code = line.trimEnd().replace(/\s*=$/, "");
		return `${withSpace(code)}// ${value}`;
	}
	const code = line.slice(0, start).trimEnd();
	// The comment's own words, without a value an earlier commit wrote at its end.
	const words = line.slice(start + 2).replace(/(?:^|\s+)=\s[^=]*$/, "").trim();
	return words ? `${withSpace(code)}// ${words} ${value}` : `${withSpace(code)}// ${value}`;
}

/**
 * An inline-solve commit: the `` s`...` `` span replaced by plain text, as the
 * inline-solve settings say.
 *
 * @param line - The line's text.
 * @param expression - The inline solve's expression.
 * @param result - The formatted result.
 * @param options - The inline-solve commit settings.
 * @returns The line to write.
 */
export function commitInlineSolve(line: string, expression: string, result: string, options: InlineCommitOptions): string {
	const shouldIncludeEquals = options.includeEqualsOnCommit && !options.includeExpressionOnCommit;
	const value = shouldIncludeEquals ? result : result.replace(/^= /, "");
	let replacement = options.includeExpressionOnCommit ? `${expression} = ${value}` : value;
	if (options.includeBackticksOnCommit) replacement = `\`${replacement}\``;
	// A function replacement, so a `$` in the value is written as it is.
	return line.replace(`s\`${expression}\``, () => replacement);
}
