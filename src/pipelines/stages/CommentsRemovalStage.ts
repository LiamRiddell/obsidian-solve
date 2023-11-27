import { BasePipelineStage } from "@/pipelines/definition/stages/BasePipelineStage";

export class CommentsRemovalStage extends BasePipelineStage<string> {
	// Matches for either # or // followed by some any text.
	private commentsRemovalRegex = new RegExp(/((?:#|\/\/).+)/);

	protected execute(request: string): string {
		return request.replace(this.commentsRemovalRegex, "");
	}
}

export const SharedCommentsRemovalStage = new CommentsRemovalStage();
