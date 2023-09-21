import { UnsupportedVisitorOperationError } from "@/errors/UnsupportedVisitorOperationError";
import { NumberResult } from "@/results/AutoNumberResult";
import { HexResult } from "@/results/HexResult";
import { PercentageResult } from "@/results/PercentageResult";
import { UnitOfMeasurementResult } from "@/results/UnitOfMeasurementResult";
import { INumericResult } from "@/results/definition/INumericResult";
import { IResult } from "@/results/definition/IResult";
import { convertUnitOfMeasurementResultTo } from "@/utilities/UnitOfMeasurement";
import { HexCoercion } from "@/visitors/coercion/HexCoercionVisitor";
import { NumberCoercion } from "@/visitors/coercion/NumberCoercionVisitor";
import { IGenericResultVisitor } from "@/visitors/definition/IGenericResultVisitor";

export class LogicalShiftLeftVisitor
	implements IGenericResultVisitor<INumericResult>
{
	constructor(private right: INumericResult) {}

	visit<TValue>(visited: IResult<TValue>): INumericResult {
		if (this.right instanceof PercentageResult) {
			throw new UnsupportedVisitorOperationError();
		}

		if (visited instanceof NumberResult) {
			return this.number(visited, this.right);
		}

		if (visited instanceof HexResult) {
			return this.hex(visited, this.right);
		}

		if (visited instanceof PercentageResult) {
			return this.percentage(visited, this.right);
		}

		if (visited instanceof UnitOfMeasurementResult) {
			return this.unitOfMeasurement(visited, this.right);
		}

		throw new UnsupportedVisitorOperationError();
	}

	private number(left: NumberResult, right: INumericResult) {
		const coercedRight = NumberCoercion.visit(right);

		return new NumberResult(left.value << coercedRight.value);
	}

	private hex(left: HexResult, right: INumericResult) {
		const coercedRight = HexCoercion.visit(right);

		return new HexResult(left.value << coercedRight.value);
	}

	private percentage(left: PercentageResult, right: INumericResult) {
		const coercedRight = NumberCoercion.visit(right);

		return new NumberResult((left.value / 100) << coercedRight.value);
	}

	private unitOfMeasurement(
		left: UnitOfMeasurementResult,
		right: INumericResult
	) {
		if (right instanceof UnitOfMeasurementResult) {
			const convertedRight = convertUnitOfMeasurementResultTo(
				right,
				left
			);

			return new UnitOfMeasurementResult(
				left.value << convertedRight.value,
				left.unit
			);
		}

		const coercedRight = NumberCoercion.visit(right);

		return new UnitOfMeasurementResult(
			left.value << coercedRight.value,
			left.unit
		);
	}
}

export class LogicalShiftRightVisitor
	implements IGenericResultVisitor<INumericResult>
{
	constructor(private right: INumericResult) {}

	visit<TValue>(visited: IResult<TValue>): INumericResult {
		if (this.right instanceof PercentageResult) {
			throw new UnsupportedVisitorOperationError();
		}

		if (visited instanceof NumberResult) {
			return this.number(visited, this.right);
		}

		if (visited instanceof HexResult) {
			return this.hex(visited, this.right);
		}

		if (visited instanceof PercentageResult) {
			return this.percentage(visited, this.right);
		}

		if (visited instanceof UnitOfMeasurementResult) {
			return this.unitOfMeasurement(visited, this.right);
		}

		throw new UnsupportedVisitorOperationError();
	}

	private number(left: NumberResult, right: INumericResult) {
		const coercedRight = NumberCoercion.visit(right);

		return new NumberResult(left.value >> coercedRight.value);
	}

	private hex(left: HexResult, right: INumericResult) {
		const coercedRight = HexCoercion.visit(right);

		return new HexResult(left.value >> coercedRight.value);
	}

	private percentage(left: PercentageResult, right: INumericResult) {
		const coercedRight = NumberCoercion.visit(right);

		return new NumberResult((left.value / 100) >> coercedRight.value);
	}

	private unitOfMeasurement(
		left: UnitOfMeasurementResult,
		right: INumericResult
	) {
		if (right instanceof UnitOfMeasurementResult) {
			const convertedRight = convertUnitOfMeasurementResultTo(
				right,
				left
			);

			return new UnitOfMeasurementResult(
				left.value >> convertedRight.value,
				left.unit
			);
		}

		const coercedRight = NumberCoercion.visit(right);

		return new UnitOfMeasurementResult(
			left.value >> coercedRight.value,
			left.unit
		);
	}
}
