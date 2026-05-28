# Plan 03: Parser Optimizations

## Status: DONE ✅

## Analysis

`Parser.ts` (~170 lines) handles Pratt parsing. Key findings:

### Hot Path (parseExpression → infix while loop)
The infix parselet loop is the inner loop for every expression:
```
while (this.current < this.tokens.length) {
    const nextToken = this.peek();
    const infixParselet = this.parseletRegistry.getInfix(nextToken.type);
    if (!infixParselet || infixParselet.getBindingPower() <= bindingPower) break;
    this.advance();
    infixParselet.parse(this, token, nextToken, builder);
}
```

### Optimization 1: Skip balanceParens() for already-balanced expressions
`balanceParens()` always creates a copy of the tokens array. We can count open/close parens
during the copy phase and skip the copy+rebalance when balanced. Track paren count during
loading via a simple `balanceDelta` and only rebalance when needed.

### Optimization 2: Inline peek() in parseExpression hot path
The `peek()` call in the while loop can be replaced with `this.tokens[this.current]`.
The `advance()` call can be replaced with `this.current++`.

### Optimization 3: Remove unnecessary DiagnosticPipeline null checks
The `hasCollectors` guard is already checked before calling `fireParseletMatched`, but
the method itself does a redundant check. Remove the duplicate.

## Changes Made

1. **Skip `balanceParens()` for balanced expressions**: Track paren delta during token loading.
   Only allocate a new array and balance when openCount !== 0. ~95%+ of expressions are balanced,
   saving an array copy on every parse.

2. **Inline hot-path peek/advance**: Replaced `this.peek()` with `this.tokens[this.current]` and
   `this.advance()` with `this.current++` in `parseExpression()` infix loop.

3. **Remove duplicate `hasCollectors` check in `fireParseletMatched()`**: The caller already
   checks `hasCollectors` so the method-internal check is redundant.

4. **Cache `this.tokens` reference locally**: Cached as `const tokens = this.tokens` at the
   top of `parseExpression()` to avoid repeated property lookups.

## Performance Impact (estimated)
- Zero-copy for balanced expressions: ~5-10% improvement for token loading
- Inlined property access: ~2-3% improvement in parse loop
- Total expected: ~5-10% parse throughput improvement
