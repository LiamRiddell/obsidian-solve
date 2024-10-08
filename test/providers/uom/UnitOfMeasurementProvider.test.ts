import { UnitsOfMeasurementProvider } from "@/providers/uom/UnitsOfMeasurementProvider";
import { NumberResult } from "@/results/NumberResult";
import { StringResult } from "@/results/StringResult";
import { UnitOfMeasurementResult } from "@/results/UnitOfMeasurementResult";
import { beforeAll, describe, test } from "@jest/globals";
import convert, { Unit } from "convert-units";
import { expectProviderResultAndType } from "../../helpers/Provider";

let provider: UnitsOfMeasurementProvider;

const allSupportedUnits = [
	"km3/s",
	"yd3/h",
	"yd3/min",
	"yd3/s",
	"ft3/h",
	"ft3/min",
	"ft3/s",
	"in3/h",
	"in3/min",
	"in3/s",
	"mm3/s",
	"cm3/s",
	"fl-oz/h",
	"fl-oz/min",
	"fl-oz/s",
	"gal/h",
	"gal/min",
	"gal/s",
	"pnt/h",
	"pnt/min",
	"pnt/s",
	"cup/s",
	"Tbs/s",
	"tsp/s",
	"m3/h",
	"m3/min",
	"m3/s",
	"kl/h",
	"kl/min",
	"kl/s",
	"l/h",
	"l/min",
	"l/s",
	"dl/s",
	"cl/s",
	"ml/s",
	"min/km",
	"s/ft",
	"s/m",
	"km/h",
	"m/h",
	"ft/s",
	"m/s",
	"knot",
	"THz",
	"GHz",
	"MHz",
	"kHz",
	"mHz",
	"Hz",
	"rpm",
	"rad/s",
	"deg/s",
	"km3",
	"yd3",
	"ft3",
	"in3",
	"mm3",
	"cm3",
	"m3",
	"gal",
	"qt",
	"pnt",
	"cup",
	"fl-oz",
	"Tbs",
	"tsp",
	"kl",
	"lb",
	"lx",
	"l",
	"ml",
	"km2",
	"mi2",
	"mm2",
	"cm2",
	"m2",
	"in2",
	"ft2",
	"ha",
	"ac",
	"GVARh",
	"MVARh",
	"kVARh",
	"mVARh",
	"VARh",
	"GVAR",
	"MVAR",
	"kVAR",
	"mVAR",
	"VAR",
	"GVA",
	"MVA",
	"kVA",
	"mVA",
	"VA",
	"GWh",
	"MWh",
	"kWh",
	"mWh",
	"Wh",
	"GW",
	"MW",
	"kW",
	"mW",
	"W",
	"kJ",
	"J",
	"mcg",
	"kg",
	"grad",
	"g",
	"mg",
	"oz",
	"torr",
	"t",
	"mt",
	"month",
	"year",
	"week",
	"deg",
	"d",
	"hPa",
	"h",
	"min",
	"s",
	"ms",
	"mu",
	"ns",
	"kPa",
	"MPa",
	"bar",
	"psi",
	"ksi",
	"Pa",
	"ft-cd",
	"ppm",
	"ppb",
	"ppt",
	"ppq",
	"kV",
	"V",
	"mV",
	"kA",
	"A",
	"mA",
	"arcmin",
	"arcsec",
	"rad",
	"ft-us",
	"mi",
	"mm",
	"m",
	"cm",
	"ft",
	"yd",
	"km",
	"in",
	"F",
	"Kb",
	"KB",
	"K",
	"C",
	"R",
	"TB",
	"GB",
	"MB",
	"B",
	"Tb",
	"Gb",
	"Mb",
	"b",
];

beforeAll(() => {
	provider = new UnitsOfMeasurementProvider();
});

describe("Primitive", () => {
	test("Unit", () => {
		expectProviderResultAndType<UnitOfMeasurementResult>(
			provider,
			"10 mm",
			new UnitOfMeasurementResult(10.0, "mm")
		);
	});

	for (let i = 0; i < allSupportedUnits.length; i++) {
		const unit = allSupportedUnits[i];

		if (unit) {
			const firstPossibleUnit = convert()
				.from(unit as Unit)
				.possibilities()[0];

			const expression = `convert 1 ${unit} to ${firstPossibleUnit}`;

			test(expression, () => {
				const expectedValue = convert(1)
					.from(unit as Unit)
					.to(firstPossibleUnit);

				expectProviderResultAndType<UnitOfMeasurementResult>(
					provider,
					expression,
					new UnitOfMeasurementResult(
						expectedValue,
						firstPossibleUnit
					)
				);
			});
		}
	}
});

