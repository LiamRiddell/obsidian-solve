1. Internatisionalion support
2. Output formatting used to use user settings
3. Engine should handle everything the pipelines do, lexer can be so much faster at dealing with that. We could use moo lexel levels for handing inline?
4. You didn't truly migrate all of the ohm grammars rules. For example none of the word based varitions are missing. YOu need to go through each provider in github and extend each parslet for full coverage in new engine without any regression. https://github.com/LiamRiddell/obsidian-solve/wiki/Core-Providers all the providers should have a test for every rule. As seen in the current main of repo https://github.com/LiamRiddell/obsidian-solve/tree/main/test/providers
5. When using community API a plugin should be able to define many things under one package for example multiple rules or providers, etc.. not just register one handler as one plugin and then another plugin, etc.. I'd imagine people would make solve-runescape-parslet that would provide many grammar rules, etc..
6. Now that you removed AST how are you handling the original functionality of the human readable output?
7. Vector parslet deviates from the original implementation a vector is defined as (x,y,n+1) not [1, 2, 3] this would be used for an array in the future if we support it
8. Big integer tests are missing for that parselet
9. Test the hell out of the vm, the more tests the better to be honest for everything.
10. Document parsing tests should be added and lexer tests. The lexer needs to handle anything without crashing, incomplete code, words, markdown, etc.. It currently needs full support of the markdown version and superset used by obsidian, it should handle mathjax and other shite like that. On top of that we need to make sure markdown has full support and we can replace the bad current node skipper at a post lexer level this would allow us to parse big documents really fast. Focus on optmisation here and use the moo lexer levels. For example if it's a comment we know we can skip the line, etc..
11. Is there a way we could build on top of the base opcode producer for the vm that is more intuitive for humans? For example they write a rules in a grammar-esque style and we compile it to the final opcode representation?
12. Optmisation is key but not at the cost of regression, we're making bigger and better.
13. The lexer need to be extendable and broken up into what makes sense following best practices of lexer writing.
14. Units of Measurement parslet doesn't handle all of the original providers functionality to be honest none of the providers you migrated do. Everything needs checking for regression. You'll need to use git comamnds for that.

For this work reasearch everything on the web, write test, ask questions for clarity. Commit in blocks.
