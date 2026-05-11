export interface InlineSolveResult {
	expressions: string[];
	indices: number[];
}

export class InlineSolveExtractor {
	private inlineSolveRegex = /s`([^`]*)`/g;

	extract(input: string): InlineSolveResult {
		const expressions: string[] = [];
		const indices: number[] = [];
		let match: RegExpExecArray | null;

		while ((match = this.inlineSolveRegex.exec(input)) !== null) {
			expressions.push(match[1]);
			indices.push(match.index);
		}

		return { expressions, indices };
	}

	hasInlineSolve(input: string): boolean {
		this.inlineSolveRegex.lastIndex = 0;
		return this.inlineSolveRegex.test(input);
	}
}

export const sharedInlineSolveExtractor = new InlineSolveExtractor();