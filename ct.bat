@echo off
cd "D:\Obsidian Vaults\Plugin Development\.obsidian\plugins\obsidian-solve"
npx tsc --noEmit 2> errors.txt
echo EXIT CODE: %ERRORLEVEL%
findstr /v "bignumber" errors.txt | findstr /v "__WORKER_URL__"
echo.
echo All non-bignumber, non-WORKER_URL errors shown above.