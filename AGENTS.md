# Project delivery workflow

For this repository, after completing any code, configuration, or documentation change:

1. Run `bun test` and `bun run check`.
2. Run `bun run package:mac` to produce the local macOS package in `dist/`.
3. Commit the completed changes and push the current branch to its configured remote. The user has authorized this as the default workflow for future work in this project; do not ask again each time.

Fix failures before delivery. If a check, package, commit, or push cannot complete, report the exact failure and leave the work available locally. Do not force-push. Follow a later explicit user instruction when it changes this workflow.
