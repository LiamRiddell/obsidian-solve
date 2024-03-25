import { IStatelessPipelineAsyncStage } from "@/pipelines/definition/stages/IStatelessPipelineAsyncStage";

export abstract class BasePipelineAsyncStage<T>
	implements IStatelessPipelineAsyncStage<T>
{
	private nextStage: IStatelessPipelineAsyncStage<T> | null = null;

	next(
		stage: IStatelessPipelineAsyncStage<T>
	): IStatelessPipelineAsyncStage<T> {
		this.nextStage = stage;
		return stage;
	}

	async process(request: T): Promise<T> {
		request = await this.execute(request);
		return this.nextStage ? this.nextStage.process(request) : request;
	}

	protected abstract execute(request: T): Promise<T>;
}
