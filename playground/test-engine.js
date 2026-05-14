// Simple test script to verify the engine works
const { ExpressionLexer } = require('../src/engine/lexer/ExpressionLexer');
const { Parser } = require('../src/engine/parser/Parser');
const { ParseletRegistry } = require('../src/engine/parser/registry/ParseletRegistry');
const { BytecodeBuilder } = require('../src/engine/parser/BytecodeBuilder');
const { createVM, executeBytecode } = require('../src/engine/vm/VM');
const { sharedOpRegistry } = require('../src/engine/vm/OpRegistry');

// Import parselet registration functions
const { registerArithmeticParselets } = require('../src/providers/arithmetic/parselets/index');

// Create registry and register parselets
const registry = new ParseletRegistry();
registerArithmeticParselets(registry);

// Test expression
const expression = '10 + 5 * 2';

// Tokenize
const lexer = new ExpressionLexer();
lexer.reset(expression);
const tokens = [];
let token = lexer.next();
while (token) {
    tokens.push(token);
    token = lexer.next();
}

console.log('Tokens:', tokens.map(t => ({ type: t.type, value: t.value })));

// Parse
const parser = new Parser(registry);
parser.load(tokens);

const builder = new BytecodeBuilder();
parser.parseExpression(0, builder);

const bytecodeProgram = builder.build();
console.log('Bytecode:', bytecodeProgram);

// Execute
const vm = createVM(sharedOpRegistry);
const bytecode = {
    opcodes: new Uint8Array(bytecodeProgram.opcodes),
    numbers: new Float64Array(bytecodeProgram.numbers),
    strings: bytecodeProgram.strings
};
const result = executeBytecode(bytecode, vm);
console.log('Result:', result ? result.toString() : 'undefined');

console.log('\nTest completed successfully!');