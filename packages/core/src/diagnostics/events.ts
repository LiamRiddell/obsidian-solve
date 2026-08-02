

import type { MatrixData, RangeData } from "@solve-js/vm/Value";
import type { SymbolicNode } from "@solve-js/vm/Symbolic";

/**
 * Diagnostic event types as string constants (not const enum — for cross-module compatibility with isolatedModules)
 */
export const DiagnosticEventType = {
  TokenEmitted: "token_emitted",
  NormalizerStart: "normalizer_start",
  TokenFused: "token_fused",
  NormalizerEnd: "normalizer_end",
  ParseletMatched: "parselet_matched",
  BytecodeBuilt: "bytecode_built",
  VmStep: "vm_step",
  VmHalt: "vm_halt",
  CacheHit: "cache_hit",
  CacheMiss: "cache_miss",
  PipelineStart: "pipeline_start",
  PipelineEnd: "pipeline_end",
} as const;

export type EventType = (typeof DiagnosticEventType)[keyof typeof DiagnosticEventType];

/** Base event — all events include a timestamp relative to pipeline start */
export interface BaseEvent {
  readonly type: string;
  readonly elapsedNs: number;
  readonly expression: string;
}

/** Emitted after each token is produced by the lexer */
export interface TokenEmittedEvent extends BaseEvent {
  readonly type: "token_emitted";
  readonly token: {
    readonly type: string;
    readonly value: string;
    readonly offset: number;
    readonly line: number;
    readonly col: number;
  };
}

/** Emitted when the parser resolves a parselet for a token */
export interface ParseletMatchedEvent extends BaseEvent {
  readonly type: "parselet_matched";
  readonly tokenType: string;
  readonly tokenValue: string;
  readonly parseletCategory: string;
  readonly parseletType: string;
  readonly isPrefix: boolean;
  readonly bindingPower?: number;
  readonly tokenOffset: number;
}

/** Emitted after bytecode is built */
export interface BytecodeBuiltEvent extends BaseEvent {
  readonly type: "bytecode_built";
  readonly opcodesLength: number;
  readonly numbersLength: number;
  readonly stringsLength: number;
  readonly isCached: boolean;
}

/** Emitted after each VM opcode execution (only when vmTrace is enabled) */
export interface VmStepEvent extends BaseEvent {
  readonly type: "vm_step";
  readonly opcode: number;
  readonly opcodeName: string;
  readonly ip: number;
  readonly stackDepth: number;
  readonly instructionNumber: number;
  readonly stack: ReadonlyArray<{
    readonly type: number;
    readonly value: number | bigint | string | boolean | MatrixData | RangeData | SymbolicNode;
    readonly unit?: string;
  }>;
}

/** Emitted when the VM halts with a result */
export interface VmHaltEvent extends BaseEvent {
  readonly type: "vm_halt";
  readonly result?: {
    readonly type: number;
    readonly value: number | bigint | string | boolean | MatrixData | RangeData | SymbolicNode;
    readonly unit?: string;
  };
}

/** Emitted on cache hit */
export interface CacheHitEvent extends BaseEvent {
  readonly type: "cache_hit";
  readonly cache: "bytecode" | "line";
  readonly key: string;
}

/** Emitted on cache miss */
export interface CacheMissEvent extends BaseEvent {
  readonly type: "cache_miss";
  readonly cache: "bytecode" | "line";
  readonly key: string;
}

/** Emitted when a pipeline evaluation begins */
export interface PipelineStartEvent extends BaseEvent {
  readonly type: "pipeline_start";
  readonly inputType: string;
}

/** Emitted when a pipeline evaluation completes */
export interface PipelineEndEvent extends BaseEvent {
  readonly type: "pipeline_end";
  readonly success: boolean;
  readonly error?: string;
  readonly totalTokens: number;
  readonly totalOpcodes: number;
}

/** Emitted when the normalizer begins its pass */
export interface NormalizerStartEvent extends BaseEvent {
  readonly type: "normalizer_start";
  readonly inputTokenCount: number;
}

/** Emitted when the normalizer fuses tokens */
export interface TokenFusedEvent extends BaseEvent {
  readonly type: "token_fused";
  readonly ruleName: string;
  readonly sourceTokenCount: number;
  readonly fusedTokenType: string;
  readonly fusedTokenValue: string;
}

/** Emitted when the normalizer completes its pass */
export interface NormalizerEndEvent extends BaseEvent {
  readonly type: "normalizer_end";
  readonly outputTokenCount: number;
  readonly fusionsCount: number;
}

/** Union of all event types */
export type DiagnosticEvent =
  | TokenEmittedEvent
  | NormalizerStartEvent
  | TokenFusedEvent
  | NormalizerEndEvent
  | ParseletMatchedEvent
  | BytecodeBuiltEvent
  | VmStepEvent
  | VmHaltEvent
  | CacheHitEvent
  | CacheMissEvent
  | PipelineStartEvent
  | PipelineEndEvent;

/** Categorized parselet info */
export interface CategorizedParselet {
  readonly tokenType: string;
  readonly tokenValue: string;
  readonly parseletCategory: string;
  readonly parseletType: string;
  readonly isPrefix: boolean;
  readonly bindingPower?: number;
  readonly tokenOffset: number;
}

/** JSON-serializable representation of a DiagnosticReport */
export interface DiagnosticReportJSON {
   readonly events: readonly DiagnosticEvent[];
   readonly parselets: readonly CategorizedParselet[];
   readonly summary: {
     readonly totalTokens: number;
     readonly totalParselets: number;
     readonly totalOpcodes: number;
     readonly cacheHit: boolean;
     readonly elapsedNs: number;
     readonly parseCategories: Record<string, number>;
   };
   readonly metadata: {
     readonly expression: string;
     readonly inputType: string;
     readonly timestamp: number;
     readonly vmTraceEnabled: boolean;
   };
}

/** Structured diagnostic report */
export interface DiagnosticReport {
   readonly events: readonly DiagnosticEvent[];
   readonly parselets: readonly CategorizedParselet[];
   readonly summary: {
     readonly totalTokens: number;
     readonly totalParselets: number;
     readonly totalOpcodes: number;
     readonly cacheHit: boolean;
     readonly elapsedNs: number;
     readonly parseCategories: ReadonlyMap<string, number>;
   };
   readonly metadata: {
     readonly expression: string;
     readonly inputType: string;
     readonly timestamp: number;
     readonly vmTraceEnabled: boolean;
   };

   /** Serialize to a JSON-safe plain object */
   toJSON(): DiagnosticReportJSON;
}

/** JSON-serializable representation of a DiagnosticReport */
export interface DiagnosticReportJSON {
   readonly events: readonly DiagnosticEvent[];
   readonly parselets: readonly CategorizedParselet[];
   readonly summary: {
     readonly totalTokens: number;
     readonly totalParselets: number;
     readonly totalOpcodes: number;
     readonly cacheHit: boolean;
     readonly elapsedNs: number;
     readonly parseCategories: Record<string, number>;
   };
   readonly metadata: {
     readonly expression: string;
     readonly inputType: string;
     readonly timestamp: number;
     readonly vmTraceEnabled: boolean;
   };
}