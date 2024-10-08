import { BaseStatefulPipelineStage } from "@/pipelines/definition/stages/BaseStatefulPipelineStage";
import { IExpressionProcessorState } from "@/pipelines/stages/expression/state/IExpressionProcessorState";
import UserSettings from "@/settings/UserSettings";

export class ExplicitModeRemovalStage extends BaseStatefulPipelineStage<
	IExpressionProcessorState,
	string
> {
	protected execute(
		state: IExpressionProcessorState,
		request: string
	): string {
		const settings = UserSettings.getInstance();

		if (settings.engine.explicitMode && request.trimEnd().endsWith("=")) {
			// When explicit mode is enabled the sentence will end with = sign.
			// This needs to be removed in order for grammars to match.
			request = request.substring(0, request.length - 1).trimEnd();

			// Update the state for the decoration provider to know if this
			// should be allowed past the explicit mode filter.
			state.isAllowedExplicitModeExpression = true;
		}

		return request;
	}
}

export const SharedExplicitModeRemovalStage = new ExplicitModeRemovalStage();
