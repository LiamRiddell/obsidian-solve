import grammar, {
	BasicArithmeticSemantics,
} from "@/grammars/arithmetic/BasicArithmetic.ohm-bundle";
import { SemanticProviderBase } from "@/providers/SemanticProviderBase";
import { basicArithmeticSemanticActions } from "@/providers/arithmetic/ArithmeticSemantics";
import { FloatResult } from "@/results/FloatResult";
import { HexResult } from "@/results/HexResult";
import { IntegerResult } from "@/results/IntegerResult";
import { logger } from "@/utilities/Logger";

export class BasicArithmeticProvider extends SemanticProviderBase<BasicArithmeticSemantics> {
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
			logger.error(e);
			return undefined;
		}
	}
}
