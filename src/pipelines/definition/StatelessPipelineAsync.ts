import { EmptyPipelineError } from "@/errors/EmptyPipelineError";
import { IStatelessPipelineAsyncStage } from "@/pipelines/definition/stages/IStatelessPipelineAsyncStage";

export class StatelessPipelineAsync<T> {
	private firstStage: IStatelessPipelineAsyncStage<T> | null = null;
	private lastStage: IStatelessPipelineAsyncStage<T> | null = null;

	addStage(
		stage: IStatelessPipelineAsyncStage<T>
	): StatelessPipelineAsync<T> {
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
