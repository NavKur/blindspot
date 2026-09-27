# Data sources and compliance

Kept up to date so the team can show where every byte of data came from.

## External data used

| Source | What we use | Licence and terms | Where |
|---|---|---|---|
| https://github.com/msiemens/tinydb (tag v4.9.0, commit 1e39ad3a) | The public Python library the exam is about: its source code is scanned to generate questions, and a checkout is the demo workspace for the Bob IDE plugin | MIT licence, which allows commercial use. The code is cloned on demand into `target/tinydb` and `demo-tinydb/` and is not committed to this repository | `python cli.py target`, `plugin/README.md` |

No other websites, datasets or assets are used. Fonts in the plugin are the editor's own fonts.

## Data we generate ourselves

- `exams/` and `results/sim/`: questions and simulated answers produced by our code from the
  tinydb source. `results/sim/*` is marked `"simulated": true` and the plugin shows a banner.
- `results/gonogo.json`: five recorded headless Bob calls with trivia questions. It contains no
  credentials, only costs, timings and Bob's answers.
- `plugin/fixtures/readiness.sample.json`: sample readiness context written by the team, with
  statements about tinydb behaviour.
- Bob's own answers to exam questions, once real runs exist, are stored under `results/` and are
  hidden from Bob by `.bobignore` so the exam stays fair.

## What we do not use

- No company confidential data, no client data.
- No personal information. Commit metadata carries the team members' own names and emails, as
  in any git repository. Nothing else identifies a person.
- No data from social media.

## Credentials

- The only credential is `BOB_API_KEY`, read from the environment by `python cli.py gonogo`
  and later `cli.py exam`. Copy `.env.example` to `.env` and fill it in. `.env` is ignored by
  both `.gitignore` and `.bobignore`.
- The plugin never handles credentials. It spawns the `bob` command from the
  `bobReadiness.bobCommand` setting and inherits the environment; nothing is logged except
  Bob's stdout and stderr, in the "Bob Readiness" Output channel.
- Before pushing: `git diff --cached` and `git grep -i -E "api[_-]?key|secret|password" -- ':!plugin/node_modules'`.
