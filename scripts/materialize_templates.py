#!/usr/bin/env python3
from pathlib import Path
import subprocess
import os


ROOT = Path(__file__).resolve().parents[1]
TARGET_HOME = Path(os.environ.get("TARGET_HOME", str(Path.home())))


def detect_omx_root() -> str:
    npm_root = subprocess.check_output(["npm", "root", "-g"], text=True).strip()
    candidate = Path(npm_root) / "oh-my-codex"
    if not candidate.exists():
        raise SystemExit(f"Could not find oh-my-codex in npm global root: {candidate}")
    return str(candidate)


def render_template(src: Path, dest: Path, replacements: dict[str, str]) -> None:
    text = src.read_text()
    for key, value in replacements.items():
        text = text.replace(key, value)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(text)


def main() -> None:
    omx_root = detect_omx_root()
    replacements = {
        "{{HOME}}": str(TARGET_HOME),
        "{{OH_MY_CODEX_ROOT}}": omx_root,
    }
    render_template(ROOT / "templates" / "openclaw.json.template", TARGET_HOME / ".openclaw" / "openclaw.json", replacements)
    render_template(ROOT / "templates" / "mempalace.yaml.template", TARGET_HOME / ".openclaw" / "mempalace.yaml", replacements)
    render_template(ROOT / "templates" / ".codex" / "config.toml.template", TARGET_HOME / ".openclaw" / ".codex" / "config.toml", replacements)
    render_template(ROOT / "templates" / ".codex" / "hooks.json.template", TARGET_HOME / ".openclaw" / ".codex" / "hooks.json", replacements)
    print(f"Rendered templates into {TARGET_HOME} with oh-my-codex root: {omx_root}")


if __name__ == "__main__":
    main()
