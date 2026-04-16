# solopreneur

## Release rule

每次要 push 到 `main` 之前，必做兩件事：

1. **Bump version** in `.claude-plugin/plugin.json`
   - bug fix / docs / refactor → patch（`0.1.5` → `0.1.6`）
   - 新 skill / agent / 對外行為新增 → minor（`0.1.5` → `0.2.0`）
   - breaking change → major（`0.x` → `1.0`）
2. **Git tag** the version commit：`git tag -a v<version> -m "<summary>" && git push origin v<version>`

順序：把所有變更（含 version bump）合進**同一個** commit，push commit，再 push tag。

例外：純 `chore: bump version to X` 這種「只改 version 沒別的」的單獨 commit 不需要再 bump。
