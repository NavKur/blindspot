# Go/no-go results for headless Bob

Filled in by Aziz (BUILD_PLAN.md section 4). Claude Code drafted this from results/gonogo.json
in the repository root, which recorded five closed-book calls.

## Command

Recorded working command (prompt passed on stdin, workspace as a flag):

    bob run --format json --workspace <repo> --trust --accept-license --max-turns 2 --max-cost 1.0

The extension passes the prompt both as the last argument and on stdin, so either convention
works. Put the exact command with the flags that allow file edits into the setting
`bobReadiness.bobCommand`.

Still to confirm by hand:
- [ ] Flag that allows file edits in headless mode (the closed-book runs used
      `--disable-tool-groups read,edit,command,browser,mcp`, so leave that flag out).
- [ ] One headless task that edits one line in a scratch tinydb copy actually changes the file.
- [ ] Coin cost of that one call.

## Output shape

One JSON object on the last line of stdout. Earlier lines may be plain log text.

    {"type": "result", "status": "success", "last_message": "<Bob's final message>",
     "stats": {"task_id": "t1", "total_tokens": 100, "session_costs": 0.0096, "tool_calls": 0}}

The cost is `stats.session_costs`. scripts/fake-bob.js prints the same shape with a cost of 0.0.

## Recorded costs

Five closed-book calls cost between 0.0037 and 0.011 coins each (results/gonogo.json).
