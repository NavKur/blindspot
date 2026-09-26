# Bob Readiness

A VS Code extension for IBM Bob IDE. It reads `.bob/context/readiness.json`, highlights code
where Bob is sure but wrong or only partly right, and lets you send approved findings to Bob,
which edits the code on a new branch.

Full documentation is written in phase 7. See BUILD_PLAN.md for the plan.

## Commands

    npm install
    npm run build        # esbuild bundle to dist/
    npm test             # vitest
    npm run lint
    npm run package      # produces bob-readiness-<version>.vsix
