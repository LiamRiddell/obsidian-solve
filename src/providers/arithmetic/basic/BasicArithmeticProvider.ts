import { BaseSolveProvider } from "@/providers/BaseSolveProvider";
import grammar, {
	BasicArithmeticSemantics,
} from "./BasicArithmetic.ohm-bundle";

export class BasicArithmeticProvider extends BaseSolveProvider {
	name: string = "BasicArithmeticProvider";

	private semantics: BasicArithmeticSemantics;
	private outputHex: boolean = false;

	constructor() {
		super();

		this.semantics = grammar.createSemantics();

		const enableHexOutput = () => (this.outputHex = true);

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
			MD_modulo(x, _, y) {
				return x.eval() % y.eval();
			},
			E_exponent(x, _, y) {
				return Math.pow(x.eval(), y.eval());
			},
			P_parenthesis(_l, e, _r) {
				return e.eval();
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
			this.outputHex = false;

			const matchResult = grammar.match(sentence);

			if (matchResult.failed()) {
				return undefined;
			}

			const result = this.semantics(matchResult).eval();

			if (this.outputHex) {
				const rounded = Math.floor(result).toString(16).toUpperCase();

				return this.settings?.arithmeticSettings
					.renderEqualsBeforeResult && !raw
					? `= 0x${rounded}`
					: `0x${rounded}`;
			}

			const output = result.toPrecision(
				this.settings?.arithmeticSettings.decimalPoints || 4
			);

			if (raw) {
				return output;
			}

			if (
				this.settings?.arithmeticSettings.renderEqualsBeforeResult &&
				!raw
			) {
				return `= ${output}`;
			}

			return output;
		} catch (e) {
			return undefined;
		}
	}
}
