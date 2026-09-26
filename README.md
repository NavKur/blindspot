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
