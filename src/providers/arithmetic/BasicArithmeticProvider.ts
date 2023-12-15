import grammar, {
	BasicArithmeticSemantics,
} from "@/grammars/arithmetic/BasicArithmetic.ohm-bundle";
import { SemanticProviderBase } from "@/providers/SemanticProviderBase";
import { basicArithmeticSemanticActions } from "@/providers/arithmetic/ArithmeticSemantics";
import { HexResult } from "@/results/HexResult";
import { NumberResult } from "@/results/NumberResult";
import UserSettings from "@/settings/UserSettings";
import { logger } from "@/utilities/Logger";
import { BASIC_ARITHMETIC_PROVIDER } from "@/utilities/constants/providers/Names";

export class BasicArithmeticProvider extends SemanticProviderBase<BasicArithmeticSemantics> {
	constructor() {
		super(BASIC_ARITHMETIC_PROVIDER);

		this.semantics = grammar.createSemantics();

		this.semantics.addOperation("visit()", basicArithmeticSemanticActions);
	}

	enabled() {
		return UserSettings.getInstance().arithmeticProvider.enabled;
	}

	provide<T = NumberResult | HexResult>(expression: string): T | undefined {
		try {
			const matchResult = grammar.match(expression);

			if (matchResult.failed()) {
				return undefined;
			}

			return this.semantics(matchResult).visit();
		} catch (e) {
			logger.error(e);
			return undefined;
		}
	}
}
