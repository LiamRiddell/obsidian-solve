import vector2Grammar, {
	Vector2ArithmeticSemantics,
} from "@/grammars/vector/Vector2Arithmetic.ohm-bundle";
import vector3Grammar, {
	Vector3ArithmeticSemantics,
} from "@/grammars/vector/Vector3Arithmetic.ohm-bundle";
import vector4Grammar, {
	Vector4ArithmeticSemantics,
} from "@/grammars/vector/Vector4Arithmetic.ohm-bundle";
import { ProviderBase } from "@/providers/ProviderBase";
import { basicArithmeticSemanticActions } from "@/providers/arithmetic/ArithmeticSemantics";
import { NumberResult } from "@/results/NumberResult";
import { Vector2Result } from "@/results/Vector2Result";
import { Vector3Result } from "@/results/Vector3Result";
import { Vector4Result } from "@/results/Vector4Result";
import UserSettings from "@/settings/UserSettings";
import { logger } from "@/utilities/Logger";
import { Vector2 } from "@/utilities/Vector2";
import { Vector3 } from "@/utilities/Vector3";
import { Vector4 } from "@/utilities/Vector4";
import { VECTOR_ARITHMETIC_PROVIDER } from "@/utilities/constants/providers/Names";
import { AdditionVisitor } from "@/visitors/arithmetic/AdditionVisitor";
import { DivisionVisitor } from "@/visitors/arithmetic/DivisionVisitor";
import { ExponentVisitor } from "@/visitors/arithmetic/ExponentVisitor";
import { MultiplicationVisitor } from "@/visitors/arithmetic/MultiplicationVisitor";
import { SubtractionVisitor } from "@/visitors/arithmetic/SubtractionVisitor";
import { VectorAdditionVisitor } from "@/visitors/vector/VectorAdditionVisitor";
import { VectorDivisionVisitor } from "@/visitors/vector/VectorDivisionVisitor";
import { VectorExponentVisitor } from "@/visitors/vector/VectorExponentVisitor";
import { VectorMultiplicationVisitor } from "@/visitors/vector/VectorMultiplicationVisitor";
import { VectorSubtractionVisitor } from "@/visitors/vector/VectorSubtractionVisitor";
export class VectorArithmeticProvider extends ProviderBase {
	private vector2Semantics: Vector2ArithmeticSemantics;
	private vector3Semantics: Vector3ArithmeticSemantics;
	private vector4Semantics: Vector4ArithmeticSemantics;

	constructor() {
		super(VECTOR_ARITHMETIC_PROVIDER);
		this.setupVector2Arithmetic();
		this.setupVector3Arithmetic();
		this.setupVector4Arithmetic();
	}

