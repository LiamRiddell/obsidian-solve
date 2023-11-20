import { BasePipelineStage } from "@/pipelines/definition/stages/BasePipelineStage";

export class CommentsRemovalStage extends BasePipelineStage<string> {
	protected execute(request: string): string {
		return request;
	}
}

export const SharedCommentsRemovalStage = new CommentsRemovalStage();
