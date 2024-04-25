import { PreviousResultSubstitutionStage } from "@/pipelines/stages/expression/PreviousResultSubstitutionStage";
import { IExpressionProcessorState } from "@/pipelines/stages/expression/state/IExpressionProcessorState";
import { NumberResult } from "@/results/NumberResult";
import { beforeAll, describe, expect, test } from "@jest/globals";

let state: IExpressionProcessorState;
let stage: PreviousResultSubstitutionStage;

beforeAll(() => {
	state = {
		lineNumber: 0,
		originalLineText: "",
	};
	stage = new PreviousResultSubstitutionStage();
});

describe("Previous Result Substitution", () => {
	test("Single Previous Substitutation", () => {
		stage.setPreviousResult(new NumberResult(100));

		const substituted = stage.process(state, "12 + :prev");

		expect(substituted).toBeDefined();

		expect(substituted).toEqual("12 + 100");
	});

	test("Multiple Previous Substitutation", () => {
		stage.setPreviousResult(new NumberResult(34));

		const substituted = stage.process(state, ":prev + 12 + :prev");

		expect(substituted).toBeDefined();

		expect(substituted).toEqual("34 + 12 + 34");
	});

	test("Multiple Line Previous Substitutations", () => {
		stage.setPreviousResult(new NumberResult(34));
		const line1 = stage.process(state, ":prev + 12");
		expect(line1).toBeDefined();
		expect(line1).toEqual("34 + 12");

		stage.setPreviousResult(new NumberResult(24));
		const line2 = stage.process(state, ":prev + 12");
		expect(line2).toBeDefined();
		expect(line2).toEqual("24 + 12");

		stage.setPreviousResult(new NumberResult(12));
		const line3 = stage.process(state, ":prev + 12");
		expect(line3).toBeDefined();
		expect(line3).toEqual("12 + 12");
	});
});
