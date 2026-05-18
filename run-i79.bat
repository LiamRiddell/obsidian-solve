@echo off
cd "D:\Obsidian Vaults\Plugin Development\.obsidian\plugins\obsidian-solve"
npx jest src/solve-js/__tests__/bugs/Issue79_percentOperatorPrecedence.spec.ts --no-coverage --verbose
echo EXIT_CODE: %ERRORLEVEL%