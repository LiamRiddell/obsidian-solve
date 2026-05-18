@echo off
cd "D:\Obsidian Vaults\Plugin Development\.obsidian\plugins\obsidian-solve"
npx jest src/solve-js/__tests__/engine src/solve-js/__tests__/bugs/Issue75_millionsSeparator.spec.ts src/solve-js/__tests__/bugs/Issue81_percentageCalculation.spec.ts --no-coverage 2>&1 | findstr /v "bignumber" | findstr /v "__WORKER_URL__" | findstr /v "Cannot find name"
echo EXIT_CODE: %ERRORLEVEL%