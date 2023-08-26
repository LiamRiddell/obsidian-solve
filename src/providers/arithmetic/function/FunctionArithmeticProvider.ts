import { BaseSolveProvider } from "@/providers/BaseSolveProvider";
import UserSettings from "@/settings/UserSettings";
import grammar, {
	FunctionArithmeticSemantics,
} from "./FunctionArithmetic.ohm-bundle";

export class FunctionArithmeticProvider extends BaseSolveProvider {
	name: string = "FunctionArithmeticProvider";

	private semantics: FunctionArithmeticSemantics;
	private outputHex: boolean = false;

	constructor() {
		super();

		this.semantics = grammar.FunctionArithmetic.createSemantics();

		const enableHexOutput = () => (this.outputHex = true);

		const degToRad = (degrees: number) => degrees * (Math.PI / 180);
		const radToDeg = (radians: number) => radians / (Math.PI / 180);

		this.semantics.addOperation<number>("eval()", {
			LogicalShift_left(x, _, y) {
				return x.eval() << y.eval();
			},
			LogicalShift_right(x, _, y) {
				return x.eval() >> y.eval();
			},
			AS_addition(x, _, y) {
				return x.eval() + y.eval();
			},
			AS_subtraction(x, _, y) {
				return x.eval() - y.eval();
			},
			MD_multiplication(x, _, y) {
				return x.eval() * y.eval();
			},
			MD_division(x, _, y) {
				return x.eval() / y.eval();
			},
			E_exponent(x, _, y) {
				return Math.pow(x.eval(), y.eval());
			},
			P_parenthesis(_l, e, _r) {
				return e.eval();
			},
			Function_function(functionName, _l, e, _r) {
				const functionNameLower =
					functionName.sourceString.toLowerCase();

				const argumentsArray = e
					.asIteration()
					.children.map((c) => c.eval());

				const mathFunc = (Math as any)[functionNameLower];

				switch (functionNameLower) {
					case "degtorad":
						// @ts-expect-error
						return degToRad(...argumentsArray);

					case "radtodeg":
						// @ts-expect-error
						return radToDeg(...argumentsArray);

					default:
						return mathFunc ? mathFunc(...argumentsArray) : 0;
				}
			},
			Primitive_positive(_, e) {
				return e.eval();
			},
			Primitive_negative(_, e) {
				return -e.eval();
			},
			constant(_) {
				switch (this.sourceString.toLowerCase()) {
					case "pi":
						return Math.PI;
					case "e":
						return Math.E;
					default:
						return 0;
				}
			},
			hex(_, x) {
				enableHexOutput();

				const hexString = this.sourceString
					.replace("h", "")
					.replace("0x", "");

				return parseInt(hexString, 16);
			},
			number(_) {
				return parseFloat(this.sourceString);
			},
		});
	}

	provide(sentence: string, raw: boolean = true): string | undefined {
		try {
			const userSettings = UserSettings.getInstance();

			this.outputHex = false;

			const matchResult = grammar.FunctionArithmetic.match(sentence);

			if (matchResult.failed()) {
				return undefined;
			}

			const result = this.semantics(matchResult).eval();

			if (this.outputHex) {
				return `0x${result.toString(16).toUpperCase()}`;
			}

			const output = result.toPrecision(userSettings.decimalPoints);

			if (raw) {
				return output;
			}

			if (userSettings.renderResultEndOfLine) {
				return `= ${output}`;
			}

			return output;
		} catch (e) {
			return undefined;
		}
	}
}
