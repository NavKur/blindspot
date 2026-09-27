"""Blindspot command line. Each subcommand is filled in by a later build step."""
import argparse
import sys

from blindspot import config

STEPS = {
    "target": "step 2",
    "gonogo": "step 3",
    "scan": "step 5",
    "split": "step 8",
    "pilot": "step 9",
    "generate": "steps 5 to 9",
    "exam": "step 16",
    "mark": "step 16",
    "report": "step 11",
    "cartographer": "step 19",
    "simulate": "step 12",
    "publish": "step 17",
    "analyze": "step 20",
}


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="blindspot", description="Find out where Bob doesn't know your code.")
    sub = p.add_subparsers(dest="command", required=True)

    t = sub.add_parser("target", help="fetch the demo repo (tinydb) at the pinned commit")
    t.add_argument("--force", action="store_true", help="delete and re-clone")
    t.add_argument("--check", action="store_true", help="only verify commit and cleanliness")

    sub.add_parser("scan", help="index the target repo's modules, functions, imports, defaults, raises, calls")
    sub.add_parser("gonogo", help="one test batch through bob run; records cost and capabilities")

    sub.add_parser("generate", help="build question candidates from the scanned index")
    sub.add_parser("split", help="draw the balanced exam and split it into TRAIN and TEST")
    sub.add_parser("pilot", help="build the 30-question pilot set (never uses TEST)")

    e = sub.add_parser("exam", help="Bob sits one set under one condition, then mark and report (costs Bobcoins)")
    e.add_argument("--condition", choices=config.CONDITIONS, required=True)
    e.add_argument("--set", dest="qset", choices=("pilot", "train", "test"), required=True)
    e.add_argument("--repeat", type=int, default=1)
    e.add_argument("--allow-ide", action="store_true", help="run even from the Bob IDE terminal (not recommended)")

    m = sub.add_parser("mark", help="mark answers against the truth")
    m.add_argument("--condition", choices=config.CONDITIONS, required=True)
    m.add_argument("--set", dest="qset", choices=("pilot", "train", "test"), required=True)
    m.add_argument("--repeat", type=int, default=1)

    r = sub.add_parser("report", help="per-module statistics and the dashboard report for one marked run")
    r.add_argument("--set", dest="qset", choices=("pilot", "train", "test"), required=True)
    r.add_argument("--condition", choices=config.CONDITIONS, required=True)
    r.add_argument("--repeat", type=int, default=1)
    s = sub.add_parser("simulate", help="fake examinee (no Bob) writing SIMULATED reports to results/sim/ for the plugin")
    s.add_argument("--set", dest="qset", choices=("pilot", "train"), default="train")
    c = sub.add_parser("cartographer", help="Bob writes targeted notes for the worst TRAIN modules -> contexts/C2/AGENTS.md")
    c.add_argument("--dry-run", action="store_true", help="print the prompts, call nothing")
    c.add_argument("--allow-ide", action="store_true")
    pb = sub.add_parser("publish", help="write readiness.json, rules and an AGENTS.md block into the target repo")
    pb.add_argument("--sim", action="store_true", help="publish the simulated data in results/sim")
    pb.add_argument("--run", help="marked run to publish, e.g. train_C1_r1 (default: newest)")
    pb.add_argument("--dest", help="repo to publish into (default: target/tinydb)")
    sub.add_parser("analyze", help="pre-registered analysis of the TEST runs -> results/final_analysis.json")
    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "target":
        from blindspot import target
        return target.main(force=args.force, check_only=args.check)
    if args.command == "analyze":
        from blindspot import analyze
        return analyze.main()
    if args.command == "cartographer":
        from blindspot import cartographer
        return cartographer.main(dry_run=args.dry_run, allow_ide=args.allow_ide)
    if args.command == "exam":
        from blindspot import exam
        return exam.main(args.qset, args.condition, args.repeat, args.allow_ide)
    if args.command == "mark":
        from blindspot import mark
        return mark.main(args.qset, args.condition, args.repeat)
    if args.command == "publish":
        from blindspot import publish
        return publish.main(sim=args.sim, run=args.run, dest=args.dest)
    if args.command == "simulate":
        from blindspot import simulate
        return simulate.main(args.qset)
    if args.command == "report":
        from blindspot import report
        return report.main(args.qset, args.condition, args.repeat)
    if args.command == "pilot":
        from blindspot import pilot
        return pilot.main()
    if args.command == "split":
        from blindspot import split
        return split.main()
    if args.command == "generate":
        from blindspot import generate
        return generate.main()
    if args.command == "scan":
        from blindspot import scan
        return scan.main()
    if args.command == "gonogo":
        from blindspot import gonogo
        return gonogo.main()
    print(f"'{args.command}' is not implemented yet ({STEPS[args.command]}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
