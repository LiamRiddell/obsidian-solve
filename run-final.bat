@echo off
cd "D:\Obsidian Vaults\Plugin Development\.obsidian\plugins\obsidian-solve"
npx jest --no-coverage 2>&1 | findstr /R "^Test Suites:|^Tests:"
echo EXIT_CODE: %ERRORLEVEL%