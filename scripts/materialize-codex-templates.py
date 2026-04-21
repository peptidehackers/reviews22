#!/usr/bin/env python3
"""Materialize Codex templates into the target home."""

from pathlib import Path

from runtime_paths import resolve_runtime_paths

def materialize_template(template_path: Path, target_path: Path, replacements: dict):
    content = template_path.read_text()
    for placeholder, value in replacements.items():
        content = content.replace(placeholder, value)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text(content)
    print(f"  {template_path.name} -> {target_path}")

def main():
    paths = resolve_runtime_paths()
    print("Materializing Codex templates...")
    print(f"  HOME: {paths.target_home}")
    print(f"  WORKDIR: {paths.default_workdir}")
    print(f"  OH_MY_CODEX_ROOT: {paths.oh_my_codex_root}")
    print(f"  CODEX_MODEL: {paths.codex_model}")
    templates = list((paths.repo_root / "templates" / ".codex").glob("*.template"))
    if not templates:
        print("  No templates found")
        return
    for template_path in templates:
        target_name = template_path.name.replace(".template", "")
        target_path = paths.target_home / ".codex" / target_name
        materialize_template(template_path, target_path, paths.replacements())
    print(f"Materialized {len(templates)} templates")

if __name__ == "__main__":
    main()
