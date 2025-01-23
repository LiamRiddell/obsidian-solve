import { BaseStatefulPipelineStage } from "@/pipelines/definition/stages/BaseStatefulPipelineStage";
import { IExpressionProcessorState } from "@/pipelines/stages/expression/state/IExpressionProcessorState";
import { IResult } from "@/results/definition/IResult";
import { ResultSubstitutionFormatVisitor } from "@/visitors/format/VariableSubstitutionFormatVisitor";

// Important: Since this stage is stateful it can not be used in a shared context.
export class PreviousResultSubstitutionStage extends BaseStatefulPipelineStage<
	IExpressionProcessorState,
	string
> {
	private previousResultSubstitutionRegex = new RegExp(/:prev/gi);
	private resultSubstitutionVisitor: ResultSubstitutionFormatVisitor;
	private previousResult: IResult<any>;

	constructor() {
		super();
		this.resultSubstitutionVisitor = new ResultSubstitutionFormatVisitor();
	}

	protected execute(
		state: IExpressionProcessorState,
		request: string
	): string {
		// If there is no previous result then return the original request.
		if (this.previousResult === undefined) {
			return request;
		}

		// Substitute previous solve into the expression
		request = request.replace(
			this.previousResultSubstitutionRegex,
			this.resultSubstitutionVisitor.visit(this.previousResult)
		);

		return request;
	}

	public setPreviousResult(result: IResult<any>) {
		this.previousResult = result;
	}
}
