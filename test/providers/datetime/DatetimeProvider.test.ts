import { DatetimeProvider } from "@/providers/datetime/DatetimeProvider";
import { DatetimeResult } from "@/results/DatetimeResult";
import { StringResult } from "@/results/StringResult";
import { beforeAll, describe, expect, test } from "@jest/globals";
import moment from "moment";

let provider: DatetimeProvider;

beforeAll(() => {
	provider = new DatetimeProvider();
});

describe("Primitive", () => {
	test("Now", () => {
		const result = provider.provide("Now");

		expect(result).toBeDefined();

		expect(result).toBeInstanceOf(DatetimeResult);
	});

	test("Today", () => {
		const result = provider.provide("Today");

		expect(result).toBeDefined();

		expect(result).toBeInstanceOf(DatetimeResult);
	});

	test("Tomorrow", () => {
		const result = provider.provide("Tomorrow");

		expect(result).toBeDefined();

		expect(result).toBeInstanceOf(DatetimeResult);
	});

	test("Yesterday", () => {
		const result = provider.provide("Yesterday");

		expect(result).toBeDefined();

		expect(result).toBeInstanceOf(DatetimeResult);
	});

	test("Next Day of Week", () => {
		const days = [
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
			"Sunday",
		];

		for (let i = 0; i < days.length; i++) {
			const day = days[i];

			const result = provider.provide(`Next ${day}`);
			expect(result).toBeDefined();
			expect(result).toBeInstanceOf(DatetimeResult);
		}
	});

	test("Last Day of Week", () => {
		const days = [
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
			"Sunday",
		];

		for (let i = 0; i < days.length; i++) {
			const day = days[i];

			const result = provider.provide(`Last ${day}`);
			expect(result).toBeDefined();
			expect(result).toBeInstanceOf(DatetimeResult);
		}
	});
});

describe("Date", () => {
	test("1/1/23", () => {
		const result = provider.provide("1/1/23");
		expect(result).toBeDefined();
		expect(result).toBeInstanceOf(DatetimeResult);
	});

	test("1/1/2023", () => {
		const result = provider.provide("1/1/2023");
		expect(result).toBeDefined();
		expect(result).toBeInstanceOf(DatetimeResult);
	});

	test("01/01/2023", () => {
		const result = provider.provide("01/01/2023");
		expect(result).toBeDefined();
		expect(result).toBeInstanceOf(DatetimeResult);
	});

	test("1-1-23", () => {
		const result = provider.provide("1-1-23");
		expect(result).toBeDefined();
		expect(result).toBeInstanceOf(DatetimeResult);
	});

	test("1-1-2023", () => {
		const result = provider.provide("1-1-2023");
		expect(result).toBeDefined();
		expect(result).toBeInstanceOf(DatetimeResult);
	});

	test("01-01-2023", () => {
		const result = provider.provide("01-01-2023");
		expect(result).toBeDefined();
		expect(result).toBeInstanceOf(DatetimeResult);
	});

	test("1.1.23", () => {
		const result = provider.provide("1.1.23");
		expect(result).toBeDefined();
		expect(result).toBeInstanceOf(DatetimeResult);
	});

	test("1.1.2023", () => {
		const result = provider.provide("1.1.2023");
		expect(result).toBeDefined();
		expect(result).toBeInstanceOf(DatetimeResult);
	});

	test("01.01.2023", () => {
		const result = provider.provide("01.01.2023");
		expect(result).toBeDefined();
		expect(result).toBeInstanceOf(DatetimeResult);
	});
});

describe("ISO8601", () => {
	test("1997-07-16", () => {
		const result = provider.provide("1997-07-16");
		expect(result).toBeDefined();
		expect(result).toBeInstanceOf(DatetimeResult);
	});

	test("1997-07-16T19:20:30", () => {
		const result = provider.provide("1997-07-16T19:20:30");
		expect(result).toBeDefined();
		expect(result).toBeInstanceOf(DatetimeResult);
	});

	test("1997-07-16T19:20:30.45Z", () => {
		const result = provider.provide("1997-07-16T19:20:30.45Z");
		expect(result).toBeDefined();
		expect(result).toBeInstanceOf(DatetimeResult);
	});

	test("1997-07-16T19:20:30.45", () => {
		const result = provider.provide("1997-07-16T19:20:30.45");
		expect(result).toBeDefined();
		expect(result).toBeInstanceOf(DatetimeResult);
	});

	test("1997-07-16T19:20:30.45+01:00", () => {
		const result = provider.provide("1997-07-16T19:20:30.45+01:00");
		expect(result).toBeDefined();
		expect(result).toBeInstanceOf(DatetimeResult);
	});

	test("1997-07-16T19:20:30.45-01:00", () => {
		const result = provider.provide("1997-07-16T19:20:30.45-01:00");
		expect(result).toBeDefined();
		expect(result).toBeInstanceOf(DatetimeResult);
	});
});

