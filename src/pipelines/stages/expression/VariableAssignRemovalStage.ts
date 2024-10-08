import { BaseStatefulPipelineStage } from "@/pipelines/definition/stages/BaseStatefulPipelineStage";
import { IExpressionProcessorState } from "@/pipelines/stages/expression/state/IExpressionProcessorState";
import UserSettings from "@/settings/UserSettings";
import { logger } from "@/utilities/Logger";

export class VariableAssignRemovalStage extends BaseStatefulPipelineStage<
	IExpressionProcessorState,
	string
> {
	// Removes variables assigning so we can provide a result for the variable e.g. :myVar = 10 + 2 -> 10 + 2
	private variableAssignReplacementRegex = new RegExp(/(?::\w+\s+=)/m);

	protected execute(
		state: IExpressionProcessorState,
		request: string
	): string {
		const settings = UserSettings.getInstance();

		// If we match then we know it's a variable assignment therefore it should be allowed in explicit mode
		if (
			settings.engine.explicitMode &&
			this.variableAssignReplacementRegex.test(request)
		) {
			state.isAllowedExplicitModeExpression = true;
			logger.debug(
				"VariableAssignRemovalStage: Detected Variable Assignment Allowing Through Explicit Mode"
			);
		}

		if (settings.variable.renderResult) {
			request = request.replace(this.variableAssignReplacementRegex, "");
		}

		return request;
	}
}

export const SharedVariableAssignRemovalStage =
	new VariableAssignRemovalStage();
