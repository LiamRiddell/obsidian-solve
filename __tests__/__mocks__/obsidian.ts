/**
 * Mock for the "obsidian" package in Jest.
 *
 * The real `obsidian` npm package ships TypeScript declarations only (no
 * runtime implementation) — it's a devDependency purely so `tsc` can
 * typecheck against the plugin API. Node/Jest can't `require()` it.
 *
 * Only `moment` is re-exported for real: production code
 * (Datetime.ts, PluginSettings.ts) imports `{ moment } from "obsidian"`
 * instead of the npm `moment` package directly, so main.js doesn't bundle
 * a second copy of moment alongside Obsidian's own. In the real app,
 * Obsidian injects its bundled moment as this named export; in tests, the
 * real npm `moment` package (a devDependency) stands in for it — same
 * public API.
 *
 * Add further stubs here only as tests actually need them from files that
 * import "obsidian" (e.g. Notice, Plugin, App) — this is intentionally
 * minimal, not a full Obsidian API mock.
 */
export { default as moment } from "moment";