	private setupVector2Arithmetic() {
		this.vector2Semantics =
			vector2Grammar.Vector2Arithmetic.createSemantics();

		this.vector2Semantics.addOperation<Vector2Result | NumberResult>(
			"visit()",
			{
				...basicArithmeticSemanticActions,
				AS_addition(xNode, _, yNode) {
					const x = xNode.visit();
					const y = yNode.visit();

					if (
						x instanceof Vector2Result === false &&
						y instanceof Vector2Result === false
					) {
						return x.accept(new AdditionVisitor(y));
					}

					return x.accept(new VectorAdditionVisitor(y));
				},
				AS_subtraction(xNode, _, yNode) {
					const x = xNode.visit();
					const y = yNode.visit();

					if (
						x instanceof Vector2Result === false &&
						y instanceof Vector2Result === false
					) {
						return x.accept(new SubtractionVisitor(y));
					}

					return x.accept(new VectorSubtractionVisitor(y));
				},
				MD_multiplication(xNode, _, yNode) {
					const x = xNode.visit();
					const y = yNode.visit();

					if (
						x instanceof Vector2Result === false &&
						y instanceof Vector2Result === false
					) {
						return x.accept(new MultiplicationVisitor(y));
					}

					return x.accept(new VectorMultiplicationVisitor(y));
				},
				MD_division(xNode, _, yNode) {
					const x = xNode.visit();
					const y = yNode.visit();

					if (
						x instanceof Vector2Result === false &&
						y instanceof Vector2Result === false
					) {
						return x.accept(new DivisionVisitor(y));
					}

					return x.accept(new VectorDivisionVisitor(y));
				},
				E_exponent(xNode, _, yNode) {
					const x = xNode.visit();
					const y = yNode.visit();

					if (
						x instanceof Vector2Result === false &&
						y instanceof Vector2Result === false
					) {
						return x.accept(new ExponentVisitor(y));
					}

					return x.accept(new VectorExponentVisitor(y));
				},
				P_parenthesis(_l, e, _r) {
					return e.visit();
				},
				Vector2_parse(_1, _2, xNode, _3, yNode, _4) {
					const x = xNode.visit();
					const y = yNode.visit();

					if (
						x instanceof Vector2Result ||
						y instanceof Vector2Result
					) {
						throw new TypeError("Expected: Number");
					}

					return new Vector2Result({ x: x.value, y: y.value });
				},
				LengthSq_function(_f, _l, v, _r) {
					return new NumberResult(
						Vector2.magnitudeSqrt(v.visit()?.value)
					);
				},
				DistanceSq_function(_f, _l, v1, _1, v2, _r) {
					return new NumberResult(
						Vector2.distanceSq(v1.visit()?.value, v2.visit()?.value)
					);
				},
				Length_function(_f, _l, v, _r) {
					return new NumberResult(
						Vector2.magnitude(v.visit()?.value)
					);
				},
				Distance_function(_f, _l, v1, _1, v2, _r) {
					return new NumberResult(
						Vector2.distance(v1.visit()?.value, v2.visit()?.value)
					);
				},
				Normalise_function(_f, _l, v, _r) {
					return new Vector2Result(
						Vector2.normalise(v.visit()?.value)
					);
				},
				Dot_function(_f, _l, v1, _1, v2, _r) {
					return new NumberResult(
						Vector2.dot(v1.visit()?.value, v2.visit()?.value)
					);
				},
				AngleBetween_function(_f, _l, v1, _1, v2, _r) {
					return new NumberResult(
						Vector2.angleBetween(
							v1.visit()?.value,
							v2.visit()?.value
						)
					);
				},
				Cross_function(_f, _l, v1, _1, v2, _r) {
					return new NumberResult(
						Vector2.cross(v1.visit()?.value, v2.visit()?.value)
					);
				},
				Lerp_function(_f, _l, v1, _1, v2, _2, t, _r) {
					return new Vector2Result(
						Vector2.lerp(
							v1.visit()?.value,
							v2.visit()?.value,
							t.visit()?.value
						)
					);
				},
			}
		);
	}

