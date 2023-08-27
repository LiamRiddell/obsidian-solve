import { BaseSolveProvider } from "@/providers/BaseSolveProvider";
import { Vector2 } from "@/providers/arithmetic/vector/Vector2";
import vector2Grammar, {
	Vector2ArithmeticSemantics,
} from "@/providers/arithmetic/vector/Vector2Arithmetic.ohm-bundle";
import { Vector3 } from "@/providers/arithmetic/vector/Vector3";
import vector3Grammar, {
	Vector3ArithmeticSemantics,
} from "@/providers/arithmetic/vector/Vector3Arithmetic.ohm-bundle";
import { Vector4 } from "@/providers/arithmetic/vector/Vector4";
import vector4Grammar, {
	Vector4ArithmeticSemantics,
} from "@/providers/arithmetic/vector/Vector4Arithmetic.ohm-bundle";
import UserSettings from "@/settings/UserSettings";
export class VectorArithmeticProvider extends BaseSolveProvider<null> {
	private vector2Semantics: Vector2ArithmeticSemantics;
	private vector3Semantics: Vector3ArithmeticSemantics;
	private vector4Semantics: Vector4ArithmeticSemantics;

	constructor() {
		super("VectorArithmeticProvider");

		this.setupVector2Arithmetic();
		this.setupVector3Arithmetic();
		this.setupVector4Arithmetic();
	}

