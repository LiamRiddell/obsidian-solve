import { UndefinedContextInPipelineError } from "@/errors/UndefinedContextInPipelineError";
import { BaseContextPipelineStage } from "@/pipelines/definition/stages/BaseContextPipelineStage";
import { IProvider } from "@/providers/IProvider";
import { AnyResult } from "@/results/AnyResult";
import { IResult } from "@/results/definition/IResult";
import { FormatVisitor } from "@/visitors/format/FormatVisitor";

export class FormatResultStage extends BaseContextPipelineStage<
	[IProvider, AnyResult],
	string
> {
	private formatVisitor: FormatVisitor;

	constructor() {
		super();
		this.formatVisitor = new FormatVisitor();
	}

	protected execute(context: [IProvider, AnyResult], request: string) {
		const [, result] = context;

		if (result === undefined) {
			throw new UndefinedContextInPipelineError();
		}

		request = this.formatVisitor.visit(result as IResult<any>);

		return request;
	}
}

export const SharedFormatResultStage = new FormatResultStage();
