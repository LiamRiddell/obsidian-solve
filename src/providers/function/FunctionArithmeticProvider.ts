import grammar, {
	FunctionArithmeticSemantics,
} from "@/grammars/function/FunctionArithmetic.ohm-bundle";
import { SemanticProviderBase } from "@/providers/SemanticProviderBase";
import { basicArithmeticSemanticActions } from "@/providers/arithmetic/ArithmeticSemantics";
import { HexResult } from "@/results/HexResult";
import { NumberResult } from "@/results/NumberResult";
import { logger } from "@/utilities/Logger";

export class FunctionArithmeticProvider extends SemanticProviderBase<FunctionArithmeticSemantics> {
	constructor() {
		super("FunctionArithmeticProvider");

		this.semantics = grammar.FunctionArithmetic.createSemantics();

		const degToRad = (degrees: number) => degrees * (Math.PI / 180);
		const radToDeg = (radians: number) => radians / (Math.PI / 180);

		this.semantics.addOperation<NumberResult | HexResult>("visit()", {
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
						return new NumberResult(
							// @ts-expect-error
							degToRad(...argumentsArray)
						);

					case "radtodeg":
						return new NumberResult(
							// @ts-expect-error
							radToDeg(...argumentsArray)
						);

					default:
						return new NumberResult(
							mathFunc ? mathFunc(...argumentsArray) : 0
						);
				}
			},
		});
	}

	provide<T = string>(sentence: string, raw: boolean = true): T | undefined {
		try {
			const matchResult = grammar.FunctionArithmetic.match(sentence);

			if (matchResult.failed()) {
				return undefined;
			}

			const result = this.semantics(matchResult).visit();

			if (raw) {
				return result;
			}

			return result.accept(this.formatVisitor);
		} catch (e) {
			logger.error(e);
			return undefined;
		}
	}
}
