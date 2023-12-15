import { EmptyPipelineError } from "@/errors/EmptyPipelineError";
import { IPipelineAsyncStage } from "@/pipelines/definition/stages/ISimplePipelineAsyncStage";

export class PipelineAsync<T> {
	private firstStage: IPipelineAsyncStage<T> | null = null;
	private lastStage: IPipelineAsyncStage<T> | null = null;

	addStage(stage: IPipelineAsyncStage<T>): PipelineAsync<T> {
		if (!this.firstStage) {
			this.firstStage = this.lastStage = stage;
		} else {
			if (this.lastStage) {
				this.lastStage.next(stage);
			}

			this.lastStage = stage;
		}

		return this;
	}

	async process(request: T): Promise<T> {
		if (!this.firstStage) {
			throw new EmptyPipelineError();
		}

		return this.firstStage.process(request);
	}
}
