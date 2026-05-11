export interface PreprocessorResult {
	cleanedExpression: string;
	hasInlineSolve: boolean;
	inlineExpressions: string[];
	inlineIndices: number[];
	originalLineText: string;
}

export class Preprocessor {
	private commentsRemovalRegex = /(?:#|\/\/).+/;
	private markdownReplacementRegex = /^(?:(?:[-+*>]|(?:\[\s\])|(?:\d+\.))\s)+/m;
	private mathJaxDetectionRegex = /\$\$?[^$]+\$?\$?/;

	process(line: string): PreprocessorResult {
		const originalLineText = line;
		let expression = line;

		expression = this.removeMarkdown(expression);
		expression = this.removeComments(expression);
		expression = this.removeMathJax(expression);

		const { inlineExpressions, inlineIndices } = this.extractInlineSolve(originalLineText);

		return {
			cleanedExpression: expression.trim(),
			hasInlineSolve: inlineExpressions.length > 0,
			inlineExpressions,
			inlineIndices,
			originalLineText,
		};
	}

	private removeMarkdown(input: string): string {
		return input.replace(this.markdownReplacementRegex, "");
	}

	private removeComments(input: string): string {
		return input.replace(this.commentsRemovalRegex, "");
	}

	private removeMathJax(input: string): string {
		return input.replace(this.mathJaxDetectionRegex, "").trim();
	}

	private extractInlineSolve(input: string): {
		inlineExpressions: string[];
		inlineIndices: number[];
	} {
		const inlineSolveRegex = /s`([^`]*)`/g;
		const matches: string[] = [];
		const indices: number[] = [];
		let match: RegExpExecArray | null;

		while ((match = inlineSolveRegex.exec(input)) !== null) {
			matches.push(match[1]);
			indices.push(match.index);
		}

		return { inlineExpressions: matches, inlineIndices: indices };
	}
}

export const sharedPreprocessor = new Preprocessor();