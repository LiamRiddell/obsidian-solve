@echo off
cd "D:\Obsidian Vaults\Plugin Development\.obsidian\plugins\obsidian-solve"
npx jest src/solve-js/__tests__/bugs/Issue81_percentageCalculation.spec.ts --no-coverage 2>&1
echo EXIT_CODE: %ERRORLEVEL%