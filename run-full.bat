@echo off
cd "D:\Obsidian Vaults\Plugin Development\.obsidian\plugins\obsidian-solve"
npx jest --no-coverage 2>&1
echo EXIT_CODE: %ERRORLEVEL%