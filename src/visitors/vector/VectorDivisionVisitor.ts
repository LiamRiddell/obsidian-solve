import { UnsupportedVisitorOperationError } from "@/errors/UnsupportedVisitorOperationError";
import { Vector2Result } from "@/results/Vector2Result";
import { Vector3Result } from "@/results/Vector3Result";
import { Vector4Result } from "@/results/Vector4Result";
import { IResult } from "@/results/definition/IResult";
import { IVector2Result } from "@/results/definition/IVector2Result";
import { Vector2Coercion } from "@/visitors/coercion/Vector2CoercionVisitor";
import { Vector3Coercion } from "@/visitors/coercion/Vector3CoercionVisitor";
import { Vector4Coercion } from "@/visitors/coercion/Vector4CoercionVisitor";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export class VectorDivisionVisitor
	implements
		IGenericResultVisitor<Vector2Result | Vector3Result | Vector4Result>
{
	constructor(private right: IVector2Result) {}

	visit<TValue>(
		visited: IResult<TValue>
	): Vector2Result | Vector3Result | Vector4Result {
		if (visited instanceof Vector2Result) {
			const left = Vector2Coercion.visit(visited);
			const right = Vector2Coercion.visit(this.right);

			return this.vector2(left, right);
		}

		if (visited instanceof Vector3Result) {
			const left = Vector3Coercion.visit(visited);
			const right = Vector3Coercion.visit(this.right);

			return this.vector3(left, right);
		}

		if (visited instanceof Vector4Result) {
			const left = Vector4Coercion.visit(visited);
			const right = Vector4Coercion.visit(this.right);

			return this.vector4(left, right);
		}

		throw new UnsupportedVisitorOperationError();
	}

	vector2(left: Vector2Result, right: Vector2Result) {
		return new Vector2Result({
			x: left.value.x / right.value.x,
			y: left.value.y / right.value.y,
		});
	}

	vector3(left: Vector3Result, right: Vector3Result) {
		return new Vector3Result({
			x: left.value.x / right.value.x,
			y: left.value.y / right.value.y,
			z: left.value.z / right.value.z,
		});
	}

	vector4(left: Vector4Result, right: Vector4Result) {
		return new Vector4Result({
			x: left.value.x / right.value.x,
			y: left.value.y / right.value.y,
			z: left.value.z / right.value.z,
			w: left.value.w / right.value.w,
		});
	}
}
