import { BaseStatefulPipelineStage } from "@/pipelines/definition/stages/BaseStatefulPipelineStage";
import { IExpressionProcessorState } from "@/pipelines/stages/result/state/IExpressionProcessorState";
import { solveProviderManager } from "@/providers/ProviderManager";
import { IResult } from "@/results/definition/IResult";
import { ResultSubstitutionFormatVisitor } from "@/visitors/format/VariableSubstitutionFormatVisitor";

// Important: Since this stage is stateful it can not be used in a shared context.
export class VariableProcessingStage extends BaseStatefulPipelineStage<
	IExpressionProcessorState,
	string
> {
	private variableAssignmentRegex = new RegExp(/^(:\w+)\s+=/);
	private variableSubstitutionRegex = new RegExp(/(:\w+)/g);
	private resultSubstitutionVisitor = new ResultSubstitutionFormatVisitor();

	private variableMap = new Map<string, IResult<any>>();

	protected execute(
		state: IExpressionProcessorState,
		request: string
	): string {
		// Check for variable assignment
		const assignmentMatch = request.match(this.variableAssignmentRegex);

		if (assignmentMatch) {
			const variableName = assignmentMatch[1];
			request = this.assignVariable(variableName, request);
		} else {
			// Perform variable substitution
			request = this.substituteVariables(request);
		}

		return request;
	}

	private assignVariable(variableName: string, expression: string): string {
		// Locate the index of = in the variable assignment e.g :someVar (=) expression
		const assignmentPosition = expression.indexOf("=");

		if (assignmentPosition === -1) {
			return expression;
		}

		// Get the solvable expression after the =
		const assignmentExpression = expression.substring(
			assignmentPosition + 1
		);

		// We need to run substitute variable here to make sure we replace any variables that are in the expression for the assignment
		// e.g. :myVar = :someOtherVar + 20 / 2
		const assignmentExpressionSubstituted =
			this.substituteVariables(assignmentExpression);

		// Update the original expression with the substituted variables
		expression = expression.replace(
			assignmentExpression,
			assignmentExpressionSubstituted
		);

		// Solve the substituted expression
		const solveResultTuple = solveProviderManager.provideFirst(
			assignmentExpressionSubstituted
		);

		// If failed to solve then return the substituted expression.
		if (solveResultTuple === undefined) {
			return expression;
		}

		const [, result] = solveResultTuple;

		// Save the mapping to the variable name to result map table
		this.variableMap.set(variableName, result);

		// Always return the substituted expression so that we can solve
		return expression;
	}

	private substituteVariables(expression: string): string {
		return expression.replace(this.variableSubstitutionRegex, (match) => {
			const variableResult = this.variableMap.get(match);

			if (typeof variableResult === "undefined") {
				return match;
			}

			return this.resultSubstitutionVisitor.visit(variableResult);
		});
	}

	public reset() {
		this.variableMap.clear();
	}
}
