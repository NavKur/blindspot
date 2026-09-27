"""Step 2: fetch the demo repo (tinydb) at a pinned commit and make sure it is clean.

The exam is only fair if everyone tests exactly the same code, so we pin a release tag
AND check the commit hash. The code is not committed to our repo; it is cloned on demand
into target/tinydb (ignored by git). target.lock.json records what was used.
"""
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from blindspot import config

REPO_URL = "https://github.com/msiemens/tinydb.git"
REF = "v4.9.0"
EXPECTED_COMMIT = "1e39ad3a2d9eca57efd9019fd089b5a04676da95"
PACKAGE = "tinydb"   # the folder inside the repo that the exam is about

# Files that feed context to coding agents. They must NOT exist in the target by default,
# otherwise condition C0 ("no context") would secretly contain context.
AGENT_CONTEXT_PATHS = [
    "AGENTS.md", "CLAUDE.md", ".cursorrules", ".cursor", ".bob", ".bobrules",
    ".github/copilot-instructions.md",
]


def git(*args, cwd=None) -> str:
    # safe.directory avoids git's "dubious ownership" refusal, common on Windows secondary drives.
    safe = ["-c", f"safe.directory={Path(cwd).resolve().as_posix()}"] if cwd else []
    result = subprocess.run(["git", *safe, *args], cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed:\n{result.stderr.strip()}")
    return result.stdout.strip()


def current_commit(path: Path):
    if not (path / ".git").exists():
        return None
    try:
        return git("rev-parse", "HEAD", cwd=path)
    except RuntimeError as err:
        print(f"Warning: could not read the target's commit: {err}")
        return None


def remove_agent_context(path: Path) -> list:
    """Delete any agent context files or folders. Returns what was removed."""
    removed = []
    for rel in AGENT_CONTEXT_PATHS:
        p = path / rel
        if p.is_dir():
            shutil.rmtree(p)
            removed.append(rel)
        elif p.exists():
            p.unlink()
            removed.append(rel)
    for p in path.glob(".bobrules-*"):
        p.unlink() if p.is_file() else shutil.rmtree(p)
        removed.append(p.name)
    return removed


def python_files(path: Path) -> list:
    return sorted(p for p in (path / PACKAGE).rglob("*.py"))


def fetch(force: bool = False) -> dict:
    dest = config.TARGET_DIR
    if force and dest.exists():
        shutil.rmtree(dest, onerror=_make_writable)
    if current_commit(dest) != EXPECTED_COMMIT:
        if dest.exists():
            shutil.rmtree(dest, onerror=_make_writable)
        dest.parent.mkdir(parents=True, exist_ok=True)
        print(f"Cloning {REPO_URL} at {REF} ...")
        git("clone", "--quiet", "--depth", "1", "--branch", REF, REPO_URL, str(dest))
    else:
        print(f"Target already at {REF} ({EXPECTED_COMMIT[:10]}).")

    commit = current_commit(dest)
    if commit != EXPECTED_COMMIT:
        raise RuntimeError(f"Wrong commit: expected {EXPECTED_COMMIT}, got {commit}")

    removed = remove_agent_context(dest)
    files = python_files(dest)
    lock = {
        "repo": REPO_URL, "ref": REF, "commit": commit, "package": PACKAGE,
        "python_files": [str(f.relative_to(dest)).replace("\\", "/") for f in files],
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    config.TARGET_LOCK.write_text(json.dumps(lock, indent=2), encoding="utf-8")
    return {"commit": commit, "removed_agent_files": removed, "n_python_files": len(files), "dest": dest}


def check() -> bool:
    """True if the target exists, is at the pinned commit and has no agent context files."""
    dest = config.TARGET_DIR
    ok_commit = current_commit(dest) == EXPECTED_COMMIT
    leftovers = [rel for rel in AGENT_CONTEXT_PATHS if (dest / rel).exists()]
    print(f"commit ok: {ok_commit}   agent context files present: {leftovers or 'none'}")
    return ok_commit and not leftovers


def _make_writable(func, path, _exc):
    """Windows marks files in .git read-only; make them writable so they can be deleted."""
    import os, stat
    os.chmod(path, stat.S_IWRITE)
    func(path)


def main(force: bool = False, check_only: bool = False) -> int:
    if check_only:
        return 0 if check() else 1
    info = fetch(force=force)
    print(f"Target ready: {info['dest']}")
    print(f"  commit          {info['commit']}")
    print(f"  python files    {info['n_python_files']} in {PACKAGE}/")
    print(f"  removed context {info['removed_agent_files'] or 'none (already clean)'}")
    print(f"  lock file       {config.TARGET_LOCK.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
