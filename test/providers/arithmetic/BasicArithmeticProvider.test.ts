import { BasicArithmeticProvider } from "@/providers/arithmetic/BasicArithmeticProvider";
import { HexResult } from "@/results/HexResult";
import { NumberResult } from "@/results/NumberResult";
import { beforeAll, describe, test } from "@jest/globals";
import { expectProviderResultAndType } from "../../helpers/Provider";

let provider: BasicArithmeticProvider;

beforeAll(() => {
	provider = new BasicArithmeticProvider();
});

describe("Primitive", () => {
	test("whole number", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"102",
			new NumberResult(102)
		);
	});

	test("positive whole number", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"+10",
			new NumberResult(10)
		);
	});

	test("negative whole number", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"-15",
			new NumberResult(-15)
		);
	});

	test("fractional number", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"15.2",
			new NumberResult(15.2)
		);
	});

	test("positive fractional number", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"7.1",
			new NumberResult(7.1)
		);
	});

	test("negative fractional number", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"-5.1",
			new NumberResult(-5.1)
		);
	});

	test("hex", () => {
		expectProviderResultAndType<HexResult>(
			provider,
			"0x204",
			new HexResult(0x204)
		);
	});
});

describe("Addition", () => {
	test("100 + 2", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"100 + 2",
			new NumberResult(100 + 2)
		);
	});

	test("100 add 2", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"100 add 2",
			new NumberResult(100 + 2)
		);
	});

	test("100 plus 2", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"100 plus 2",
			new NumberResult(100 + 2)
		);
	});

	test("100.20 + 24.3", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"100.20 + 24.3",
			new NumberResult(100.2 + 24.3)
		);
	});

	test("0x20 + 10", () => {
		expectProviderResultAndType<HexResult>(
			provider,
			"0x20 + 10",
			new HexResult(0x20 + 10)
		);
	});

	test("0x20 + 0xC", () => {
		expectProviderResultAndType<HexResult>(
			provider,
			"0x20 + 0xC",
			new HexResult(0x20 + 0xc)
		);
	});
});

describe("Subtraction", () => {
	test("100 - 2", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"100 - 2",
			new NumberResult(100 - 2)
		);
	});

	test("100 take 2", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"100 take 2",
			new NumberResult(100 - 2)
		);
	});

	test("100 minus 2", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"100 minus 2",
			new NumberResult(100 - 2)
		);
	});

	test("100.23 - 24.3", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"100.23 - 24.3",
			new NumberResult(100.23 - 24.3)
		);
	});

	test("0x20 - 10", () => {
		expectProviderResultAndType<HexResult>(
			provider,
			"0x20 - 10",
			new HexResult(0x20 - 10)
		);
	});

	test("0x20 - 0xC", () => {
		expectProviderResultAndType<HexResult>(
			provider,
			"0x20 - 0xC",
			new HexResult(0x20 - 0xc)
		);
	});

	test("0x100 - 0x328", () => {
		expectProviderResultAndType<HexResult>(
			provider,
			"0x100 - 0x328",
			new HexResult(0x100 - 0x328)
		);
	});
});

describe("Multiplication", () => {
	test("100 * 2", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"100 * 2",
			new NumberResult(100 * 2)
		);
	});

	test("100 times 2", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"100 times 2",
			new NumberResult(100 * 2)
		);
	});

	test("100 multiply by 2", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"100 multiply by 2",
			new NumberResult(100 * 2)
		);
	});

	test("100 multiply 2", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"100 multiply 2",
			new NumberResult(100 * 2)
		);
	});

	test("27.3 * 8.2", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"27.3 * 8.2",
			new NumberResult(27.3 * 8.2)
		);
	});

	test("0x20 * 10", () => {
		expectProviderResultAndType<HexResult>(
			provider,
			"0x20 * 10",
			new HexResult(0x20 * 10)
		);
	});

	test("0x20 * 0xC", () => {
		expectProviderResultAndType<HexResult>(
			provider,
			"0x20 * 0xC",
			new HexResult(0x20 * 0xc)
		);
	});

	test("0x20 \\* 0xC (Escaped)", () => {
		expectProviderResultAndType<HexResult>(
			provider,
			"0x20 \\* 0xC",
			new HexResult(0x20 * 0xc)
		);
	});
});

describe("Division", () => {
	test("100 / 2", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"100 / 2",
			new NumberResult(100 / 2)
		);
	});

	test("100 divide by 2", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"100 divide by 2",
			new NumberResult(100 / 2)
		);
	});

	test("100 divide 2", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"100 divide 2",
			new NumberResult(100 / 2)
		);
	});

	test("146.38 / 4.76", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"146.38 / 4.76",
			new NumberResult(146.38 / 4.76)
		);
	});

	test("0x20 / 10", () => {
		expectProviderResultAndType<HexResult>(
			provider,
			"0x20 / 10",
			new HexResult(0x20 / 10)
		);
	});

	test("0x20 / 0xC", () => {
		expectProviderResultAndType<HexResult>(
			provider,
			"0x20 / 0xC",
			new HexResult(0x20 / 0xc)
		);
	});
});

describe("Exponent", () => {
	test("10 ^ 2", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"10 ^ 2",
			new NumberResult(Math.pow(10, 2))
		);
	});

	test("10 to the power of 2", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"10 to the power of 2",
			new NumberResult(Math.pow(10, 2))
		);
	});

	test("10 power of 2", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"10 power of 2",
			new NumberResult(Math.pow(10, 2))
		);
	});

	test("10 exponent 2", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"10 exponent 2",
			new NumberResult(Math.pow(10, 2))
		);
	});

	test("10 prime 2", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"10 prime 2",
			new NumberResult(Math.pow(10, 2))
		);
	});

	test("10.36 ^ 2", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"10.36 ^ 2",
			new NumberResult(Math.pow(10.36, 2))
		);
	});
});

describe("PEMDAS", () => {
	test("(4 + 3) * 2^2 - 10 / 2", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"(4 + 3) * 2^2 - 10 / 2",
			new NumberResult(23)
		);
	});

	test("(4 plus 3) times by 2 to the power of 2 minus 10 divide by 2", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"(4 plus 3) times by 2 to the power of 2 minus 10 divide by 2",
			new NumberResult(23)
		);
	});
});
