import { UnitOfMeasurementResult } from "@/results/UnitOfMeasurementResult";
import convert, { Unit } from "convert-units";

export function convertUnitOfMeasurementResultTo(
	from: UnitOfMeasurementResult,
	to: UnitOfMeasurementResult
) {
	return new UnitOfMeasurementResult(
		convert(from.value)
			.from(from.unit as Unit)
			.to(to.unit as Unit),
		to.unit
	);
}
