import type { PerformanceStats, VmStackValue } from './engine.js';

/* ── Formatting ─────────────────────────────────────────────────── */

/** Format nanoseconds with auto-scaled units (ns → µs → ms → s). */
export function fmt(ns: number): string {
  if (ns < 1_000) return ns.toFixed(0) + ' ns';
  if (ns < 1_000_000) return (ns / 1_000).toFixed(1) + ' µs';
  if (ns < 1_000_000_000) return (ns / 1_000_000).toFixed(1) + ' ms';
  return (ns / 1_000_000_000).toFixed(2) + ' s';
}

/** Escape HTML entities to prevent XSS. */
export function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── Opcode Description ─────────────────────────────────────────── */

/**
 * Per-opcode-name descriptions, keyed by the real `OpCode` enum name
 * (already available on every disassembled row via `OpcodeInfo.name`).
 * Deriving from the name instead of the raw numeric value/range means
 * this stays correct even if opcodes are renumbered, and any opcode not
 * explicitly listed here still gets a readable fallback (see
 * `describeOpcode`) instead of a dead-end "Op N".
 */
const OPCODE_DESCRIPTIONS: Record<string, (args: number[]) => string> = {
  NOP: () => 'No-op',
  HALT: () => 'Halt — return top of stack',
  SWAP: () => 'Swap top 2 stack values',
  DUP: () => 'Duplicate top of stack',

  PUSH_NUMBER: (a) => `Push number[${a[0] ?? '?'}]`,
  PUSH_BIGINT: (a) => `Push bigint[${a[0] ?? '?'}]`,
  PUSH_HEX: (a) => `Push hex[${a[0] ?? '?'}]`,
  PUSH_STRING: (a) => `Push string[${a[0] ?? '?'}]`,
  PUSH_BOOLEAN: (a) => `Push boolean (${a[0] ? 'true' : 'false'})`,
  PUSH_VARIABLE: (a) => `Push variable[${a[0] ?? '?'}]`,

  ADD: () => 'Add top 2 → push sum',
  SUB: () => 'Subtract top 2 → push difference',
  MUL: () => 'Multiply top 2 → push product',
  DIV: () => 'Divide top 2 → push quotient',
  MOD: () => 'Modulo top 2 → push remainder',
  EXP: () => 'Exponentiate top 2 → push power',
  NEG: () => 'Negate top of stack',
  POS: () => 'Unary plus',

  LSHIFT: () => 'Bitwise left shift',
  RSHIFT: () => 'Bitwise right shift (arithmetic)',
  URSHIFT: () => 'Bitwise right shift (unsigned)',
  BIT_AND: () => 'Bitwise AND',
  BIT_OR: () => 'Bitwise OR',
  BIT_XOR: () => 'Bitwise XOR',
  BIT_NOT: () => 'Bitwise NOT',

  EQ: () => 'Equality comparison (==)',
  NEQ: () => 'Inequality comparison (!=)',
  LT: () => 'Less-than comparison (<)',
  LTE: () => 'Less-than-or-equal comparison (<=)',
  GT: () => 'Greater-than comparison (>)',
  GTE: () => 'Greater-than-or-equal comparison (>=)',

  CALL_PLUGIN: (a) => `Call plugin function[${a[0] ?? '?'}], argc=${a[1] ?? '?'}`,
  CALL_BUILTIN: (a) => `Call builtin function[${a[0] ?? '?'}], argc=${a[1] ?? '?'}`,
  RETURN: () => 'Return (reserved for future user-defined functions)',

  LOAD_VAR: (a) => `Load variable[${a[0] ?? '?'}] → stack`,
  STORE_VAR: (a) => `Store top of stack → variable[${a[0] ?? '?'}]`,

  TO_NUMBER: () => 'Convert top of stack to Number',
  TO_HEX: () => 'Convert top of stack to Hex',
  TO_PERCENTAGE: () => 'Convert top 2 values to a Percentage',

  UOM_CONVERT: () => 'Attach a unit to a plain number',
  UOM_CONVERT_TO: () => 'Convert value to a target unit ("X to Y")',
  UOM_GET_VALUE: () => 'Extract the numeric value from a unit value',
  UOM_BEST: () => 'Convert to the best-fit unit for its magnitude',
  UOM_CONVERT_IN: () => 'Convert value to a target unit ("X in Y")',

  DATE_NOW: () => 'Push the current date/time',
  DATE_ADD: () => 'Add a duration to a date',
  DATE_SUB: () => 'Subtract a duration from a date',

  ARR_NEW: (a) => `Build a new array from the top ${a[0] ?? '?'} stack values`,
  ARR_ADD: () => 'Element-wise array addition',
  ARR_SUB: () => 'Element-wise array subtraction',
  ARR_DOT: () => 'Vector dot product',
  ARR_CROSS: () => 'Vector cross product',
  ARR_SCALE: () => 'Scale array by a scalar',
  ARR_MAGNITUDE: () => 'Vector magnitude (length)',
  ARR_NORMALIZE: () => 'Normalize vector to unit length',
};

