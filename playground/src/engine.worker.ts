import { runEngine, DebugResult, Token } from './engine.js';

function serializeToken(t: Token): any {
    return { type: t.type, value: t.value, offset: t.offset };
}

self.onmessage = (e: MessageEvent<{ id: number; expression: string }>) => {
    const { id, expression } = e.data;
    try {
        const result = runEngine(expression);
        // Strip methods from Token objects (tokenToString breaks structured clone)
        const serialized: DebugResult = {
            ...result,
            tokens: result.tokens.map(serializeToken) as any,
            rawTokens: result.rawTokens.map(serializeToken) as any,
            lineResults: result.lineResults.map(lr => ({ ...lr })),
        };
        self.postMessage({ id, result: serialized });
    } catch (error) {
        self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    }
};
