import { BaseStatefulPipelineStage } from "@/pipelines/definition/stages/BaseStatefulPipelineStage";
import { IExpressionProcessorState } from "@/pipelines/stages/result/state/IExpressionProcessorState";

export class CommentsRemovalStage extends BaseStatefulPipelineStage<
	IExpressionProcessorState,
	string
> {
	// Matches for either # or // followed by any text.
	private commentsRemovalRegex = new RegExp(/((?:#|\/\/).+)/);

	protected execute(
		state: IExpressionProcessorState,
		request: string
	): string {
		return request.replace(this.commentsRemovalRegex, "");
	}
}

export const SharedCommentsRemovalStage = new CommentsRemovalStage();
