import { PercentageArithmeticProvider } from "@/providers/percentage/PercentageArithmeticProvider";
import { FloatResult } from "@/results/FloatResult";
import { IntegerResult } from "@/results/IntegerResult";
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
	test("10 + 15% to equal 11", () => {
		expectProviderResultAndType<IntegerResult>(
			provider,
			"10 + 15%",
			new IntegerResult(11)
		);
	});

	test("10.0 + 15% to equal 11.5", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"10.0 + 15%",
			new FloatResult(11.5)
		);
	});

	test("15% + 10 to equal 10.15", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"15% + 10",
			new FloatResult(10.15)
		);
	});
});

describe("Subtraction", () => {
	test("10 - 15% to equal 8", () => {
		expectProviderResultAndType<IntegerResult>(
			provider,
			"10 - 15%",
			new IntegerResult(8)
		);
	});

	test("10.0 - 15% to equal 8.5", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"10.0 - 15%",
			new FloatResult(8.5)
		);
	});

	test("15% - 10 to equal -9.85", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"15% - 10",
			new FloatResult(-9.85)
		);
	});
});

describe("Multiplication", () => {
	test("10 * 15% to equal 15", () => {
		expectProviderResultAndType<IntegerResult>(
			provider,
			"10 * 15%",
			new IntegerResult(15)
		);
	});

	test("15% * 10 to equal 1.50", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"15% * 10",
			new FloatResult(1.5)
		);
	});
});

describe("Division", () => {
	test("10 / 10% to equal 10", () => {
		expectProviderResultAndType<IntegerResult>(
			provider,
			"10 / 10%",
			new IntegerResult(10)
		);
	});

	test("100% / 10 to equal 0.1", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"100% / 10",
			new FloatResult(0.1)
		);
	});
});

describe("Exponent", () => {
	test("10 ^ 20% to equal 100", () => {
		expectProviderResultAndType<IntegerResult>(
			provider,
			"10 ^ 20%",
			new IntegerResult(100)
		);
	});

	test("150% ^ 10 to equal 57.6650390625", () => {
		expectProviderResultAndType<FloatResult>(
			provider,
			"150% ^ 10",
			new FloatResult(57.6650390625)
		);
	});
});

describe("PEMDAS", () => {
	test("(10 + 50%) * 2 to equal 30", () => {
		expectProviderResultAndType<IntegerResult>(
			provider,
			"(10 + 50%) * 2",
			new IntegerResult(30)
		);
	});
});

describe("Percentage Of", () => {
	test("10% of 20 to equal 2", () => {
		expectProviderResultAndType<IntegerResult>(
			provider,
			"10% of 20",
			new IntegerResult(2)
		);
	});
});

describe("Percentage Increase/Decrease", () => {
	test("800 to 1000 to equal 25%", () => {
		expectProviderResultAndType<PercentageResult>(
			provider,
			"800 to 1000",
			new PercentageResult(25)
		);
	});

	test("800 to 400 to equal -50%", () => {
		expectProviderResultAndType<PercentageResult>(
			provider,
			"800 to 400",
			new PercentageResult(-50)
		);
	});
});

describe("Increase/Decrease By Percentage", () => {
	test("increase 100 by 25% to equal 125", () => {
		expectProviderResultAndType<IntegerResult>(
			provider,
			"increase 100 by 25%",
			new IntegerResult(125)
		);
	});

	test("decrease 100 by 25% to equal 75", () => {
		expectProviderResultAndType<IntegerResult>(
			provider,
			"decrease 100 by 25%",
			new IntegerResult(75)
		);
	});
});
