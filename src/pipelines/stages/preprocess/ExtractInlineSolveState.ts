import { BaseStatefulPipelineStage } from "@/pipelines/definition/stages/BaseStatefulPipelineStage";
import { IPreprocessorState } from "@/pipelines/stages/preprocess/state/IPreprocessorState";

export class ExtractInlineSolveStage extends BaseStatefulPipelineStage<
	IPreprocessorState,
	string
> {
	// Matches for either s`EXPRESSION` and will return the first instance.
	private inlineSolveRegex = new RegExp(/s`([^`]*)`/);

	protected execute(state: IPreprocessorState, request: string): string {
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
