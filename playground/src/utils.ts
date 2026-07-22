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

/** Describe what an opcode does given its numeric value and arguments. */
export function describeOpcode(op: number, args: number[]): string {
  if (op >= 10 && op <= 15) return 'Push: ' + describePush(op);
  if (op >= 20 && op <= 27) return describeArith(op) + ' → stack';
  if (op === 1) return 'Halt';
  if (op === 2) return 'Swap top 2';
  if (op === 3) return 'Dup top';
  if (op === 50) return 'Call plugin fn[' + (args[0] ?? '?') + ']';
  if (op === 51) return 'Call builtin fn[' + (args[0] ?? '?') + ']';
  if (op === 60) return 'Load var[' + (args[0] ?? '?') + '] → stack';
  if (op === 61) return 'Store → var[' + (args[0] ?? '?') + ']';
  if (op === 200) return 'Plugin custom handler';
  return 'Op ' + op;
}

function describePush(op: number): string {
  switch (op) { case 10: return 'number'; case 11: return 'bigint'; case 12: return 'hex'; case 13: return 'string'; case 14: return 'boolean'; case 15: return 'variable'; default: return '?'; }
}

function describeArith(op: number): string {
  switch (op) { case 20: return 'Add'; case 21: return 'Sub'; case 22: return 'Mul'; case 23: return 'Div'; case 24: return 'Mod'; case 25: return 'Exp'; case 26: return 'Neg'; case 27: return 'Pos'; default: return '?'; }
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

/** Stage color map for dominant-stage coloring in flamegraphs. */
export const STAGE_COLORS: Record<string, string> = {
  Lexer: '#5ac8fa',
  Parser: '#9b7bec',
  Compile: '#4ec9b0',
  VM: '#ffd866',
  Overhead: '#6b6b75',
};

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
