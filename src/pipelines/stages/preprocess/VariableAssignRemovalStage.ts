import { BaseStatefulPipelineStage } from "@/pipelines/definition/stages/BaseStatefulPipelineStage";
import { IPreprocessorState } from "@/pipelines/stages/preprocess/state/IPreprocessorState";
import UserSettings from "@/settings/UserSettings";

export class VariableAssignRemovalStage extends BaseStatefulPipelineStage<
	IPreprocessorState,
	string
> {
	// Removes variables assigning so we can provide a result for the variable e.g. :myVar = 10 + 2 -> 10 + 2
	private variableAssignReplacementRegex = new RegExp(/(?::\w+\s+=)/m);

	protected execute(state: IPreprocessorState, request: string): string {
		const settings = UserSettings.getInstance();

		if (settings.variable.renderResult) {
			request = request.replace(this.variableAssignReplacementRegex, "");
		}

		return request;
	}
}

export const SharedVariableAssignRemovalStage =
	new VariableAssignRemovalStage();
