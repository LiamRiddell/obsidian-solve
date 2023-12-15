import { EmptyPipelineError } from "@/errors/EmptyPipelineError";
import { IPipelineStage } from "@/pipelines/definition/stages/ISimplePipelineStage";

export class Pipeline<T> {
	private firstStage: IPipelineStage<T> | null = null;
	private lastStage: IPipelineStage<T> | null = null;

	addStage(stage: IPipelineStage<T>): Pipeline<T> {
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

	process(request: T): T {
		if (!this.firstStage) {
			throw new EmptyPipelineError();
		}

		return this.firstStage.process(request);
	}
}
