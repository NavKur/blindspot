# Reference images

Open every image in this folder before building any UI. Match them closely.
They are mockups: exact pixels do not matter, but layout, content, wording, colours and behaviour do.
Numbers and code in them are sample data from tinydb.

## ref-00-target-look-from-aziz.png
The owner's own screenshot of the look he wants inside Bob IDE.
Shows: a function whose lines are tinted red with a red left border, and a boxed note
directly under the def line: "Sure but wrong (92%): Bob believed update() raises ValueError
when no condition is given. Actually, it raises nothing: with no condition it updates every
document."
In the extension, that note is delivered as the hover card (see ref-01). Optional extra, only
if time allows: show the same text as an after-line inline hint on the def line
(decoration `after` text, dimmed, truncated to about 80 characters).

## ref-01-editor-highlighting.png
The editor in Bob IDE with the extension on. Numbered callouts:
1. Gutter marker: small yellow dot on lines that have findings; also on the overview ruler.
2. Whole-function line highlight. Red tint rgba(250,77,86,0.14) with a 3px #fa4d56 left border
   for status "wrong". Blue tint rgba(69,137,255,0.10) with a 3px #4589ff left border for "part".
   Nothing for "ok".
3. Hover card on highlighted lines: function name, readiness %, status label; "Bob was N% sure
   that ... Actually: ..."; each finding on that line (id, type, severity, recommendation);
   an "Add to Bob queue" command link with the gate label.
4. CodeLens above each function that has findings: "Add to Bob queue (N)" and "Why Bob is unsure"
   (opens the hover content in a message or the panel). "Needs a person" when bob_allowed is "no".
5. Status bar item on the left: "Readiness: On" / "Readiness: Off", click to toggle everything
   (highlights, hovers, CodeLens, Problems entries). On the right: "Bob Readiness 73%" and
   "Bobcoins this session 1.2".
Highlights must work in every open file listed in the context file.

## ref-02-side-panel-tabs.png
The side panel (activity bar container "Bob Readiness", one webview view), shown five times,
once per tab. Common header: "BOB READINESS: <repo>", then three numbers (readiness,
sure but wrong, Bobcoins used), then the tab strip: Onboarding, Review, Testing, Release, Modernize.
- A Onboarding: setup commands, good first tasks (click opens the file), chat with questions on the
  right and answers on the left, cost under each answer, suggested question buttons, input box,
  note "Each new question costs about 1 Bobcoin. Repeated questions are free."
- B Review: findings of type review_risk. Each row: checkbox, severity square (high #fa4d56,
  medium #f1c21b, low #4589ff), title, file:line in mono blue (click opens the file at that line),
  detail, gate label. Gate labels: "Bob can do this" (green), "Bob with notes, review needed"
  (blue), "Needs a person" (red, checkbox disabled). Footer: "Selected: N (across tabs)",
  "about X Bobcoins", "Send to Bob" button.
- C Testing: same layout for test_gap findings.
- D Release: since tag, commits, functions changed, readiness bars for changed files,
  a bordered verdict box, draft release notes, buttons "Run tests" and "Copy release notes".
- E Modernize: same layout as Review for modernize findings.
The selection is shared across tabs, hover links and CodeLens (one queue).
Use VS Code theme variables so it also looks right in light themes; the mockup shows the dark theme.

## ref-03-approval-flow.png
The human-in-the-loop flow after "Send to Bob":
1. A modal (showWarningMessage with modal: true): "Send N changes to Bob?", the list of findings,
   the new branch name, estimated cost, buttons "Approve and run" / "Cancel".
2. Output channel "Bob Readiness" streaming timestamped progress (branch created, prompt sent,
   Bob output lines, cost, test command, test result, "Waiting for your decision").
3. Result view in the side panel: branch, cost, changed files with +/- counts (click opens the
   diff), test result box, list of done items, buttons "Keep changes" and "Discard".
