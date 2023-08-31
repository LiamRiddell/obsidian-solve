import grammar, {
	PercentageArithmeticSemantics,
} from "@/grammars/percentage/PercentageArithmetic.ohm-bundle";
import { SemanticProviderBase } from "@/providers/SemanticProviderBase";
import { basicArithmeticSemanticActions } from "@/providers/arithmetic/ArithmeticSemantics";
import { FloatResult } from "@/results/FloatResult";
import { HexResult } from "@/results/HexResult";
import { IntegerResult } from "@/results/IntegerResult";
import { PercentageResult } from "@/results/PercentageResult";
import { logger } from "@/utilities/Logger";
import { DecreaseByVisitor } from "@/visitors/percentage/DecreaseByVisitor";
import { IncreaseByVisitor } from "@/visitors/percentage/IncreaseByVisitor";
import { PercentageIncreaseOrDecreaseVisitor } from "@/visitors/percentage/PercentageIncreaseOrDecreaseVisitor";
import { PercentageOfVisitor } from "@/visitors/percentage/PercentageOfVisitor";

export class PercentageArithmeticProvider extends SemanticProviderBase<PercentageArithmeticSemantics> {
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
				return result.value;
			}

			return result.accept(this.formatVisitor);
		} catch (e) {
			logger.error(e);
			return undefined;
		}
	}
}
