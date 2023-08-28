import grammar, {
	FunctionArithmeticSemantics,
} from "@/grammars/function/FunctionArithmetic.ohm-bundle";
import { SemanticProviderBase } from "@/providers/SemanticProviderBase";
import { basicArithmeticSemanticActions } from "@/providers/arithmetic/ArithmeticSemantics";
import { FloatResult } from "@/results/FloatResult";
import { HexResult } from "@/results/HexResult";
import { IntegerResult } from "@/results/IntegerResult";
import { logger } from "@/utilities/Logger";

export class FunctionArithmeticProvider extends SemanticProviderBase<FunctionArithmeticSemantics> {
	constructor() {
		super("FunctionArithmeticProvider");

		this.semantics = grammar.FunctionArithmetic.createSemantics();

		const degToRad = (degrees: number) => degrees * (Math.PI / 180);
		const radToDeg = (radians: number) => radians / (Math.PI / 180);

		this.semantics.addOperation<FloatResult | IntegerResult | HexResult>(
			"visit()",
			{
				...basicArithmeticSemanticActions,
				Function_function(functionName, _l, e, _r) {
					const functionNameLower =
						functionName.sourceString.toLowerCase();

					const argumentsArray = e
						.asIteration()
						.children.map((c) => c.visit().value);

					const mathFunc = (Math as any)[functionNameLower];

					switch (functionNameLower) {
						case "degtorad":
							// @ts-expect-error
							return new FloatResult(degToRad(...argumentsArray));

						case "radtodeg":
							// @ts-expect-error
							return new FloatResult(radToDeg(...argumentsArray));

						default:
							return new FloatResult(
								mathFunc ? mathFunc(...argumentsArray) : 0
							);
					}
				},
			}
		);
	}

	provide(sentence: string, raw: boolean = true): string | undefined {
		try {
			const matchResult = grammar.FunctionArithmetic.match(sentence);

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
