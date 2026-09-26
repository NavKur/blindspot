"""A stand-in for Bob Shell used only by the tests. It behaves like an ideal closed-book Bob."""
import json
import re
import sys

args = sys.argv[1:]
prompt = sys.stdin.read()

if "--mode" in args and args[args.index("--mode") + 1] != "blindspot-examinee":
    print("unknown mode", file=sys.stderr)
    sys.exit(2)

if "secret.txt" in prompt:
    reply = "NO_ACCESS"
elif "codename" in prompt:
    reply = "PELICAN-42"
elif "MODE_OK" in prompt:
    reply = "MODE_OK"
elif re.search(r"\[g01\]", prompt):
    truths = {f"g{i:02d}": (i % 2 == 1) for i in range(1, 21)}
    truths["g20"] = True
    reply = "```json\n" + json.dumps([{"id": k, "answer": v, "p": 0.9} for k, v in truths.items()]) + "\n```"
else:
    reply = '{"ok": true}'

print("some log line that is not JSON")
print(json.dumps({"type": "result", "status": "success", "last_message": reply,
                  "stats": {"task_id": "t1", "total_tokens": 100, "session_costs": 0.05, "tool_calls": 0}}))
