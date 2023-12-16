import { BasePipelineStage } from "@/pipelines/definition/stages/BaseSimplePipelineStage";

export class MathSyntaxRemovalStage extends BasePipelineStage<string> {
	// Matches for any math syntax which starts and ends with `$$` for example $$10+20$$
	private mathjaxFormatRegex = new RegExp(/^(?:\$\$(.+)\$\$)$/g);
	private latexFormatRegex = new RegExp(/^(?:\$(.+)\$)$/g);

	protected execute(request: string): string {
		const mathjaxMatch = this.mathjaxFormatRegex.exec(request);

		if (mathjaxMatch) {
			return mathjaxMatch[1];
		}

		const latexMatch = this.latexFormatRegex.exec(request);

		if (latexMatch) {
			return latexMatch[1];
		}

		return request;
	}
}

export const SharedMathJaxRemovalStage = new MathSyntaxRemovalStage();
