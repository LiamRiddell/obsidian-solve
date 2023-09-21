import { PercentageArithmeticProvider } from "@/providers/percentage/PercentageArithmeticProvider";
import { NumberResult } from "@/results/AutoNumberResult";
import { PercentageResult } from "@/results/PercentageResult";
import { beforeAll, describe, test } from "@jest/globals";
import { expectProviderResultAndType } from "../../helpers/Provider";

let provider: PercentageArithmeticProvider;

beforeAll(() => {
	provider = new PercentageArithmeticProvider();
});

describe("Primitive", () => {
	test("percentage", () => {
		expectProviderResultAndType<PercentageResult>(
			provider,
			"10%",
			new PercentageResult(10.0)
		);
	});
});

describe("Addition", () => {
	test("10.0 + 15%", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"10.0 + 15%",
			new NumberResult(11.5)
		);
	});

	test("15% + 10", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"15% + 10",
			new NumberResult(10.15)
		);
	});
});

describe("Subtraction", () => {
	test("10.0 - 15%", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"10.0 - 15%",
			new NumberResult(8.5)
		);
	});

	test("15% - 10", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"15% - 10",
			new NumberResult(-9.85)
		);
	});
});

describe("Multiplication", () => {
	test("10 * 15%", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"10 * 15%",
			new NumberResult(15)
		);
	});

	test("15% * 10", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"15% * 10",
			new NumberResult(1.5)
		);
	});
});

describe("Division", () => {
	test("10 / 10%", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"10 / 10%",
			new NumberResult(10)
		);
	});

	test("100% / 10", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"100% / 10",
			new NumberResult(0.1)
		);
	});
});

describe("Exponent", () => {
	test("10 ^ 20%", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"10 ^ 20%",
			new NumberResult(100)
		);
	});

	test("150% ^ 10", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"150% ^ 10",
			new NumberResult(57.6650390625)
		);
	});
});

describe("PEMDAS", () => {
	test("(10 + 50%) * 2", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"(10 + 50%) * 2",
			new NumberResult(30)
		);
	});
});

describe("Percentage Of", () => {
	test("10% of 20", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"10% of 20",
			new NumberResult(2)
		);
	});
});

describe("Percentage Increase/Decrease", () => {
	test("800 to 1000", () => {
		expectProviderResultAndType<PercentageResult>(
			provider,
			"800 to 1000",
			new PercentageResult(25)
		);
	});

	test("800 to 400", () => {
		expectProviderResultAndType<PercentageResult>(
			provider,
			"800 to 400",
			new PercentageResult(-50)
		);
	});
});

describe("Increase/Decrease By Percentage", () => {
	test("increase 100 by 25%", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"increase 100 by 25%",
			new NumberResult(125)
		);
	});

	test("INcREaSE 100 bY 25%", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"INcREaSE 100 bY 25%",
			new NumberResult(125)
		);
	});

	test("decrease 100 by 25%", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"decrease 100 by 25%",
			new NumberResult(75)
		);
	});

	test("Decrease 100 bY 25%", () => {
		expectProviderResultAndType<NumberResult>(
			provider,
			"Decrease 100 bY 25%",
			new NumberResult(75)
		);
	});
});
