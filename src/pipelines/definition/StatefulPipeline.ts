import { EmptyPipelineError } from "@/errors/EmptyPipelineError";
import { IStatefulPipelineStage } from "@/pipelines/definition/stages/IStatefulPipelineStage";

export class StatefulPipeline<State, Output> {
	private firstStage: IStatefulPipelineStage<State, Output> | null = null;
	private lastStage: IStatefulPipelineStage<State, Output> | null = null;

	addStage(
		stage: IStatefulPipelineStage<State, Output>
	): StatefulPipeline<State, Output> {
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

	process(state: State, request: Output): Output {
		if (!this.firstStage) {
			throw new EmptyPipelineError();
		}

		return this.firstStage.process(state, request);
	}
}
