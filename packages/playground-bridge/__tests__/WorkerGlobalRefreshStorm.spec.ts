/**
 * Regression coverage for the cross-tab global-variable refresh storm that
 * OOM-killed the webapp's browser tab.
 *
 * `global :x = ...` writes from inside the VM, and GlobalVariableStore
 * notifies its listeners synchronously. engine.worker.ts subscribes to that
 * store in order to refresh every OTHER open document. Originally it did so
 * INLINE — so each refresh re-ran the same STORE_GLOBAL_VAR opcode, which
 * re-entered the listener, which refreshed again. MAX_NOTIFY_DEPTH bounded
 * the recursion's depth (64) but never its breadth, making the work per
 * keystroke O((tabs × global-writes)^64). Measured before the fix: 65 full
 * engine runs for a single-tab document with one `global` line, and >5,000
 * for two tabs. Every one of those also posts a fully-serialized
 * DebugResult to the main thread, which is what actually exhausted memory.
 *
 * Two independent guards are asserted here, because either alone would
 * leave a hole:
 *  - the store no longer notifies when a write does not CHANGE the value
 *    (kills the common case, where re-evaluating rewrites the same value);
 *  - the worker defers refreshes to a macrotask and skips the document
 *    currently being evaluated (holds even when the value genuinely
 *    changes on every run).
 */

// Must be installed BEFORE importing the worker module: it assigns
// `self.onmessage` and calls `self.postMessage` at module scope.
// jest-setup.ts already aliases `self` to `globalThis`.
const posted: Array<Record<string, unknown>> = [];
(globalThis as unknown as { postMessage: (m: unknown) => void }).postMessage = (m) => {
	posted.push(m as Record<string, unknown>);
};

import "@bridge/engine.worker";

type WorkerScope = { onmessage: (e: { data: Record<string, unknown> }) => void };
const worker = globalThis as unknown as WorkerScope;

/** Deliver a message to the worker exactly as the main thread would. */
function send(data: Record<string, unknown>): void {
	worker.onmessage({ data });
}

/** Let the deferred refresh drain (and any follow-on generations) run. */
async function settle(): Promise<void> {
	for (let i = 0; i < 12; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

/** Results posted for a tab — one per full engine run, the thing that OOM'd. */
function resultsFor(tabId: string): Array<Record<string, unknown>> {
	return posted.filter((m) => m.tabId === tabId && m.result !== undefined);
}

let nextId = 1;
let nextSuffix = 0;
/** Unique per test — the store is a process-wide singleton and is never reset
 * here, because clear() would also drop the worker's module-level listener. */
function uniqueName(): string {
	return `storm${nextSuffix++}`;
}

beforeEach(() => {
	posted.length = 0;
});

describe("engine.worker cross-tab global refresh", () => {
	it("does not storm when one tab writes a global", async () => {
		const tab = "tab-single";
		send({ id: nextId++, tabId: tab, expression: `global :${uniqueName()} = 5`, stream: true });
		await settle();

		// Before the fix this was 65 engine runs for this exact input.
		expect(resultsFor(tab).length).toBeLessThanOrEqual(2);

		send({ tabId: tab, close: true });
	});

	it("does not storm when two tabs each write a global", async () => {
		const a = "tab-a";
		const b = "tab-b";
		const nameA = uniqueName();
		const nameB = uniqueName();

		send({ id: nextId++, tabId: a, expression: `global :${nameA} = 5`, stream: true });
		await settle();
		send({ id: nextId++, tabId: b, expression: `global :${nameB} = 7`, stream: true });
		await settle();

		// Before the fix, two tabs blew past 5,000 engine runs.
		expect(posted.filter((m) => m.result !== undefined).length).toBeLessThan(12);

		send({ tabId: a, close: true });
		send({ tabId: b, close: true });
	});

	it("never refreshes re-entrantly — the refresh lands after evaluation unwinds", async () => {
		const writer = "tab-writer";
		const reader = "tab-reader";
		const name = uniqueName();

		// Give the reader tab a document that depends on the global.
		send({ id: nextId++, tabId: reader, expression: `global :${name} + 1`, stream: false });
		await settle();
		posted.length = 0;

		// The write happens deep inside this synchronous call. Nothing for
		// the OTHER tab may be posted before it returns — that synchronous
		// re-entry is precisely what recursed.
		send({ id: nextId++, tabId: writer, expression: `global :${name} = 42`, stream: true });
		expect(resultsFor(reader)).toHaveLength(0);

		// ...but the refresh must still happen, exactly once, once deferred.
		await settle();
		expect(resultsFor(reader)).toHaveLength(1);

		send({ tabId: writer, close: true });
		send({ tabId: reader, close: true });
	});

	it("stays bounded under rapid edits that CHANGE the global every time", async () => {
		// The value-equality guard in GlobalVariableStore cannot help here —
		// every edit writes a genuinely new value, so every write really does
		// notify. What keeps this bounded is purely the worker's deferral +
		// self-exclusion. This is the keystroke pattern that killed the tab.
		const writer = "tab-hammer-w";
		const reader = "tab-hammer-r";
		const name = uniqueName();

		send({ id: nextId++, tabId: reader, expression: `global :${name} + 1`, stream: false });
		await settle();
		posted.length = 0;

		const EDITS = 25;
		for (let i = 1; i <= EDITS; i++) {
			send({ id: nextId++, tabId: writer, expression: `global :${name} = ${i}`, stream: true });
			await settle();
		}

		// One refresh of the reader per edit is the correct amount of work.
		// Anything super-linear is the storm coming back.
		const total = posted.filter((m) => m.result !== undefined).length;
		expect(total).toBeLessThanOrEqual(EDITS * 3);

		send({ tabId: writer, close: true });
		send({ tabId: reader, close: true });
	});

	it("stops refreshing a tab once it is closed", async () => {
		const writer = "tab-writer-2";
		const closed = "tab-closed";
		const name = uniqueName();

		send({ id: nextId++, tabId: closed, expression: `global :${name} + 1`, stream: false });
		await settle();

		send({ tabId: closed, close: true });
		posted.length = 0;

		send({ id: nextId++, tabId: writer, expression: `global :${name} = 99`, stream: true });
		await settle();

		// A closed document must not keep being re-evaluated forever.
		expect(resultsFor(closed)).toHaveLength(0);

		send({ tabId: writer, close: true });
	});
});
