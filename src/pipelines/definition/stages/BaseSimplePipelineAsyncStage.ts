import { IPipelineAsyncStage } from "@/pipelines/definition/stages/ISimplePipelineAsyncStage";

export abstract class BasePipelineAsyncStage<T>
	implements IPipelineAsyncStage<T>
{
	private nextStage: IPipelineAsyncStage<T> | null = null;

	next(stage: IPipelineAsyncStage<T>): IPipelineAsyncStage<T> {
		this.nextStage = stage;
		return stage;
	}

	async process(request: T): Promise<T> {
		request = await this.execute(request);
		return this.nextStage ? this.nextStage.process(request) : request;
	}

	// Execute the stages user code.
	protected abstract execute(request: T): Promise<T>;
}
