import { IPipelineStage } from "@/pipelines/definition/stages/IPipelineStage";

export abstract class BasePipelineStage<T> implements IPipelineStage<T> {
	private nextStage: IPipelineStage<T> | null = null;

	next(stage: IPipelineStage<T>): IPipelineStage<T> {
		this.nextStage = stage;
		return stage;
	}

	process(request: T): T {
		request = this.execute(request);
		return this.nextStage ? this.nextStage.process(request) : request;
	}

	// Execute the stage's user code.
	protected abstract execute(request: T): T;
}
