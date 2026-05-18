@echo off
cd "D:\Obsidian Vaults\Plugin Development\.obsidian\plugins\obsidian-solve"
npx jest --testPathPattern="src/solve-js/__tests__/engine" --no-coverage 2>&1
echo.
echo EXIT CODE: %ERRORLEVEL%