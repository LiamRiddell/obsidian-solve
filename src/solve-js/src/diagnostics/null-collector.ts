import { DiagnosticCollector } from "./collector";
import { DiagnosticReport } from "./events";

/**
 * No-op collector used in production mode.
 * Returns undefined from getReport(), which is the correct signal
 * for "no diagnostic data available".
 */
export class NullDiagnosticCollector extends DiagnosticCollector {
  getReport(): DiagnosticReport | undefined { return undefined; }
  reset(): void {}
}