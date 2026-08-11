/**
 * Named events emitted on the {@link PluginEventBus}.
 *
 * - `StatusBarUpdate` — status bar text or visibility changed.
 * - `WriteResultToActiveDocumentLine` — a result should be committed inline.
 * - `SolveEngineReady` — the engine has finished initializing.
 */
export enum EPluginEvent {
	StatusBarUpdate,
	WriteResultToActiveDocumentLine,
	SolveEngineReady,
}
