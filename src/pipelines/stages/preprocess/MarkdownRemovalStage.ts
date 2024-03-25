import { BaseStatefulPipelineStage } from "@/pipelines/definition/stages/BaseStatefulPipelineStage";
import { IPreprocessorState } from "@/pipelines/stages/preprocess/state/IPreprocessorState";

export class MarkdownRemovalStage extends BaseStatefulPipelineStage<
	IPreprocessorState,
	string
> {
	// Ignored nodes e.g. block qoutes (>), lists (-), checked list ([ ]) will remove the
	private markdownReplacementRegex = new RegExp(
		/^(?:(?:[-+*>]|(?:\[\s\])|(?:\d+\.))\s)+/m
	);

	protected execute(state: IPreprocessorState, request: string): string {
		return request.replace(this.markdownReplacementRegex, "");
	}
}

export const SharedMarkdownRemovalStage = new MarkdownRemovalStage();
