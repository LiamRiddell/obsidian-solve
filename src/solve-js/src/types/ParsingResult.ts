import { Value } from "@solve-js/vm/Value";
import { DiagnosticReportJSON } from "@solve-js/diagnostics";
import type { Token } from "@solve-js/lexer/Token";
import type { BytecodeProgram } from "@solve-js/parser/BytecodeBuilder";

export interface InlineSolvePosition {
    start: number;
    end: number;
    expression: string;
    lineNumber: number;
    columnNumber: number;
    result?: Value | null;
    error?: string | null;
}

export interface ParsedLine {
    lineNumber: number;
    text: string;
    startPosition: number;
    endPosition: number;
    isEmpty: boolean;
    hasInlineSolves: boolean;
    inlineSolves: InlineSolvePosition[];
    expression: string | null;
    result: Value | null;
    error: string | null;
}

export interface ParsingResult {
    lines: ParsedLine[];
    totalLines: number;
    errors: string[];
    diagnostics?: DiagnosticReportJSON;
}

export interface UnifiedParsingOptions {
    inputType: 'markdown' | 'raw' | 'code';
    localeCode?: string;
    includeLineInfo?: boolean;
    includeHighlights?: boolean;
    includeDiagnostics?: boolean;
}

export interface ParseletInfo {
    tokenType: string;
    tokenValue: string;
    parseletType: string;
    tokenOffset: number;
}

export interface DebugInfo {
    tokens: Token[];
    parselets: ParseletInfo[];
    program: BytecodeProgram;
    lineNumber?: number;
    timestamp?: number;
    cacheHit?: boolean;
}
