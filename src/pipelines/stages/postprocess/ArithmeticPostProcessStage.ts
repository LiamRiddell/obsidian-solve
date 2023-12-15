import { BaseContextPipelineStage } from "@/pipelines/definition/stages/BaseContextPipelineStage";
import { IProvider } from "@/providers/IProvider";
import { AnyResult } from "@/results/AnyResult";
import UserSettings from "@/settings/UserSettings";
import { BASIC_ARITHMETIC_PROVIDER } from "@/utilities/constants/providers/Names";

export class ArithmeticInsertEqualSignStage extends BaseContextPipelineStage<
	[IProvider, AnyResult],
	string
> {
	protected execute(context: [IProvider, AnyResult], request: string) {
		const settings = UserSettings.getInstance();
		const [provider] = context;

		if (provider.name !== BASIC_ARITHMETIC_PROVIDER) return request;

		if (settings.arithmeticProvider.enabled === false) return request;

		// When you're in explicit mode (e.g. 10 + 10 '=') we should not duplicate the equals sign.
		if (settings.engine.explicitMode === false) {
			request = `= ${request}`;
		}

		return request;
	}
}

export const SharedArithmeticInsertEqualSignStage =
	new ArithmeticInsertEqualSignStage();