	private setupVector2Arithmetic() {
		this.vector2Semantics =
			vector2Grammar.Vector2Arithmetic.createSemantics();

		this.vector2Semantics.addOperation<Vector2 | number>("eval()", {
			AS_addition(x, _, y) {
				const eX = x.eval();
				const eY = y.eval();

				if (typeof eX === "number" && typeof eY === "number") {
					return eX + eY;
				}

				if (eX instanceof Vector2 && eY instanceof Vector2) {
					return eX.addition(eY);
				}

				if (eX instanceof Vector2) {
					return eX.addition(eY);
				}

				if (eY instanceof Vector2) {
					return eY.addition(eX);
				}

				throw new TypeError(
					`Expected Type: Vector2 or number instead of ${typeof eX}, ${typeof eY}`
				);
			},
			AS_subtraction(x, _, y) {
				const eX = x.eval();
				const eY = y.eval();

				if (typeof eX === "number" && typeof eY === "number") {
					return eX - eY;
				}

				if (eX instanceof Vector2 && eY instanceof Vector2) {
					return eX.subtraction(eY);
				}

				if (eX instanceof Vector2) {
					return eX.subtraction(eY);
				}

				if (eY instanceof Vector2) {
					return eY.subtraction(eX);
				}

				throw new TypeError(
					`Expected Type: Vector2 or number instead of ${typeof eX}, ${typeof eY}`
				);
			},
			MD_multiplication(x, _, y) {
				const eX = x.eval();
				const eY = y.eval();

				if (typeof eX === "number" && typeof eY === "number") {
					return eX * eY;
				}

				if (eX instanceof Vector2 && eY instanceof Vector2) {
					return eX.multiplication(eY);
				}

				if (eX instanceof Vector2) {
					return eX.multiplication(eY);
				}

				if (eY instanceof Vector2) {
					return eY.multiplication(eX);
				}

				throw new TypeError(
					`Expected Type: Vector2 or number instead of ${typeof eX}, ${typeof eY}`
				);
			},
			MD_division(x, _, y) {
				const eX = x.eval();
				const eY = y.eval();

				if (typeof eX === "number" && typeof eY === "number") {
					return eX / eY;
				}

				if (eX instanceof Vector2 && eY instanceof Vector2) {
					return eX.division(eY);
				}

				if (eX instanceof Vector2) {
					return eX.division(eY);
				}

				if (eY instanceof Vector2) {
					return eY.division(eX);
				}

				throw new TypeError(
					`Expected Type: Vector2 or number instead of ${typeof eX}, ${typeof eY}`
				);
			},
			E_exponent(x, _, y) {
				const eX = x.eval();
				const eY = y.eval();

				if (typeof eX === "number" && typeof eY === "number") {
					return Math.pow(eX, eY);
				}

				if (eX instanceof Vector2 && eY instanceof Vector2) {
					return eX.exponent(eY);
				}

				if (eX instanceof Vector2) {
					return eX.exponent(eY);
				}

				if (eY instanceof Vector2) {
					return eY.exponent(eX);
				}

				throw new TypeError(
					`Expected Type: Vector2 or number instead of ${typeof eX}, ${typeof eY}`
				);
			},
			P_parenthesis(_l, e, _r) {
				return e.eval();
			},
			Vector2_parse(_1, _2, x, _3, y, _4) {
				const eX = x.eval();
				const eY = y.eval();

				if (eX instanceof Vector2 || eY instanceof Vector2) {
					throw new TypeError("Expected: Number");
				}

				return new Vector2(eX, eY);
			},
			LengthSq_function(_f, _l, v, _r) {
				return Vector2.magnitudeSqrt(v.eval());
			},
			DistanceSq_function(_f, _l, v1, _1, v2, _r) {
				return Vector2.distanceSq(v1.eval(), v2.eval());
			},
			Length_function(_f, _l, v, _r) {
				return Vector2.magnitude(v.eval());
			},
			Distance_function(_f, _l, v1, _1, v2, _r) {
				return Vector2.distance(v1.eval(), v2.eval());
			},
			Normalise_function(_f, _l, v, _r) {
				return Vector2.normalise(v.eval());
			},
			Dot_function(_f, _l, v1, _1, v2, _r) {
				return Vector2.dot(v1.eval(), v2.eval());
			},
			AngleBetween_function(_f, _l, v1, _1, v2, _r) {
				return Vector2.angleBetween(v1.eval(), v2.eval());
			},
			Cross_function(_f, _l, v1, _1, v2, _r) {
				return Vector2.cross(v1.eval(), v2.eval());
			},
			Lerp_function(_f, _l, v1, _1, v2, _2, t, _r) {
				return Vector2.lerp(v1.eval(), v2.eval(), t.eval());
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

	private setupVector3Arithmetic() {
		this.vector3Semantics =
			vector3Grammar.Vector3Arithmetic.createSemantics();

		this.vector3Semantics.addOperation<Vector3 | number>("eval()", {
			AS_addition(x, _, y) {
				const eX = x.eval();
				const eY = y.eval();

				if (typeof eX === "number" && typeof eY === "number") {
					return eX + eY;
				}

				if (eX instanceof Vector3 && eY instanceof Vector3) {
					return eX.addition(eY);
				}

				if (eX instanceof Vector3) {
					return eX.addition(eY);
				}

				if (eY instanceof Vector3) {
					return eY.addition(eX);
				}

				throw new TypeError(
					`Expected Type: Vector3 or number instead of ${typeof eX}, ${typeof eY}`
				);
			},
			AS_subtraction(x, _, y) {
				const eX = x.eval();
				const eY = y.eval();

				if (typeof eX === "number" && typeof eY === "number") {
					return eX - eY;
				}

				if (eX instanceof Vector3 && eY instanceof Vector3) {
					return eX.subtraction(eY);
				}

				if (eX instanceof Vector3) {
					return eX.subtraction(eY);
				}

				if (eY instanceof Vector3) {
					return eY.subtraction(eX);
				}

				throw new TypeError(
					`Expected Type: Vector3 or number instead of ${typeof eX}, ${typeof eY}`
				);
			},
			MD_multiplication(x, _, y) {
				const eX = x.eval();
				const eY = y.eval();

				if (typeof eX === "number" && typeof eY === "number") {
					return eX * eY;
				}

				if (eX instanceof Vector3 && eY instanceof Vector3) {
					return eX.multiplication(eY);
				}

				if (eX instanceof Vector3) {
					return eX.multiplication(eY);
				}

				if (eY instanceof Vector3) {
					return eY.multiplication(eX);
				}

				throw new TypeError(
					`Expected Type: Vector3 or number instead of ${typeof eX}, ${typeof eY}`
				);
			},
			MD_division(x, _, y) {
				const eX = x.eval();
				const eY = y.eval();

				if (typeof eX === "number" && typeof eY === "number") {
					return eX / eY;
				}

				if (eX instanceof Vector3 && eY instanceof Vector3) {
					return eX.division(eY);
				}

				if (eX instanceof Vector3) {
					return eX.division(eY);
				}

				if (eY instanceof Vector3) {
					return eY.division(eX);
				}

				throw new TypeError(
					`Expected Type: Vector3 or number instead of ${typeof eX}, ${typeof eY}`
				);
			},
			E_exponent(x, _, y) {
				const eX = x.eval();
				const eY = y.eval();

				if (typeof eX === "number" && typeof eY === "number") {
					return Math.pow(eX, eY);
				}

				if (eX instanceof Vector3 && eY instanceof Vector3) {
					return eX.exponent(eY);
				}

				if (eX instanceof Vector3) {
					return eX.exponent(eY);
				}

				if (eY instanceof Vector3) {
					return eY.exponent(eX);
				}

				throw new TypeError(
					`Expected Type: Vector3 or number instead of ${typeof eX}, ${typeof eY}`
				);
			},
			P_parenthesis(_l, e, _r) {
				return e.eval();
			},
			Vector3_parse(_1, _2, x, _3, y, _4, z, _5) {
				const eX = x.eval();
				const eY = y.eval();
				const eZ = z.eval();

				if (eX instanceof Vector3 || eY instanceof Vector3) {
					throw new TypeError("Expected: Number");
				}

				return new Vector3(eX, eY, eZ);
			},
			LengthSq_function(_f, _l, v, _r) {
				return Vector3.magnitudeSqrt(v.eval());
			},
			DistanceSq_function(_f, _l, v1, _1, v2, _r) {
				return Vector3.distanceSq(v1.eval(), v2.eval());
			},
			Length_function(_f, _l, v, _r) {
				return Vector3.magnitude(v.eval());
			},
			Distance_function(_f, _l, v1, _1, v2, _r) {
				return Vector3.distance(v1.eval(), v2.eval());
			},
			Normalise_function(_f, _l, v, _r) {
				return Vector3.normalise(v.eval());
			},
			Dot_function(_f, _l, v1, _1, v2, _r) {
				return Vector3.dot(v1.eval(), v2.eval());
			},
			AngleBetween_function(_f, _l, v1, _1, v2, _r) {
				return Vector3.angleBetween(v1.eval(), v2.eval());
			},
			Cross_function(_f, _l, v1, _1, v2, _r) {
				return Vector3.cross(v1.eval(), v2.eval());
			},
			Lerp_function(_f, _l, v1, _1, v2, _2, t, _r) {
				return Vector3.lerp(v1.eval(), v2.eval(), t.eval());
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

	private setupVector4Arithmetic() {
		this.vector4Semantics =
			vector4Grammar.Vector4Arithmetic.createSemantics();

		this.vector4Semantics.addOperation<Vector4 | number>("eval()", {
			AS_addition(x, _, y) {
				const eX = x.eval();
				const eY = y.eval();

				if (typeof eX === "number" && typeof eY === "number") {
					return eX + eY;
				}

				if (eX instanceof Vector4 && eY instanceof Vector4) {
					return eX.addition(eY);
				}

				if (eX instanceof Vector4) {
					return eX.addition(eY);
				}

				if (eY instanceof Vector4) {
					return eY.addition(eX);
				}

				throw new TypeError(
					`Expected Type: Vector4 or number instead of ${typeof eX}, ${typeof eY}`
				);
			},
			AS_subtraction(x, _, y) {
				const eX = x.eval();
				const eY = y.eval();

				if (typeof eX === "number" && typeof eY === "number") {
					return eX - eY;
				}

				if (eX instanceof Vector4 && eY instanceof Vector4) {
					return eX.subtraction(eY);
				}

				if (eX instanceof Vector4) {
					return eX.subtraction(eY);
				}

				if (eY instanceof Vector4) {
					return eY.subtraction(eX);
				}

				throw new TypeError(
					`Expected Type: Vector4 or number instead of ${typeof eX}, ${typeof eY}`
				);
			},
			MD_multiplication(x, _, y) {
				const eX = x.eval();
				const eY = y.eval();

				if (typeof eX === "number" && typeof eY === "number") {
					return eX * eY;
				}

				if (eX instanceof Vector4 && eY instanceof Vector4) {
					return eX.multiplication(eY);
				}

				if (eX instanceof Vector4) {
					return eX.multiplication(eY);
				}

				if (eY instanceof Vector4) {
					return eY.multiplication(eX);
				}

				throw new TypeError(
					`Expected Type: Vector4 or number instead of ${typeof eX}, ${typeof eY}`
				);
			},
			MD_division(x, _, y) {
				const eX = x.eval();
				const eY = y.eval();

				if (typeof eX === "number" && typeof eY === "number") {
					return eX / eY;
				}

				if (eX instanceof Vector4 && eY instanceof Vector4) {
					return eX.division(eY);
				}

				if (eX instanceof Vector4) {
					return eX.division(eY);
				}

				if (eY instanceof Vector4) {
					return eY.division(eX);
				}

				throw new TypeError(
					`Expected Type: Vector4 or number instead of ${typeof eX}, ${typeof eY}`
				);
			},
			E_exponent(x, _, y) {
				const eX = x.eval();
				const eY = y.eval();

				if (typeof eX === "number" && typeof eY === "number") {
					return Math.pow(eX, eY);
				}

				if (eX instanceof Vector4 && eY instanceof Vector4) {
					return eX.exponent(eY);
				}

				if (eX instanceof Vector4) {
					return eX.exponent(eY);
				}

				if (eY instanceof Vector4) {
					return eY.exponent(eX);
				}

				throw new TypeError(
					`Expected Type: Vector4 or number instead of ${typeof eX}, ${typeof eY}`
				);
			},
			P_parenthesis(_l, e, _r) {
				return e.eval();
			},
			Vector4_parse(_1, _2, x, _3, y, _4, z, _5, w, _6) {
				const eX = x.eval();
				const eY = y.eval();
				const eZ = z.eval();
				const eW = w.eval();

				if (eX instanceof Vector4 || eY instanceof Vector4) {
					throw new TypeError("Expected: Number");
				}

				return new Vector4(eX, eY, eZ, eW);
			},
			LengthSq_function(_f, _l, v, _r) {
				return Vector4.magnitudeSqrt(v.eval());
			},
			DistanceSq_function(_f, _l, v1, _1, v2, _r) {
				return Vector4.distanceSq(v1.eval(), v2.eval());
			},
			Length_function(_f, _l, v, _r) {
				return Vector4.magnitude(v.eval());
			},
			Distance_function(_f, _l, v1, _1, v2, _r) {
				return Vector4.distance(v1.eval(), v2.eval());
			},
			Normalise_function(_f, _l, v, _r) {
				return Vector4.normalise(v.eval());
			},
			Dot_function(_f, _l, v1, _1, v2, _r) {
				return Vector4.dot(v1.eval(), v2.eval());
			},
			AngleBetween_function(_f, _l, v1, _1, v2, _r) {
				return Vector4.angleBetween(v1.eval(), v2.eval());
			},
			Lerp_function(_f, _l, v1, _1, v2, _2, t, _r) {
				return Vector4.lerp(v1.eval(), v2.eval(), t.eval());
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

	private tryParseVectorArithmetic(sentence: string) {
		const vector4Match = vector4Grammar.Vector4Arithmetic.match(sentence);

		if (vector4Match.succeeded()) {
			return this.vector4Semantics(vector4Match).eval();
		}

		const vector3Match = vector3Grammar.Vector3Arithmetic.match(sentence);

		if (vector3Match.succeeded()) {
			return this.vector3Semantics(vector3Match).eval();
		}

		const vector2Match = vector2Grammar.Vector2Arithmetic.match(sentence);

		if (vector2Match.succeeded()) {
			return this.vector2Semantics(vector2Match).eval();
		}

		return undefined;
	}

	provide(sentence: string, raw: boolean = true): string | undefined {
		try {
			const userSettings = UserSettings.getInstance();

			const result = this.tryParseVectorArithmetic(sentence);

			if (!result) return undefined;

			if (
				result instanceof Vector2 ||
				result instanceof Vector3 ||
				result instanceof Vector4
			) {
				const output = result.toString(userSettings.decimalPoints);

				if (raw) {
					return output;
				}

				return output;
			}

			if (Number.isNaN(result)) return undefined;

			return result.toPrecision(userSettings.decimalPoints);
		} catch (e) {
			// console.error(e);
			return undefined;
		}
	}
}
