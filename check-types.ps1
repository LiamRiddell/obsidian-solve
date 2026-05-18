$pwd = "D:\Obsidian Vaults\Plugin Development\.obsidian\plugins\obsidian-solve"
Push-Location $pwd
npx tsc --noEmit 2>&1
Pop-Location