import { BasePipelineStage } from "@/pipelines/definition/stages/BaseSimplePipelineStage";

export class MarkdownRemovalStage extends BasePipelineStage<string> {
	// Ignored nodes e.g. block qoutes (>), lists (-), checked list ([ ]) will remove the
	private markdownReplacementRegex = new RegExp(
		/^(?:(?:[-+*>]|(?:\[\s\])|(?:\d+\.))\s)+/m
	);

	protected execute(request: string): string {
		return request.replace(this.markdownReplacementRegex, "");
	}
}

export const SharedMarkdownRemovalStage = new MarkdownRemovalStage();
