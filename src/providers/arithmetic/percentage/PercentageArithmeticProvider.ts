import { BaseSolveProvider } from "@/providers/BaseSolveProvider";
import { basicArithmeticSemanticActions } from "@/providers/arithmetic/basic/ArithmeticSemantics";
import grammar, {
	PercentageArithmeticSemantics,
} from "@/providers/arithmetic/percentage/PercentageArithmetic.ohm-bundle";
import { DecreaseByVisitor } from "@/visitors/DecreaseByVisitor";
import { IncreaseByVisitor } from "@/visitors/IncreaseByVisitor";
import { PercentageIncreaseOrDecreaseVisitor } from "@/visitors/PercentageIncreaseOrDecreaseVisitor";
import { PercentageOfVisitor } from "@/visitors/PercentageOfVisitor";
import { FloatResult } from "@/visitors/results/FloatResult";
import { HexResult } from "@/visitors/results/HexResult";
import { IntegerResult } from "@/visitors/results/IntegerResult";
import { PercentageResult } from "@/visitors/results/PercentageResult";

export class PercentageArithmeticProvider extends BaseSolveProvider<PercentageArithmeticSemantics> {
	constructor() {
		super("PercentageArithmeticProvider");

		this.semantics = grammar.PercentageArithmetic.createSemantics();

		this.semantics.addOperation<
			FloatResult | IntegerResult | HexResult | PercentageResult
		>("visit()", {
			...basicArithmeticSemanticActions,
			PercentageOf(percentNode, _, of, populationNode) {
				const percent = percentNode.visit();
				const population = populationNode.visit();

				return percent.accept(
					new PercentageOfVisitor(percent, population)
				);
			},
			IncreaseBy(_, valueNode, _1, percentageNode, _2) {
				const value = valueNode.visit();
				const percentage = percentageNode.visit();

				return value.accept(new IncreaseByVisitor(value, percentage));
			},
			DecreaseBy(_, valueNode, _1, percentageNode, _2) {
				const value = valueNode.visit();
				const percentage = percentageNode.visit();

				return value.accept(new DecreaseByVisitor(value, percentage));
			},
			PercentageIncreaseOrDecrease(_, thenNode, _1, nowNode) {
				const then = thenNode.visit();
				const now = nowNode.visit();

				return then.accept(
					new PercentageIncreaseOrDecreaseVisitor(then, now)
				);
			},
			percentage(numberNode, _) {
				return new PercentageResult(
					parseFloat(numberNode.sourceString)
				);
			},
		});
	}

	provide(sentence: string, raw: boolean = true): string | undefined {
		try {
			const matchResult = grammar.PercentageArithmetic.match(sentence);

			if (matchResult.failed()) {
				return undefined;
			}

			const result = this.semantics(matchResult).visit();

			if (raw) {
				return result;
			}

			return result.accept(this.formatVisitor);
		} catch (e) {
			// console.error(e);
			return undefined;
		}
	}
}
