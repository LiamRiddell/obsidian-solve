@echo off
cd "D:\Obsidian Vaults\Plugin Development\.obsidian\plugins\obsidian-solve"
npx jest src/solve-js/__tests__/bugs/Issue82_functionEqualSign.spec.ts --no-coverage
echo EXIT_CODE: %ERRORLEVEL%