	private setupVector3Arithmetic() {
		this.vector3Semantics =
			vector3Grammar.Vector3Arithmetic.createSemantics();

		this.vector3Semantics.addOperation<Vector3Result | NumberResult>(
			"visit()",
			{
				...basicArithmeticSemanticActions,
				AS_addition(xNode, _, yNode) {
					const x = xNode.visit();
					const y = yNode.visit();

					if (
						x instanceof Vector3Result === false &&
						y instanceof Vector3Result === false
					) {
						return x.accept(new AdditionVisitor(y));
					}

					return x.accept(new VectorAdditionVisitor(y));
				},
				AS_subtraction(xNode, _, yNode) {
					const x = xNode.visit();
					const y = yNode.visit();

					if (
						x instanceof Vector3Result === false &&
						y instanceof Vector3Result === false
					) {
						return x.accept(new SubtractionVisitor(y));
					}

					return x.accept(new VectorSubtractionVisitor(y));
				},
				MD_multiplication(xNode, _, yNode) {
					const x = xNode.visit();
					const y = yNode.visit();

					if (
						x instanceof Vector3Result === false &&
						y instanceof Vector3Result === false
					) {
						return x.accept(new MultiplicationVisitor(y));
					}

					return x.accept(new VectorMultiplicationVisitor(y));
				},
				MD_division(xNode, _, yNode) {
					const x = xNode.visit();
					const y = yNode.visit();

					if (
						x instanceof Vector3Result === false &&
						y instanceof Vector3Result === false
					) {
						return x.accept(new DivisionVisitor(y));
					}

					return x.accept(new VectorDivisionVisitor(y));
				},
				E_exponent(xNode, _, yNode) {
					const x = xNode.visit();
					const y = yNode.visit();

					if (
						x instanceof Vector3Result === false &&
						y instanceof Vector3Result === false
					) {
						return x.accept(new ExponentVisitor(y));
					}

					return x.accept(new VectorExponentVisitor(y));
				},
				P_parenthesis(_l, e, _r) {
					return e.visit();
				},
				Vector3_parse(_1, _2, xNode, _3, yNode, _4, zNode, _5) {
					const x = xNode.visit();
					const y = yNode.visit();
					const z = zNode.visit();

					if (
						x instanceof Vector3Result ||
						y instanceof Vector3Result ||
						z instanceof Vector3Result
					) {
						throw new TypeError("Expected: Number");
					}

					return new Vector3Result({
						x: x.value,
						y: y.value,
						z: z.value,
					});
				},
				LengthSq_function(_f, _l, v, _r) {
					return new NumberResult(
						Vector3.magnitudeSqrt(v.visit()?.value)
					);
				},
				DistanceSq_function(_f, _l, v1, _1, v2, _r) {
					return new NumberResult(
						Vector3.distanceSq(v1.visit()?.value, v2.visit()?.value)
					);
				},
				Length_function(_f, _l, v, _r) {
					return new NumberResult(
						Vector3.magnitude(v.visit()?.value)
					);
				},
				Distance_function(_f, _l, v1, _1, v2, _r) {
					return new NumberResult(
						Vector3.distance(v1.visit()?.value, v2.visit()?.value)
					);
				},
				Normalise_function(_f, _l, v, _r) {
					return new Vector3Result(
						Vector3.normalise(v.visit()?.value)
					);
				},
				Dot_function(_f, _l, v1, _1, v2, _r) {
					return new NumberResult(
						Vector3.dot(v1.visit()?.value, v2.visit()?.value)
					);
				},
				AngleBetween_function(_f, _l, v1, _1, v2, _r) {
					return new NumberResult(
						Vector3.angleBetween(
							v1.visit()?.value,
							v2.visit()?.value
						)
					);
				},
				Cross_function(_f, _l, v1, _1, v2, _r) {
					return new Vector3Result(
						Vector3.cross(v1.visit()?.value, v2.visit()?.value)
					);
				},
				Lerp_function(_f, _l, v1, _1, v2, _2, t, _r) {
					return new Vector3Result(
						Vector3.lerp(
							v1.visit()?.value,
							v2.visit()?.value,
							t.visit()?.value
						)
					);
				},
			}
		);
	}

