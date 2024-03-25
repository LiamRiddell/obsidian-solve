import { BaseStatefulPipelineStage } from "@/pipelines/definition/stages/BaseStatefulPipelineStage";
import { IPreprocessorState } from "@/pipelines/stages/preprocess/state/IPreprocessorState";

export class CommentsRemovalStage extends BaseStatefulPipelineStage<
	IPreprocessorState,
	string
> {
	// Matches for either # or // followed by any text.
	private commentsRemovalRegex = new RegExp(/((?:#|\/\/).+)/);

	protected execute(state: IPreprocessorState, request: string): string {
		return request.replace(this.commentsRemovalRegex, "");
	}
}

export const SharedCommentsRemovalStage = new CommentsRemovalStage();
