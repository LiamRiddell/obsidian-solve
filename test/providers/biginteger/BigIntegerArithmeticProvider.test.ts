import { ERadix } from "@/constants/ERadix";
import { BigIntegerArithmeticProvider } from "@/providers/biginteger/BigIntegerArithmeticProvider";
import { BigIntResult } from "@/results/BigIntResult";
import { beforeAll, describe, test } from "@jest/globals";
import { expectProviderResultAndType } from "../../helpers/Provider";

let provider: BigIntegerArithmeticProvider;

beforeAll(() => {
	provider = new BigIntegerArithmeticProvider();
});

describe("Primitive", () => {
	test("whole number", () => {
		expectProviderResultAndType<BigIntResult>(
			provider,
			"102",
			new BigIntResult(BigInt(102), ERadix.Decimal)
		);
	});

	test("hex", () => {
		expectProviderResultAndType<BigIntResult>(
			provider,
			"0x204",
			new BigIntResult(BigInt(0x204), ERadix.Hexadecimal)
		);
	});
});

describe("Addition", () => {
	test("100 + 2", () => {
		expectProviderResultAndType<BigIntResult>(
			provider,
			"100 + 2",
			new BigIntResult(BigInt(100 + 2), ERadix.Decimal)
		);
	});

	test("0x20 + 10", () => {
		expectProviderResultAndType<BigIntResult>(
			provider,
			"0x20 + 10",
			new BigIntResult(BigInt(0x20 + 10), ERadix.Hexadecimal)
		);
	});

	test("0x20 + 0xC", () => {
		expectProviderResultAndType<BigIntResult>(
			provider,
			"0x20 + 0xC",
			new BigIntResult(BigInt(0x20 + 0xc), ERadix.Hexadecimal)
		);
	});
});

describe("Subtraction", () => {
	test("100 - 2", () => {
		expectProviderResultAndType<BigIntResult>(
			provider,
			"100 - 2",
			new BigIntResult(BigInt(100 - 2), ERadix.Decimal)
		);
	});

	test("0x20 - 10", () => {
		expectProviderResultAndType<BigIntResult>(
			provider,
			"0x20 - 10",
			new BigIntResult(BigInt(0x20 - 10), ERadix.Hexadecimal)
		);
	});

	test("0x20 - 0xC", () => {
		expectProviderResultAndType<BigIntResult>(
			provider,
			"0x20 - 0xC",
			new BigIntResult(BigInt(0x20 - 0xc), ERadix.Hexadecimal)
		);
	});

	test("0x100 - 0x328", () => {
		expectProviderResultAndType<BigIntResult>(
			provider,
			"0x100 - 0x328",
			new BigIntResult(BigInt(0x100 - 0x328), ERadix.Hexadecimal)
		);
	});
});

describe("Multiplication", () => {
	test("100 * 2", () => {
		expectProviderResultAndType<BigIntResult>(
			provider,
			"100 * 2",
			new BigIntResult(BigInt(100 * 2), ERadix.Decimal)
		);
	});

	test("0x20 * 10", () => {
		expectProviderResultAndType<BigIntResult>(
			provider,
			"0x20 * 10",
			new BigIntResult(BigInt(0x20 * 10), ERadix.Hexadecimal)
		);
	});

	test("0x20 * 0xC", () => {
		expectProviderResultAndType<BigIntResult>(
			provider,
			"0x20 * 0xC",
			new BigIntResult(BigInt(0x20 * 0xc), ERadix.Hexadecimal)
		);
	});

	test("0x20 \\* 0xC (Escaped)", () => {
		expectProviderResultAndType<BigIntResult>(
			provider,
			"0x20 \\* 0xC",
			new BigIntResult(BigInt(0x20 * 0xc), ERadix.Hexadecimal)
		);
	});

	test("0x20 × 0xC", () => {
		expectProviderResultAndType<BigIntResult>(
			provider,
			"0x20 × 0xC",
			new BigIntResult(BigInt(0x20 * 0xc), ERadix.Hexadecimal)
		);
	});
});

describe("Division", () => {
	test("100 / 2", () => {
		expectProviderResultAndType<BigIntResult>(
			provider,
			"100 / 2",
			new BigIntResult(BigInt(100 / 2), ERadix.Decimal)
		);
	});

	test("0x64 / 10", () => {
		expectProviderResultAndType<BigIntResult>(
			provider,
			"0x64 / 10",
			new BigIntResult(BigInt(0x64 / 10), ERadix.Hexadecimal)
		);
	});
});

describe("Bitwise", () => {
	test("0b10101 << 4", () => {
		expectProviderResultAndType<BigIntResult>(
			provider,
			"0b10101 << 4",
			new BigIntResult(BigInt(0b10101 << 4), ERadix.Binary)
		);
	});

	test("0b10101 >> 4", () => {
		expectProviderResultAndType<BigIntResult>(
			provider,
			"0b10101 >> 4",
			new BigIntResult(BigInt(0b10101 >> 4), ERadix.Binary)
		);
	});

	test("0b10101 & 0b00001", () => {
		expectProviderResultAndType<BigIntResult>(
			provider,
			"0b10101 & 0b00001",
			new BigIntResult(BigInt(0b10101 & 0b00001), ERadix.Binary)
		);
	});

	test("0b10101 ^ 0b00001", () => {
		expectProviderResultAndType<BigIntResult>(
			provider,
			"0b10101 ^ 0b00001",
			new BigIntResult(BigInt(0b10101) ^ BigInt(0b00001), ERadix.Binary)
		);
	});

	test("0b10101 | 0b00001", () => {
		expectProviderResultAndType<BigIntResult>(
			provider,
			"0b10101 | 0b00001",
			new BigIntResult(BigInt(0b10101 | 0b00001), ERadix.Binary)
		);
	});
});