/** Describe what an opcode does given its enum name and decoded arguments. */
export function describeOpcode(name: string, args: number[]): string {
  const describe = OPCODE_DESCRIPTIONS[name];
  if (describe) return describe(args);
  // Unknown/new opcode not yet listed above — derive a readable fallback
  // from its name (e.g. "SOME_NEW_OP" -> "Some new op") instead of a
  // dead-end "Op N" that gives up on unrecognized numeric values.
  return name
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/* ── Performance ────────────────────────────────────────────────── */

/** Compute overhead time (total minus timed stages). */
export function computeOverhead(stats: PerformanceStats): number {
  const timed = stats.lexerTime + stats.parserTime + stats.bytecodeTime + stats.executionTime;
  return Math.max(0, stats.totalTime - timed);
}

/** Determine which stage dominates a PerformanceStats snapshot. */
export function getDominantStage(s: PerformanceStats): string {
  const stages: [string, number][] = [
    ['Lexer', s.lexerTime],
    ['Parser', s.parserTime],
    ['Compile', s.bytecodeTime],
    ['VM', s.executionTime],
    ['Overhead', computeOverhead(s)],
  ];
  let maxVal = -1;
  let dominant = 'Overhead';
  for (const [label, val] of stages) {
    if (val > maxVal) { maxVal = val; dominant = label; }
  }
  return dominant;
}

/**
 * Stage color map for dominant-stage coloring in flamegraphs, heatmaps,
 * and stat cards — the 5-phase timing model (Lexer/Parser/Compile/VM/
 * Overhead). Values match `--stage-lexer`/`--stage-parser`/
 * `--stage-compiler`/`--stage-vm` in `main.css`; kept as a JS mirror
 * (rather than read from computed CSS custom properties at runtime)
 * since these are also used inside inline SVG sparklines and canvas-free
 * style bindings where a plain hex string is simplest. This is the ONE
 * place these five colors are defined — do not hardcode them elsewhere.
 */
export const STAGE_COLORS: Record<string, string> = {
  Lexer: '#7bdff2',
  Parser: '#c7a9ff',
  Compile: '#90e0ef',
  VM: '#faff69',
  Overhead: '#6a6a6a',
};

/**
 * Stage color map for the AllocationTracker telemetry table's 6-phase
 * pipeline model (lexer/normalizer/parser/resolver/vm/orchestrator) —
 * a genuinely different taxonomy from `STAGE_COLORS` above (it has a
 * separate "normalizer" phase and no "compile"/"overhead" split), so it
 * gets its own map rather than being forced into the 5-phase one. Colors
 * still draw from the same underlying palette as `--stage-*` in main.css.
 */
export const TELEMETRY_STAGE_COLORS: Record<string, string> = {
  lexer: '#7bdff2',
  parser: '#c7a9ff',
  normalizer: '#90e0ef',
  vm: '#faff69',
  resolver: '#6a6a6a',
  orchestrator: '#b5e48c',
};

/**
 * Maps the engine's emoji stage icons (PipelineStageResult.icon, e.g. "⚡",
 * "🔤") to lucide-react component names, so every UI surface that renders a
 * pipeline stage shares one icon system without changing the shared
 * engine-side type. Deliberately plain strings, not component references:
 * this package is UI-framework-agnostic (no React/lucide-react dependency),
 * so the actual icon-name -> component lookup lives at the consuming
 * React layer (see webapp's PipelineStage.tsx).
 */
export const STAGE_EMOJI_TO_ICON: Record<string, string> = {
  '🛡️': 'Shield',
  '▶': 'Play',
  '🔤': 'Type',
  '📋': 'ListChecks',
  '🔄': 'RefreshCw',
  '💾': 'Save',
  '🌳': 'Network',
  '⚙️': 'Settings',
  '🔮': 'Clock',
  '⚡': 'Zap',
  '🔗': 'Link',
  '📦': 'Package',
  '✓': 'Check',
  '⏹': 'Square',
};

/** @returns the lucide-react icon name for a stage's emoji icon, falling back to the emoji itself if unmapped. */
export function stageIcon(emoji: string): string {
  return STAGE_EMOJI_TO_ICON[emoji] ?? emoji;
}

/** Format a millisecond duration to a human-readable string (e.g. "5m", "1h"). */
export function formatDuration(ms: number): string {
  if (ms === Infinity) return '∞';
  if (ms <= 0) return '0s';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  return `${hrs}h`;
}

/* ── VM Trace ───────────────────────────────────────────────────── */

/** Format a single stack value into a short, human-readable string. */
export function formatStackValue(v: VmStackValue): string {
  switch (v.type) {
    case 0: return String((v.value as number).toFixed(4).replace(/\.?0+$/, ''));
    case 1: return '0x' + (v.value as number).toString(16).toUpperCase();
    case 2: return String(v.value) + 'n';
    case 3: return '"' + escHtml(String(v.value)).slice(0, 30) + '"';
    case 4: return new Date(v.value as number).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    case 5: return ((v.value as number) * 100).toFixed(1) + '%';
    case 6: return (v.value as number).toFixed(2) + ' ' + (v.unit ?? '');
    case 7: return '[' + (v.value as number[]).map(n => n.toFixed(2).replace(/\.?0+$/, '')).join(', ') + ']';
    case 10: return v.value ? 'true' : 'false';
    case 11: return v.unit ?? 'unit';
    case 12: return '⏳';
    case 13: return '⚠' + String(v.unit ?? v.value ?? '');
    default: return '?' + String(v.value);
  }
}

/** Get a CSS class name for a stack value chip based on its ValueType. */
export function stackValueTypeClass(type: number): string {
  switch (type) {
    case 0: return 'vm-stack-number';
    case 1: return 'vm-stack-hex';
    case 2: return 'vm-stack-bigint';
    case 3: return 'vm-stack-string';
    case 4: return 'vm-stack-datetime';
    case 5: return 'vm-stack-percentage';
    case 6: return 'vm-stack-uom';
    case 7: return 'vm-stack-array';
    case 10: return 'vm-stack-boolean';
    default: return 'vm-stack-other';
  }
}
