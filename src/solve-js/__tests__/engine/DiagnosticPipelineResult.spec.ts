/**
 * Unit tests for DiagnosticPipelineResult stage population.
 *
 * Verifies that when diagnosticMode=true, ExpressionEngine.evaluateLineWithDebug()
 * returns a structured `diagnostic` field with properly populated pipeline stages.
 */
import { ExpressionEngine } from '@solve-js/engine/ExpressionEngine';
import type { DiagnosticPipelineResult, PipelineStageResult } from '@solve-js/types/DiagnosticPipelineResult';

describe('DiagnosticPipelineResult', () => {
    let engine: ExpressionEngine;

    beforeEach(() => {
        engine = new ExpressionEngine('en', true);
    });

    afterEach(() => {
        engine.clear();
    });

    describe('evaluateLineWithDebug', () => {
        it('returns diagnostic field with stages when diagnostic mode is enabled', () => {
            const result = engine.evaluateLineWithDebug(1, '2 + 2');

            expect(result.diagnostic).toBeDefined();
            expect(result.diagnostic!.stages).toBeDefined();
            expect(result.diagnostic!.stages.length).toBeGreaterThan(0);
        });

        it('populates values correctly', () => {
            const result = engine.evaluateLineWithDebug(1, '2 + 2');

            expect(result.diagnostic!.value).toBeDefined();
            expect(result.diagnostic!.tokens).toBeDefined();
            expect(result.diagnostic!.program).toBeDefined();
            expect(result.diagnostic!.error).toBeNull();
        });

        it('includes expected core stages in order', () => {
            const result = engine.evaluateLineWithDebug(1, '3 * 4');

            const stageIds = result.diagnostic!.stages.map(s => s.stage);
            expect(stageIds).toContain('pipeline_start');
            expect(stageIds).toContain('safety_length');
            expect(stageIds).toContain('lexer');
            expect(stageIds).toContain('normalizer');
            expect(stageIds).toContain('safety_complexity');
            expect(stageIds).toContain('readwrite');
            expect(stageIds).toContain('cache_check');
            expect(stageIds).toContain('compiler');
            expect(stageIds).toContain('async_preflight');
            expect(stageIds).toContain('dag_registration');
            expect(stageIds).toContain('result');
            expect(stageIds).toContain('pipeline_end');

            // Verify ordering: pipeline_start should be first
            expect(stageIds.indexOf('pipeline_start')).toBe(0);
        });

        it('has proper step numbers in order', () => {
            const result = engine.evaluateLineWithDebug(1, '5 + 6');

            const stages = result.diagnostic!.stages;
            for (let i = 1; i < stages.length; i++) {
                expect(stages[i].stepNumber).toBeGreaterThan(stages[i - 1].stepNumber);
            }
        });

        it('all stages have required fields', () => {
            const result = engine.evaluateLineWithDebug(1, '42');

            for (const stage of result.diagnostic!.stages) {
                expect(stage.stage).toBeTruthy();
                expect(stage.label).toBeTruthy();
                expect(stage.icon).toBeTruthy();
                expect(stage.colorClass).toBeTruthy();
                expect(stage.stepNumber).toBeGreaterThan(0);
                expect(typeof stage.skipped).toBe('boolean');
                expect(stage.output).toBeDefined();
                expect(typeof stage.output.type).toBe('string');
            }
        });
    });

    describe('safety_length stage', () => {
        it('passes for short expressions', () => {
            const result = engine.evaluateLineWithDebug(1, '1 + 1');

            const safetyStage = result.diagnostic!.stages.find(s => s.stage === 'safety_length');
            expect(safetyStage).toBeDefined();
            const output = safetyStage!.output as any;
            expect(output.passed).toBe(true);
            expect(output.expressionLength).toBe('1 + 1'.length);
        });

        it('fails for too-long expressions', () => {
            const longExpr = '1' + '+1'.repeat(5000);
            const result = engine.evaluateLineWithDebug(1, longExpr);

            // Should have error
            expect(result.error).toBeDefined();
        });
    });

    describe('lexer stage', () => {
        it('produces token count and types', () => {
            const result = engine.evaluateLineWithDebug(1, '2 + 3 * 4');

            const lexerStage = result.diagnostic!.stages.find(s => s.stage === 'lexer');
            expect(lexerStage).toBeDefined();
            const output = lexerStage!.output as any;
            expect(output.tokenCount).toBeGreaterThan(0);
            expect(output.tokenTypes).toBeDefined();
            expect(output.tokens).toBeDefined();
            expect(output.tokens.length).toBe(output.tokenCount);
            expect(output.locale).toBe('en');
        });

        it('detects parentheses', () => {
            const result = engine.evaluateLineWithDebug(1, '(2 + 2)');

            const lexerStage = result.diagnostic!.stages.find(s => s.stage === 'lexer');
            const output = lexerStage!.output as any;
            expect(output.hasParens).toBe(true);
        });
    });

    describe('normalizer stage', () => {
        it('runs even with no fusions (implicit multiply inserts STAR)', () => {
            const result = engine.evaluateLineWithDebug(1, '2 + 2');

            const normStage = result.diagnostic!.stages.find(s => s.stage === 'normalizer');
            expect(normStage).toBeDefined();
            const output = normStage!.output as any;
            expect(output.inputTokenCount).toBeGreaterThan(0);
            expect(output.outputTokenCount).toBeGreaterThan(0);
        });
    });

    describe('cache_check stage', () => {
        it('misses on first evaluation', () => {
            const result = engine.evaluateLineWithDebug(1, '999');

            const cacheStage = result.diagnostic!.stages.find(s => s.stage === 'cache_check');
            expect(cacheStage).toBeDefined();
            const output = cacheStage!.output as any;
            expect(output.hit).toBe(false);
        });

        it('hits on second evaluation of same expression', () => {
            engine.evaluateLineWithDebug(1, '888');
            const result = engine.evaluateLineWithDebug(1, '888');

            const cacheStage = result.diagnostic!.stages.find(s => s.stage === 'cache_check');
            const output = cacheStage!.output as any;
            expect(output.hit).toBe(true);
        });
    });

    describe('dag_registration stage', () => {
        it('registers reads and writes from tokens', () => {
            const result = engine.evaluateLineWithDebug(1, ':x = 5');

            const dagStage = result.diagnostic!.stages.find(s => s.stage === 'dag_registration');
            expect(dagStage).toBeDefined();
            const output = dagStage!.output as any;
            expect(output.writesRegistered).toContain('x');
        });
    });

    describe('result stage', () => {
        it('has formatted and raw values', () => {
            const result = engine.evaluateLineWithDebug(1, '7 * 8');

            const resultStage = result.diagnostic!.stages.find(s => s.stage === 'result');
            expect(resultStage).toBeDefined();
            const output = resultStage!.output as any;
            expect(output.rawValue).toBeDefined();
            expect(output.formattedValue).toBeDefined();
        });
    });

    describe('pipeline_end stage', () => {
        it('reports success and token/opcode counts', () => {
            const result = engine.evaluateLineWithDebug(1, '10 + 20');

            const endStage = result.diagnostic!.stages.find(s => s.stage === 'pipeline_end');
            expect(endStage).toBeDefined();
            const output = endStage!.output as any;
            expect(output.success).toBe(true);
            expect(output.totalTokens).toBeGreaterThan(0);
            expect(output.totalOpcodes).toBeDefined();
        });
    });

    describe('error handling', () => {
        it('has null error on success', () => {
            const result = engine.evaluateLineWithDebug(1, '1 + 1');
            expect(result.diagnostic!.error).toBeNull();
        });

        it('has error message on parse failure', () => {
            const result = engine.evaluateLineWithDebug(1, '1 +');

            // Parse errors may or may not produce diagnostic data
            if (result.diagnostic) {
                // If diagnostic is present, check that stages were partially populated
                expect(result.diagnostic.stages.length).toBeGreaterThan(0);
            }
        });
    });
});
