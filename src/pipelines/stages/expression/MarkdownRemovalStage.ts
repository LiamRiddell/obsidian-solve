import { BaseStatefulPipelineStage } from "@/pipelines/definition/stages/BaseStatefulPipelineStage";
import { IExpressionProcessorState } from "@/pipelines/stages/expression/state/IExpressionProcessorState";

export class MarkdownRemovalStage extends BaseStatefulPipelineStage<
	IExpressionProcessorState,
	string
> {
	// Ignored nodes e.g. block qoutes (>), lists (-), checked list ([ ]) will remove the
	private markdownReplacementRegex = new RegExp(
		/^(?:(?:[-+*>]|(?:\[\s\])|(?:\d+\.))\s)+/m
	);

	protected execute(
		state: IExpressionProcessorState,
		request: string
	): string {
		return request.replace(this.markdownReplacementRegex, "");
	}
}

export const SharedMarkdownRemovalStage = new MarkdownRemovalStage();
