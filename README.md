# Blindspot

Know where your AI is confidently wrong.

Blindspot generates a machine-marked exam about a Python repo, has IBM Bob sit it,
and maps where Bob is confidently wrong. Full README comes in step 34.

## Setup (Python 3.10+)

    python -m venv .venv
    source .venv/bin/activate      # Windows: .venv\Scripts\activate
    pip install -r requirements.txt
    pytest -q
    python cli.py --help

## Bob IDE plugin

The VS Code extension for Bob IDE lives in `plugin/`. It reads `results/report_latest.json`
(see docs/REPORT_SCHEMA.md) and, when present, `.bob/context/readiness.json`. See plugin/README.md
for the build, the settings and the demo workspace.

    cd plugin && npm install && npm run build && npm test && npm run package

## Data and credentials

Every external source and what we do with it is listed in docs/DATA_SOURCES.md. The only
credential is `BOB_API_KEY`: copy `.env.example` to `.env` and fill it in. `.env` is ignored by
git and by Bob. Never paste keys into prompts or code.
