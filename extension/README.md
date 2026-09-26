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

## Demo workspace

The sample context is `fixtures/readiness.sample.json`. Every line number in it starts as a
placeholder (1 to 2) until `scripts/fix-fixture-lines.py` aligns it with a real tinydb checkout.

    git clone https://github.com/msiemens/tinydb ../demo-tinydb
    python3 scripts/fix-fixture-lines.py ../demo-tinydb fixtures/readiness.sample.json
    mkdir -p ../demo-tinydb/.bob/context ../demo-tinydb/.bob/rules
    cp fixtures/readiness.sample.json ../demo-tinydb/.bob/context/readiness.json
    cp fixtures/readiness-context.sample.md ../demo-tinydb/.bob/rules/readiness-context.md
    cd ../demo-tinydb && git branch -m master main && git add .bob && git commit -m "chore: add Bob readiness context"

The demo workspace must be a git repository with a clean working tree, because the approval
flow creates a branch named `bob/readiness-<yyyymmdd-hhmm>`. The `baseBranch` setting defaults
to `main`, so rename tinydb's `master` branch as shown above or change the setting.

To run the tests in the demo workspace: `pip install -e ../demo-tinydb pytest`.

Open `../demo-tinydb` in the Extension Development Host (F5 does this) or in Bob IDE.
