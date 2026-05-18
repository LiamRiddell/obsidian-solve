@echo off
cd "D:\Obsidian Vaults\Plugin Development\.obsidian\plugins\obsidian-solve"
npx jest src/solve-js/__tests__/engine --no-coverage 2>&1 | findstr /v "bignumber" | findstr /v "__WORKER_URL__" | findstr /v "Cannot find name"
echo EXIT_CODE: %ERRORLEVEL%