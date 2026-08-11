/**
 * Plugin lifecycle state emitted alongside {@link EPluginEvent.StatusBarUpdate}.
 *
 * - `Idle` — no evaluation in progress.
 * - `Solving` — an expression is being evaluated.
 */
export enum EPluginStatus {
	Idle,
	Solving,
}
