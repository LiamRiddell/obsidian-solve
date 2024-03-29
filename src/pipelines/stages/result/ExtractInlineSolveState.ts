import { BaseStatefulPipelineStage } from "@/pipelines/definition/stages/BaseStatefulPipelineStage";
import { IExpressionProcessorState } from "@/pipelines/stages/result/state/IExpressionProcessorState";

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
		const match = request.match(this.inlineSolveRegex);

		if (match) {
			state.isInlineSolve = true;
			state.inlineSolveIndex = match.index;
			return match[1];
		}

		return request;
	}
}

export const SharedExtractInlineSolveStage = new ExtractInlineSolveStage();
