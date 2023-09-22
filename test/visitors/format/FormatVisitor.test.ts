import { DatetimeResult } from "@/results/DatetimeResult";
import { HexResult } from "@/results/HexResult";
import { NumberResult } from "@/results/NumberResult";
import { PercentageResult } from "@/results/PercentageResult";
import { StringResult } from "@/results/StringResult";
import { FormatVisitor } from "@/visitors/format/FormatVisitor";
import { beforeAll, describe, expect, test } from "@jest/globals";
import moment from "moment";

let formatVisitor: FormatVisitor;

beforeAll(() => {
	formatVisitor = new FormatVisitor();
});

describe("Types", () => {
	test("Float", () =>
		expect(new NumberResult(2.54).accept(formatVisitor)).toBe("2.54"));

	test("Float (Many Decimals Places)", () =>
		expect(new NumberResult(2.00004).accept(formatVisitor)).toBe("2.00"));

	test("Integer", () =>
		expect(new NumberResult(2).accept(formatVisitor)).toBe("2"));

	test("Integer (Many Decimal Places)", () =>
		expect(new NumberResult(2.0).accept(formatVisitor)).toBe("2"));

	test("Percentage", () =>
		expect(new PercentageResult(83).accept(formatVisitor)).toBe("83.00%"));

	test("Datetime", () =>
		expect(
			new DatetimeResult(moment("1997-07-16T19:20:30.45Z")).accept(
				formatVisitor
			)
		).toBe(moment("1997-07-16T19:20:30.45Z").format()));

	test("Hex", () =>
		expect(new HexResult(0x254).accept(formatVisitor)).toBe("0x254"));

	test("String", () =>
		expect(new StringResult("Hello World").accept(formatVisitor)).toBe(
			"Hello World"
		));
});
