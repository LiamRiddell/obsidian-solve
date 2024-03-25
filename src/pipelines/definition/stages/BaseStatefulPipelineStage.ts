import { IStatefulPipelineStage } from "@/pipelines/definition/stages/IStatefulPipelineStage";

export abstract class BaseStatefulPipelineStage<TState, TReturn>
	implements IStatefulPipelineStage<TState, TReturn>
{
	private nextStage: IStatefulPipelineStage<TState, TReturn> | null = null;

	next(
		stage: IStatefulPipelineStage<TState, TReturn>
	): IStatefulPipelineStage<TState, TReturn> {
		this.nextStage = stage;
		return stage;
	}

	process(state: TState, request: TReturn): TReturn {
		request = this.execute(state, request);
		return this.nextStage
			? this.nextStage.process(state, request)
			: request;
	}

	protected abstract execute(state: TState, request: TReturn): TReturn;
}
