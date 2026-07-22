/**
 * Multiplex an optional caller AbortSignal with a hard timeout into a single
 * AbortSignal suitable for fetch().
 *
 * Implemented manually rather than with AbortSignal.any()/AbortSignal.timeout()
 * (Chrome 116+) to stay compatible with the TypeScript lib targets used by
 * this project.
 *
 * Handles the already-aborted caller: addEventListener("abort", …) on a signal
 * that has already fired never invokes the listener, so without the upfront
 * `aborted` check the fetch would proceed even though the caller cancelled.
 */
export function createTimeoutSignal(
	callerSignal: AbortSignal | undefined,
	timeoutMs: number,
	label: string,
): { signal: AbortSignal; cleanup: () => void } {
	const controller = new AbortController();

	if (callerSignal?.aborted) {
		controller.abort(callerSignal.reason);
		return { signal: controller.signal, cleanup: () => { /* nothing armed */ } };
	}

	const timeoutId = setTimeout(
		() => controller.abort(new DOMException(`${label} timed out after ${timeoutMs}ms`, "TimeoutError")),
		timeoutMs,
	);

	let onCallerAbort: (() => void) | undefined;
	if (callerSignal) {
		onCallerAbort = () => {
			clearTimeout(timeoutId);
			try { controller.abort(callerSignal.reason); } catch { /* already aborted */ }
		};
		callerSignal.addEventListener("abort", onCallerAbort, { once: true });
	}

	return {
		signal: controller.signal,
		cleanup: () => {
			clearTimeout(timeoutId);
			if (callerSignal && onCallerAbort) {
				callerSignal.removeEventListener("abort", onCallerAbort);
			}
		},
	};
}
