const { Lexer } = require('./src/engine/lexer/Lexer');

const lexer = new Lexer();
lexer.reset(':x = 42');

console.log('Tokens for ":x = 42":');
let token = lexer.next();
while (token) {
    console.log(`  ${token.type}: "${token.value}"`);
    token = lexer.next();
}
