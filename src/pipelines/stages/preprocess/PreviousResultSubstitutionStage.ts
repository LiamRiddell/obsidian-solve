import { BasePipelineStage } from "@/pipelines/definition/stages/BaseSimplePipelineStage";
import { IResult } from "@/results/definition/IResult";
import { ResultSubstitutionFormatVisitor } from "@/visitors/format/VariableSubstitutionFormatVisitor";

// Important: Since this stage is stateful it can not be used in a shared context.
export class PreviousResultSubstitutionStage extends BasePipelineStage<string> {
	private previousResultSubstitutionRegex = new RegExp(/\$prev/gi);
	private resultSubstitutionVisitor: ResultSubstitutionFormatVisitor;
	private previousResult: IResult<any>;

	constructor() {
		super();
		this.resultSubstitutionVisitor = new ResultSubstitutionFormatVisitor();
	}

	protected execute(request: string): string {
		// If there is no previouds result then return the original request.
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
