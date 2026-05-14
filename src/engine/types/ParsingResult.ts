import { Value } from "@/engine/vm/Value";

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
}

export interface UnifiedParsingOptions {
    inputType: 'markdown' | 'raw' | 'code';
    localeCode?: string;
    includeLineInfo?: boolean;
    includeHighlights?: boolean;
}

export interface ParseletInfo {
    tokenType: string;
    tokenValue: string;
    parseletType: string;
    tokenOffset: number;
}

export interface DebugInfo {
    tokens: any[];
    parselets: ParseletInfo[];
    program: any;
}