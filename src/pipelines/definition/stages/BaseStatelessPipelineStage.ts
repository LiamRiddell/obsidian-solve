import { IStatelessPipelineStage } from "@/pipelines/definition/stages/IStatelessPipelineStage";

export abstract class BaseStatelessPipelineStage<T>
	implements IStatelessPipelineStage<T>
{
	private nextStage: IStatelessPipelineStage<T> | null = null;

	next(stage: IStatelessPipelineStage<T>): IStatelessPipelineStage<T> {
		this.nextStage = stage;
		return stage;
	}

	process(request: T): T {
		request = this.execute(request);
		return this.nextStage ? this.nextStage.process(request) : request;
	}

	protected abstract execute(request: T): T;
}