	private setupVector4Arithmetic() {
		this.vector4Semantics =
			vector4Grammar.Vector4Arithmetic.createSemantics();

		this.vector4Semantics.addOperation<Vector4Result | NumberResult>(
			"visit()",
			{
				...basicArithmeticSemanticActions,
				AS_addition(xNode, _, yNode) {
					const x = xNode.visit();
					const y = yNode.visit();

					if (
						x instanceof Vector4Result === false &&
						y instanceof Vector4Result === false
					) {
						return x.accept(new AdditionVisitor(y));
					}

					return x.accept(new VectorAdditionVisitor(y));
				},
				AS_subtraction(xNode, _, yNode) {
					const x = xNode.visit();
					const y = yNode.visit();

					if (
						x instanceof Vector4Result === false &&
						y instanceof Vector4Result === false
					) {
						return x.accept(new SubtractionVisitor(y));
					}

					return x.accept(new VectorSubtractionVisitor(y));
				},
				MD_multiplication(xNode, _, yNode) {
					const x = xNode.visit();
					const y = yNode.visit();

					if (
						x instanceof Vector4Result === false &&
						y instanceof Vector4Result === false
					) {
						return x.accept(new MultiplicationVisitor(y));
					}

					return x.accept(new VectorMultiplicationVisitor(y));
				},
				MD_division(xNode, _, yNode) {
					const x = xNode.visit();
					const y = yNode.visit();

					if (
						x instanceof Vector4Result === false &&
						y instanceof Vector4Result === false
					) {
						return x.accept(new DivisionVisitor(y));
					}

					return x.accept(new VectorDivisionVisitor(y));
				},
				E_exponent(xNode, _, yNode) {
					const x = xNode.visit();
					const y = yNode.visit();

					if (
						x instanceof Vector4Result === false &&
						y instanceof Vector4Result === false
					) {
						return x.accept(new ExponentVisitor(y));
					}

					return x.accept(new VectorExponentVisitor(y));
				},
				P_parenthesis(_l, e, _r) {
					return e.visit();
				},
				Vector4_parse(
					_1,
					_2,
					xNode,
					_3,
					yNode,
					_4,
					zNode,
					_5,
					wNode,
					_6
				) {
					const x = xNode.visit();
					const y = yNode.visit();
					const z = zNode.visit();
					const w = wNode.visit();

					if (
						x instanceof Vector4Result ||
						y instanceof Vector4Result ||
						z instanceof Vector4Result ||
						w instanceof Vector4Result
					) {
						throw new TypeError("Expected: Number");
					}

					return new Vector4Result({
						x: x.value,
						y: y.value,
						z: z.value,
						w: w.value,
					});
				},
				LengthSq_function(_f, _l, v, _r) {
					return new NumberResult(
						Vector4.magnitudeSqrt(v.visit()?.value)
					);
				},
				DistanceSq_function(_f, _l, v1, _1, v2, _r) {
					return new NumberResult(
						Vector4.distanceSq(v1.visit()?.value, v2.visit()?.value)
					);
				},
				Length_function(_f, _l, v, _r) {
					return new NumberResult(
						Vector4.magnitude(v.visit()?.value)
					);
				},
				Distance_function(_f, _l, v1, _1, v2, _r) {
					return new NumberResult(
						Vector4.distance(v1.visit()?.value, v2.visit()?.value)
					);
				},
				Normalise_function(_f, _l, v, _r) {
					return new Vector4Result(
						Vector4.normalise(v.visit()?.value)
					);
				},
				Dot_function(_f, _l, v1, _1, v2, _r) {
					return new NumberResult(
						Vector4.dot(v1.visit()?.value, v2.visit()?.value)
					);
				},
				AngleBetween_function(_f, _l, v1, _1, v2, _r) {
					return new NumberResult(
						Vector4.angleBetween(
							v1.visit()?.value,
							v2.visit()?.value
						)
					);
				},
				Lerp_function(_f, _l, v1, _1, v2, _2, t, _r) {
					return new Vector4Result(
						Vector4.lerp(
							v1.visit()?.value,
							v2.visit()?.value,
							t.visit()?.value
						)
					);
				},
			}
		);
	}

	private tryParseVectorArithmetic(
		sentence: string
	): Vector4Result | Vector3Result | Vector2Result | undefined {
		const vector4Match = vector4Grammar.Vector4Arithmetic.match(sentence);

		if (vector4Match.succeeded()) {
			return this.vector4Semantics(vector4Match).visit();
		}

		const vector3Match = vector3Grammar.Vector3Arithmetic.match(sentence);

		if (vector3Match.succeeded()) {
			return this.vector3Semantics(vector3Match).visit();
		}

		const vector2Match = vector2Grammar.Vector2Arithmetic.match(sentence);

		if (vector2Match.succeeded()) {
			return this.vector2Semantics(vector2Match).visit();
		}

		return undefined;
	}

	enabled() {
		return UserSettings.getInstance().vectorArithmeticProvider.enabled;
	}

	provide<T = Vector4Result | Vector3Result | Vector2Result>(
		expression: string
	): T | undefined {
		try {
			return this.tryParseVectorArithmetic(expression) as T;
		} catch (e) {
			logger.error(e);
			return undefined;
		}
	}
}
