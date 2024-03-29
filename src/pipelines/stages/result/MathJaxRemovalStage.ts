import { BaseStatefulPipelineStage } from "@/pipelines/definition/stages/BaseStatefulPipelineStage";
import { IExpressionProcessorState } from "@/pipelines/stages/result/state/IExpressionProcessorState";

export class MathSyntaxRemovalStage extends BaseStatefulPipelineStage<
	IExpressionProcessorState,
	string
> {
	// Matches for any math syntax which starts and ends with `$$` for example $$10+20$$
	private mathjaxFormatRegex = new RegExp(/^(?:\$\$(.+)\$\$)$/g);
	private latexFormatRegex = new RegExp(/^(?:\$(.+)\$)$/g);

	protected execute(
		state: IExpressionProcessorState,
		request: string
	): string {
		const mathjaxMatch = this.mathjaxFormatRegex.exec(request);

		if (mathjaxMatch) {
			const expression = mathjaxMatch[1];
			const expressionEqualsIndex = expression.indexOf("=");

			if (expressionEqualsIndex > -1) {
				return expression.substring(expressionEqualsIndex + 1).trim();
			}

			return expression;
		}

		const latexMatch = this.latexFormatRegex.exec(request);

		if (latexMatch) {
			const expression = latexMatch[1];
			const expressionEqualsIndex = expression.indexOf("=");

			if (expressionEqualsIndex > -1) {
				return expression.substring(expressionEqualsIndex + 1).trim();
			}

			return expression;
		}

		return request;
	}
}

export const SharedMathJaxRemovalStage = new MathSyntaxRemovalStage();
