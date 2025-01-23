import { BaseStatefulPipelineStage } from "@/pipelines/definition/stages/BaseStatefulPipelineStage";
import { IExpressionProcessorState } from "@/pipelines/stages/expression/state/IExpressionProcessorState";

export class ExtractInlineSolveStage extends BaseStatefulPipelineStage<
	IExpressionProcessorState,
	string[]
> {
	// Matches for either s`EXPRESSION`.
	private inlineSolveRegex = new RegExp(/s`([^`]*)`/g);

	protected execute(
		state: IExpressionProcessorState,
		request: string[]
	): string[] {
		// IMPORTANT: We match the raw input expression and not the processed expression because
		// 	          in cases where there are markdown elements e.g.lists, quotes, etc...
		const matches: string[] = [];
		const indices: number[] = [];
		for (const match of state.originalLineText.matchAll(this.inlineSolveRegex)) {
			matches.push(match[1]);
			indices.push(match.index!);
		}

		if (matches.length > 0) {
			state.isInlineSolve = true;
			state.inlineSolveIndices = indices;
			return matches;
		}

		return request;
	}
}

export const SharedExtractInlineSolveStage = new ExtractInlineSolveStage();
