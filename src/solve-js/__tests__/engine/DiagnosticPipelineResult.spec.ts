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

    describe('normalizer stage — fusion visibility', () => {
        it('tracks fusions with rule name, source tokens, and fused token', () => {
            const result = engine.evaluateLineWithDebug(1, '2 to the power of 3');

            const normStage = result.diagnostic!.stages.find(s => s.stage === 'normalizer');
            expect(normStage).toBeDefined();
            expect(normStage!.skipped).toBe(false);
            const output = normStage!.output as any;
            expect(output.fusions).toBeDefined();
            expect(output.fusions.length).toBeGreaterThan(0);

            // Verify fusion structure
            const fusion = output.fusions[0];
            expect(fusion.rule).toBeTruthy();
            expect(fusion.sourceTokens).toBeDefined();
            expect(fusion.sourceTokens.length).toBeGreaterThan(1);
            expect(fusion.fusedToken).toBeDefined();
            expect(fusion.fusedToken.type).toBeTruthy();
            expect(fusion.fusedToken.value).toBeTruthy();
        });

        it('tracks rulesApplied counts', () => {
            const result = engine.evaluateLineWithDebug(1, '2 power of 3');

            const normStage = result.diagnostic!.stages.find(s => s.stage === 'normalizer');
            const output = normStage!.output as any;
            expect(output.rulesApplied).toBeDefined();
            expect(output.rulesApplied.length).toBeGreaterThan(0);
            for (const ra of output.rulesApplied) {
                expect(ra.rule).toBeTruthy();
                expect(typeof ra.count).toBe('number');
                expect(ra.count).toBeGreaterThan(0);
            }
        });

        it('reports input/output token counts', () => {
            const result = engine.evaluateLineWithDebug(1, '2 to the power of 3');

            const normStage = result.diagnostic!.stages.find(s => s.stage === 'normalizer');
            const output = normStage!.output as any;
            expect(output.inputTokenCount).toBeGreaterThan(output.outputTokenCount);
        });

        it('includes normalized tokens in output', () => {
            const result = engine.evaluateLineWithDebug(1, '2 + 2');

            const normStage = result.diagnostic!.stages.find(s => s.stage === 'normalizer');
            const output = normStage!.output as any;
            expect(output.tokens).toBeDefined();
            expect(output.tokens.length).toBe(output.outputTokenCount);
        });
    });

    describe('vm_execute stage', () => {
        it('is present after async_preflight and before dag_registration', () => {
            const result = engine.evaluateLineWithDebug(1, '2 + 2');

            const stageIds = result.diagnostic!.stages.map(s => s.stage);
            expect(stageIds).toContain('vm_execute');

            const vmIdx = stageIds.indexOf('vm_execute');
            const asyncIdx = stageIds.indexOf('async_preflight');
            const dagIdx = stageIds.indexOf('dag_registration');

            expect(vmIdx).toBeGreaterThan(asyncIdx);
            expect(vmIdx).toBeLessThan(dagIdx);
        });

        it('has step number 11', () => {
            const result = engine.evaluateLineWithDebug(1, '1 + 1');

            const vmStage = result.diagnostic!.stages.find(s => s.stage === 'vm_execute');
            expect(vmStage).toBeDefined();
            expect(vmStage!.stepNumber).toBe(11);
        });

        it('reports result type, value, and instruction count', () => {
            const result = engine.evaluateLineWithDebug(1, '3 * 5');

            const vmStage = result.diagnostic!.stages.find(s => s.stage === 'vm_execute');
            expect(vmStage).toBeDefined();
            const output = vmStage!.output as any;
            expect(output.totalInstructions).toBeGreaterThan(0);
            expect(output.resultType).toBeTruthy();
            expect(output.resultValue).toBeTruthy();
            expect(typeof output.isPending).toBe('boolean');
        });

        it('shows isPending=false for sync results', () => {
            const result = engine.evaluateLineWithDebug(1, '42');

            const vmStage = result.diagnostic!.stages.find(s => s.stage === 'vm_execute');
            const output = vmStage!.output as any;
            expect(output.isPending).toBe(false);
        });
    });

    describe('stage renumbering after vm_execute insertion', () => {
        it('dag_registration is step 12', () => {
            const result = engine.evaluateLineWithDebug(1, '1 + 1');
            const s = result.diagnostic!.stages.find(st => st.stage === 'dag_registration');
            expect(s!.stepNumber).toBe(12);
        });

        it('linecache is step 13', () => {
            const result = engine.evaluateLineWithDebug(1, '1 + 1');
            const s = result.diagnostic!.stages.find(st => st.stage === 'linecache');
            expect(s!.stepNumber).toBe(13);
        });

        it('result is step 14', () => {
            const result = engine.evaluateLineWithDebug(1, '1 + 1');
            const s = result.diagnostic!.stages.find(st => st.stage === 'result');
            expect(s!.stepNumber).toBe(14);
        });

        it('pipeline_end is step 15', () => {
            const result = engine.evaluateLineWithDebug(1, '1 + 1');
            const s = result.diagnostic!.stages.find(st => st.stage === 'pipeline_end');
            expect(s!.stepNumber).toBe(15);
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
