import { BaseStatefulPipelineStage } from "@/pipelines/definition/stages/BaseStatefulPipelineStage";
import { IExpressionProcessorState } from "@/pipelines/stages/expression/state/IExpressionProcessorState";

export class ExtractInlineSolveStage extends BaseStatefulPipelineStage<
	IExpressionProcessorState,
	string
> {
	// Matches for either s`EXPRESSION` and will return the first instance.
	private inlineSolveRegex = new RegExp(/s`([^`]*)`/);

	protected execute(
		state: IExpressionProcessorState,
		request: string
	): string {
		// IMPORTANT: We match the raw input expression and not the processed expression because
		// 	          in cases where their is markdown elments e.g.lists, qouotes, etc...
		const match = state.originalLineText.match(this.inlineSolveRegex);

		if (match) {
			state.isInlineSolve = true;
			state.inlineSolveIndex = match.index;
			return match[1];
		}

		return request;
	}
}

export const SharedExtractInlineSolveStage = new ExtractInlineSolveStage();
