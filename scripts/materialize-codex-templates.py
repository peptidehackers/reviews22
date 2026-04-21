#!/usr/bin/env python3
"""Materialize Codex templates into ~/.codex/"""

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = ROOT / "templates" / ".codex"

def get_oh_my_codex_root() -> str:
    try:
        result = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True, check=True)
        npm_root = result.stdout.strip()
        omx_root = os.path.join(npm_root, "oh-my-codex")
        if os.path.isdir(omx_root):
            return omx_root
        raise RuntimeError(f"oh-my-codex not found at {omx_root}")
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Failed to get npm root: {e}")

def materialize_template(template_path: Path, target_path: Path, replacements: dict):
    content = template_path.read_text()
    for placeholder, value in replacements.items():
        content = content.replace(placeholder, value)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text(content)
    print(f"  {template_path.name} -> {target_path}")

def main():
    print("Materializing Codex templates...")
    home = os.environ.get("TARGET_HOME", os.environ["HOME"])
    target_dir = Path(home) / ".codex"
    omx_root = get_oh_my_codex_root()
    replacements = {"{{HOME}}": home, "{{OH_MY_CODEX_ROOT}}": omx_root}
    print(f"  HOME: {home}")
    print(f"  OH_MY_CODEX_ROOT: {omx_root}")
    templates = list(TEMPLATES_DIR.glob("*.template"))
    if not templates:
        print("  No templates found")
        return
    for template_path in templates:
        target_name = template_path.name.replace(".template", "")
        target_path = target_dir / target_name
        materialize_template(template_path, target_path, replacements)
    print(f"Materialized {len(templates)} templates")

if __name__ == "__main__":
    main()
