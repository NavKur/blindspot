# Web demo of the Bob Readiness plugin

`index.html` is a self-contained page that shows the plugin without Bob IDE. It is built by
`cd plugin && npm run web-demo` from:

- the real exam data: `results/report_*.json`, `results/history.jsonl`, and the readiness
  contexts `python cli.py publish` produced for `test_C1_r1` and `test_C2_r1`
  (`plugin/web-demo/data/`);
- the plugin's own side panel page (`plugin/src/panel/html.ts`) and its own state builders
  (`panel/state.ts`, `report/examView.ts`, `heatmap.ts`), so the panel is the real thing;
- the source of tinydb v4.9.0 for the editor view;
- a scripted fake Bob (`plugin/scripts/web-demo/app.js`) that plays the approval flow, the
  onboarding chat and git. No call to IBM Bob is made from the page.

The blue switch at the top flips between the repository before and after Blindspot's notes
(C1, 89 percent; C2, 95 percent), with the same update toasts the plugin shows.

## Links to give people

- GitHub Pages, once enabled for the `main` branch and the `/docs` folder in the repository
  settings: `https://navkur.github.io/blindspot/demo/`
- Without any settings change, through the raw file viewer:
  `https://htmlpreview.github.io/?https://raw.githubusercontent.com/NavKur/blindspot/main/docs/demo/index.html`
  (replace `main` with the branch that has the file)
- Locally: open `docs/demo/index.html` in a browser.

Rebuild after publishing new data: copy the two readiness files into `plugin/web-demo/data/`
(see `docs/DEMO_RUNBOOK.md`) and run `npm run web-demo` again.
