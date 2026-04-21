#!/usr/bin/env python3
from pathlib import Path
from runtime_paths import resolve_runtime_paths


def render_template(src: Path, dest: Path, replacements: dict[str, str]) -> None:
    text = src.read_text()
    for key, value in replacements.items():
        text = text.replace(key, value)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(text)


def main() -> None:
    paths = resolve_runtime_paths()
    replacements = paths.replacements()
    render_template(
        paths.repo_root / "templates" / "openclaw.json.template",
        paths.target_home / ".openclaw" / "openclaw.json",
        replacements,
    )
    render_template(
        paths.repo_root / "templates" / "mempalace.yaml.template",
        paths.target_home / ".openclaw" / "mempalace.yaml",
        replacements,
    )
    render_template(
        paths.repo_root / "templates" / ".codex" / "config.toml.template",
        paths.target_home / ".openclaw" / ".codex" / "config.toml",
        replacements,
    )
    render_template(
        paths.repo_root / "templates" / ".codex" / "hooks.json.template",
        paths.target_home / ".openclaw" / ".codex" / "hooks.json",
        replacements,
    )
    print(f"Rendered templates into {paths.target_home} with oh-my-codex root: {paths.oh_my_codex_root}")


if __name__ == "__main__":
    main()
