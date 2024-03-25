import { UndefinedContextInPipelineError } from "@/errors/UndefinedContextInPipelineError";
import { BaseStatefulPipelineStage } from "@/pipelines/definition/stages/BaseStatefulPipelineStage";
import { IProvider } from "@/providers/IProvider";
import { AnyResult } from "@/results/AnyResult";

export class DebugInformationStage extends BaseStatefulPipelineStage<
	[IProvider, AnyResult],
	string
> {
	private debugMode: boolean;

	constructor() {
		super();
		this.debugMode = true;
	}

	protected execute(context: [IProvider, AnyResult], request: string) {
		const [provider, result] = context;

		if (provider === undefined || result === undefined) {
			throw new UndefinedContextInPipelineError();
		}

		if (this.debugMode) {
			request += ` [${provider.name}]`;
		}

		return request;
	}
}

export const SharedDebugInformationStage = new DebugInformationStage();
