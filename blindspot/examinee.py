"""Step 14: the examinee mode and the exam prompt.

The same mode, flags and prompt template are used for every condition (PREREGISTRATION.md section 3).
Only the context files in the exam workspace differ between C0, C1 and C2.
"""
import json
import re

from blindspot.gonogo import CLOSED_BOOK

MODE_SLUG = "blindspot-examinee"

MODES_YAML = f"""customModes:
  - slug: {MODE_SLUG}
    name: Blindspot Examinee
    roleDefinition: >-
      You answer exam questions about the repository in this workspace using only what you
      already know and any project context loaded for you (such as AGENTS.md).
      You never read, search, run or edit files.
    groups: []
"""

EXAM_FLAGS = CLOSED_BOOK + ["--mode", MODE_SLUG]

PROMPT_HEAD = """You are sitting a closed-book exam about the Python repository in this workspace.
Do not open, search, read or run any files. Use only what you already know and any project
context that was loaded for you.

Answer every question. Return ONLY a JSON array with one object per question, in any order:
  {"id": "<id>", "answer": <answer>, "p": <your probability from 0.0 to 1.0 that YOUR answer is correct>}
For yes/no questions, answer is true or false (JSON booleans).
For value questions, answer is a string holding the exact Python literal, for example "None", "0", "'abc'".
Give an answer even when unsure, and show how unsure you are through p.
No prose, no code fences.

Questions:"""


def build_prompt(questions) -> str:
    lines = [PROMPT_HEAD]
    for q in questions:
        kind = "yes/no" if q["type"] == "tf" else "value"
        lines.append(f"[{q['id']}] ({kind}) {q['text']}")
    return "\n".join(lines)


def _array(text):
    text = re.sub(r"```(?:json)?", "", text or "")
    start, end = text.find("["), text.rfind("]")
    if start == -1 or end <= start:
        return None
    try:
        data = json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, list) else None


def parse_answers(reply: str, questions) -> dict:
    """{question id: {"answer": ..., "p": ...}} for well-formed answers only.

    Anything malformed (wrong type, p outside 0 to 1, unknown id) is dropped and so counts as
    missing, which PREREGISTRATION.md section 6 handles (excluded and counted, batch re-run if > 10%).
    """
    wanted = {q["id"]: q["type"] for q in questions}
    out = {}
    for item in _array(reply) or []:
        if not isinstance(item, dict):
            continue
        qid = str(item.get("id", "")).strip("[] ")
        if qid not in wanted or qid in out:
            continue
        p = item.get("p")
        if isinstance(p, bool) or not isinstance(p, (int, float)) or not 0 <= p <= 1:
            continue
        ans = item.get("answer")
        if wanted[qid] == "tf":
            if isinstance(ans, str) and ans.strip().lower() in ("true", "false"):
                ans = ans.strip().lower() == "true"
            if not isinstance(ans, bool):
                continue
        else:
            if isinstance(ans, bool) or ans is None:
                ans = repr(ans)
            elif not isinstance(ans, str):
                ans = repr(ans)
        out[qid] = {"answer": ans, "p": float(p)}
    return out
