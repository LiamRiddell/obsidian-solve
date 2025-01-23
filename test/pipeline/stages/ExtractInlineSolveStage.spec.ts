import { ExtractInlineSolveStage } from "@/pipelines/stages/expression/ExtractInlineSolveState";
import { IExpressionProcessorState } from "@/pipelines/stages/expression/state/IExpressionProcessorState";
import { beforeAll, describe, expect, test } from "@jest/globals";

let state: IExpressionProcessorState;
let stage: ExtractInlineSolveStage;

beforeAll(() => {
	state = {
		lineNumber: 0,
		originalLineText: "",
	};
	stage = new ExtractInlineSolveStage();
});

describe("Inline Solve", () => {
	test("Single Inline", () => {
		const request = "s`1 + 2`";
		state.originalLineText = request;
		const result = stage.process(state, [request]);
		expect(result).toBeDefined();
		expect(result).toEqual(["1 + 2"]);
	});

	test("Multiple Inline", () => {
		const request = "s`1 + 2` & s`2 - 1`";
		state.originalLineText = request;
		const result = stage.process(state, [request]);
		expect(result).toBeDefined();
		expect(result).toEqual(["1 + 2", "2 - 1"]);
	});

	test("Single Variable", () => {
		const request = "s`:var + 1`";
		state.originalLineText = request;
		const result = stage.process(state, [request]);
		expect(result).toBeDefined();
		expect(result).toEqual([":var + 1"]);
	});

	test("Multiple Variables", () => {
		const request = "s`:var + 1` & s`:var2 - 1`";
		state.originalLineText = request;
		const result = stage.process(state, [request]);
		expect(result).toBeDefined();
		expect(result).toEqual([":var + 1", ":var2 - 1"]);
	});
});