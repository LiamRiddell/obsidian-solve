import { describe, expect, test } from "@jest/globals";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * The scheduled pickup of a new solve-engine release (#99).
 *
 * The engine removed the dispatch it sent when it released, so nothing started
 * `engine-update.yml` when a release landed. It now runs on a schedule. These
 * read the workflow as text and check what has to stay true of it: it runs
 * daily without being told a version, it still stops when nothing changed, and
 * the build and test gate still stands between an engine release and a tag.
 *
 * The boundary: this checks the file, not a run. A run is proven on the
 * schedule itself, and by dispatching the workflow by hand.
 */

const text = fs.readFileSync(path.join(__dirname, "..", "..", ".github", "workflows", "engine-update.yml"), "utf8");
const code = text.split("\n").filter((line) => !line.trim().startsWith("#")).join("\n");

/** The index of a step's first line in the workflow, or -1. */
const at = (needle: string): number => code.indexOf(needle);

describe("engine-update.yml", () => {
	test("runs once a day on a schedule, off the hour", () => {
		const crons = [...code.matchAll(/- cron: "([^"]+)"/g)].map((m) => m[1]);
		expect(crons).toHaveLength(1);
		const [minute, hour, dayOfMonth, month, dayOfWeek] = crons[0].split(" ");
		expect([dayOfMonth, month, dayOfWeek]).toEqual(["*", "*", "*"]);
		expect(minute).toMatch(/^\d+$/);
		expect(Number(minute)).toBeGreaterThan(0);
		expect(hour).toMatch(/^\d+$/);
	});

	test("a scheduled run has no version and so installs whatever is latest on npm", () => {
		expect(code).toContain('version="${DISPATCH_VERSION:-$INPUT_VERSION}"');
		expect(code).toContain('version="$(npm view solve-engine version)"');
	});

	test("does nothing when the installed engine is already the latest", () => {
		expect(code).toContain("Stop if the engine version did not change");
		expect(code).toContain("git diff --quiet -- package.json package-lock.json");
		// Every step past the check is guarded by it.
		for (const step of ["run: npm run build", "run: npm run test:ci", "npm version patch", "Commit and tag"]) {
			const i = at(step);
			expect(i).toBeGreaterThan(-1);
			expect(code.slice(Math.max(0, i - 260), i)).toContain("steps.changed.outputs.changed == 'true'");
		}
	});

	test("the build and the tests still run, in that order, before the version is bumped and the tag pushed", () => {
		const order = [at("run: npm run build"), at("run: npm run test:ci"), at("npm version patch"), at("git push origin main"), at('git push origin "$tag"')];
		expect(order.every((i) => i > -1)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
	});

	test("one run at a time, so two cannot race for the same version and tag", () => {
		expect(code).toMatch(/concurrency:\s+group: engine-update\s+cancel-in-progress: false/);
	});

	test("the schedule is not the only way in: a hand-started run can still name a version", () => {
		expect(code).toContain("workflow_dispatch:");
		expect(code).toMatch(/inputs:\s+version:/);
	});

	test("the header says what really starts the workflow, not the dispatch the engine stopped sending", () => {
		expect(text).toContain("schedule, once a day");
		expect(text).toContain("#267");
		expect(text).not.toMatch(/the normal path\.\s*\n#   · workflow_dispatch/);
	});

	test("adversarial: the schedule trigger adds no input an outsider could set, and the token stays behind a secret", () => {
		expect(code.match(/schedule:/g)).toHaveLength(1);
		expect(code).toContain("token: ${{ secrets.ENGINE_UPDATE_TOKEN }}");
		expect(code).not.toMatch(/ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/);
		// An event's version is read through env in the step that resolves it. Later steps use that
		// step's output, as before; this change does not widen who can set it.
		expect(code).toMatch(/env:\s+DISPATCH_VERSION: \$\{\{ github\.event\.client_payload\.version \}\}/);
	});
});
