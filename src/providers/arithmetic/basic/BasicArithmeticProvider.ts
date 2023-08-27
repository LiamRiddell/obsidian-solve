import { BaseSolveProvider } from "@/providers/BaseSolveProvider";
import { basicArithmeticSemanticActions } from "@/providers/arithmetic/basic/ArithmeticSemantics";
import { FloatResult } from "@/visitors/results/FloatResult";
import { HexResult } from "@/visitors/results/HexResult";
import { IntegerResult } from "@/visitors/results/IntegerResult";
import grammar, {
	BasicArithmeticSemantics,
} from "./BasicArithmetic.ohm-bundle";

export class BasicArithmeticProvider extends BaseSolveProvider<BasicArithmeticSemantics> {
	constructor() {
		super("BasicArithmeticProvider");

		this.semantics = grammar.createSemantics();

		this.semantics.addOperation<FloatResult | IntegerResult | HexResult>(
			"visit()",
			basicArithmeticSemanticActions
		);
	}

	provide(sentence: string, raw: boolean = true): string | undefined {
		try {
			const matchResult = grammar.match(sentence);

			if (matchResult.failed()) {
				return undefined;
			}

			const result = this.semantics(matchResult).visit();

			if (raw) {
				return result.value;
			}

			return result.accept(this.formatVisitor);
		} catch (e) {
			// console.error(e);
			return undefined;
		}
	}
}
