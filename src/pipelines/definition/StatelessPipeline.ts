import { EmptyPipelineError } from "@/errors/EmptyPipelineError";
import { IStatelessPipelineStage } from "@/pipelines/definition/stages/IStatelessPipelineStage";

export class StatelessPipeline<T> {
	private firstStage: IStatelessPipelineStage<T> | null = null;
	private lastStage: IStatelessPipelineStage<T> | null = null;

	addStage(stage: IStatelessPipelineStage<T>): StatelessPipeline<T> {
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
