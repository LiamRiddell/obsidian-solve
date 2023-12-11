import { PreviousResultSubstitutionStage } from "@/pipelines/stages/PreviousResultSubstitutionStage";
import { beforeAll, describe, expect, test } from "@jest/globals";

let stage: PreviousResultSubstitutionStage;

beforeAll(() => {
	stage = new PreviousResultSubstitutionStage();
});

describe("Previous Result Substitution", () => {
	test("Single Previous Substitutation", () => {
		stage.setPreviousResultString("100");

		const substituted = stage.process("12 + $prev");

		expect(substituted).toBeDefined();

		expect(substituted).toEqual("12 + 100");
	});

	test("Multiple Previous Substitutation", () => {
		stage.setPreviousResultString("34");

		const substituted = stage.process("$prev + 12 + $prev");

		expect(substituted).toBeDefined();

		expect(substituted).toEqual("34 + 12 + 34");
	});

	test("Multiple Line Previous Substitutations", () => {
		stage.setPreviousResultString("34");
		const line1 = stage.process("$prev + 12");
		expect(line1).toBeDefined();
		expect(line1).toEqual("34 + 12");

		stage.setPreviousResultString("24");
		const line2 = stage.process("$prev + 12");
		expect(line2).toBeDefined();
		expect(line2).toEqual("24 + 12");

		stage.setPreviousResultString("12");
		const line3 = stage.process("$prev + 12");
		expect(line3).toBeDefined();
		expect(line3).toEqual("12 + 12");
	});
});