describe("Addition", () => {
	test("10 mm + 20", () => {
		expectProviderResultAndType<UnitOfMeasurementResult>(
			provider,
			"10 mm + 20",
			new UnitOfMeasurementResult(10 + 20, "mm")
		);
	});

	test("100 + 20 cm", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"100 + 20 cm",
			new NumberResult(100 + 20)
		);
	});
});

describe("Subtraction", () => {
	test("10 mm - 20", () => {
		expectProviderResultAndType<UnitOfMeasurementResult>(
			provider,
			"10 mm - 20",
			new UnitOfMeasurementResult(10 - 20, "mm")
		);
	});

	test("100 - 20 cm", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"100 - 20 cm",
			new NumberResult(100 - 20)
		);
	});
});

describe("Multiplication", () => {
	test("10 mm * 20", () => {
		expectProviderResultAndType<UnitOfMeasurementResult>(
			provider,
			"10 mm * 20",
			new UnitOfMeasurementResult(10 * 20, "mm")
		);
	});

	test("100 * 20 cm", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"100 * 20 cm",
			new NumberResult(100 * 20)
		);
	});
});

describe("Division", () => {
	test("10 mm / 20", () => {
		expectProviderResultAndType<UnitOfMeasurementResult>(
			provider,
			"10 mm / 20",
			new UnitOfMeasurementResult(10 / 20, "mm")
		);
	});

	test("100 / 20 cm", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"100 / 20 cm",
			new NumberResult(100 / 20)
		);
	});
});

describe("Exponent", () => {
	test("10 mm ^ 20", () => {
		expectProviderResultAndType<UnitOfMeasurementResult>(
			provider,
			"10 mm ^ 20",
			new UnitOfMeasurementResult(Math.pow(10, 20), "mm")
		);
	});

	test("100 ^ 20 cm", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"100 ^ 20 cm",
			new NumberResult(Math.pow(100, 20))
		);
	});
});

describe("PEMDAS", () => {
	test("(10 mm + 50%) * 2", () => {
		expectProviderResultAndType<UnitOfMeasurementResult>(
			provider,
			"(10 mm + 50%) * 2",
			new UnitOfMeasurementResult((10 + 5) * 2, "mm")
		);
	});
});

describe("Conversion", () => {
	test("12 mm to cm", () => {
		expectProviderResultAndType<UnitOfMeasurementResult>(
			provider,
			"12 mm to cm",
			new UnitOfMeasurementResult(convert(12).from("mm").to("cm"), "mm")
		);
	});

	test("1200 mm to best", () => {
		expectProviderResultAndType<UnitOfMeasurementResult>(
			provider,
			"1200 mm to best",
			new UnitOfMeasurementResult(
				convert(12).from("mm").toBest()?.val,
				"m"
			)
		);
	});

	test("1200 mm to ?", () => {
		expectProviderResultAndType<StringResult>(
			provider,
			"1200 mm to ?",
			new StringResult(convert().from("mm").possibilities().join(", "))
		);
	});

	test("1200 mm to", () => {
		expectProviderResultAndType<StringResult>(
			provider,
			"1200 mm to ?",
			new StringResult(convert().from("mm").possibilities().join(", "))
		);
	});
});

describe("Negative Lookahead", () => {
	test("100 kg + 2 to g", () => {
		expectProviderResultAndType<UnitOfMeasurementResult>(
			provider,
			"100 kg + 2 to g",
			new UnitOfMeasurementResult(
				convert(100 + 2)
					.from("kg")
					.to("g"),
				"g"
			)
		);
	});

	test("convert 1 torr to Pa", () => {
		expectProviderResultAndType<UnitOfMeasurementResult>(
			provider,
			"convert 1 torr to Pa",
			new UnitOfMeasurementResult(convert(1).from("torr").to("Pa"), "Pa")
		);
	});
});