describe("Addition & Subtraction", () => {
	test("Now + 2 days", () => {
		const nowTwoDaysAhead = moment().add(2, "days");

		const result = provider.provide("Now + 2 days") as DatetimeResult;

		expect(result).toBeDefined();

		expect(result).toBeInstanceOf(DatetimeResult);

		const resultMoment = moment(result?.value);

		expect(resultMoment).toBeDefined();

		expect(resultMoment.isSameOrAfter(nowTwoDaysAhead)).toBeTruthy();
	});

	test("Now - 2 days", () => {
		const nowTwoDaysAgo = moment().subtract(2, "days");

		const result = provider.provide("Now - 2 days") as DatetimeResult;

		expect(result).toBeDefined();

		expect(result).toBeInstanceOf(DatetimeResult);

		const resultMoment = moment(result?.value);

		expect(resultMoment).toBeDefined();

		expect(resultMoment.isSameOrAfter(nowTwoDaysAgo)).toBeTruthy();
	});
});

describe("Functions", () => {
	test("years until (1 year from now)", () => {
		const inFuture = moment().add(1, "year");

		const prompt = `years until ${inFuture.format("DD/MM/YYYY")}`;

		const result = provider.provide(prompt) as StringResult;

		expect(result).toBeDefined();

		expect(result).toBeInstanceOf(StringResult);

		expect(result?.value).toMatch("1 year");
	});

	test("months until (3 months from now)", () => {
		const inFuture = moment().add(3, "months");

		const prompt = `months until ${inFuture.format("DD/MM/YYYY")}`;

		const result = provider.provide(prompt) as StringResult;

		expect(result).toBeDefined();

		expect(result).toBeInstanceOf(StringResult);

		expect(result?.value).toMatch("3 months");
	});

	test("weeks until (9 weeks from now)", () => {
		const inFuture = moment().add(9, "weeks");

		const prompt = `weeks until ${inFuture.format("DD/MM/YYYY")}`;

		const result = provider.provide(prompt) as StringResult;

		expect(result).toBeDefined();

		expect(result).toBeInstanceOf(StringResult);

		expect(result?.value).toMatch("9 weeks");
	});

	test("days until (10 days from now)", () => {
		const inFuture = moment().add(10, "days");

		const prompt = `days until ${inFuture.format("DD/MM/YYYY")}`;

		const result = provider.provide(prompt) as StringResult;

		expect(result).toBeDefined();

		expect(result).toBeInstanceOf(StringResult);

		expect(result?.value).toMatch("10 days");
	});

	test("years since (1 year from now)", () => {
		const inFuture = moment().subtract(1, "year");

		const prompt = `years since ${inFuture.format("DD/MM/YYYY")}`;

		const result = provider.provide(prompt) as StringResult;

		expect(result).toBeDefined();

		expect(result).toBeInstanceOf(StringResult);

		expect(result?.value).toMatch("1 year");
	});

	test("months since (3 months from now)", () => {
		const inFuture = moment().subtract(3, "months");

		const prompt = `months since ${inFuture.format("DD/MM/YYYY")}`;

		const result = provider.provide(prompt) as StringResult;

		expect(result).toBeDefined();

		expect(result).toBeInstanceOf(StringResult);

		expect(result?.value).toMatch("3 months");
	});

	test("weeks since (9 weeks from now)", () => {
		const inFuture = moment().subtract(9, "weeks");

		const prompt = `weeks since ${inFuture.format("DD/MM/YYYY")}`;

		const result = provider.provide(prompt) as StringResult;

		expect(result).toBeDefined();

		expect(result).toBeInstanceOf(StringResult);

		expect(result?.value).toMatch("9 weeks");
	});

	test("days since (100 days from now)", () => {
		const inPast = moment().subtract(100, "days");

		const prompt = `days since ${inPast.format("DD/MM/YYYY")}`;

		const result = provider.provide(prompt) as StringResult;

		expect(result).toBeDefined();

		expect(result).toBeInstanceOf(StringResult);

		expect(result?.value).toMatch("100 days");
	});
});
