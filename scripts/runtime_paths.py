#!/usr/bin/env python3
from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from shutil import which


REPO_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class RuntimePaths:
    repo_root: Path
    target_home: Path
    default_workdir: Path
    oh_my_codex_root: Path
    codex_model: str
    openclaw_model_primary: str

    def replacements(self) -> dict[str, str]:
        return {
            "{{HOME}}": str(self.target_home),
            "{{OH_MY_CODEX_ROOT}}": str(self.oh_my_codex_root),
            "{{CODEX_MODEL}}": self.codex_model,
            "{{MODEL_PRIMARY}}": self.openclaw_model_primary,
        }


def detect_oh_my_codex_root() -> Path:
    override = os.environ.get("OH_MY_CODEX_ROOT")
    if override:
        candidate = Path(override).expanduser().resolve()
        if candidate.exists():
            return candidate

    candidates: list[Path] = []

    try:
        npm_root = subprocess.check_output(["npm", "root", "-g"], text=True).strip()
        if npm_root:
            candidates.append((Path(npm_root) / "oh-my-codex").expanduser().resolve())
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    omx_path = which("omx")
    if omx_path:
        resolved = Path(omx_path).expanduser().resolve()
        # Typical install shape: <node>/bin/omx -> ../lib/node_modules/oh-my-codex/dist/cli/omx.js
        for parent in resolved.parents:
            if parent.name == "oh-my-codex":
                candidates.append(parent)
                break

    direct_candidates = [
        Path.home() / ".nvm/versions/node",
        Path("/opt/homebrew/lib/node_modules"),
        Path("/usr/local/lib/node_modules"),
    ]
    for base in direct_candidates:
        if not base.exists():
            continue
        for candidate in base.glob("**/oh-my-codex"):
            candidates.append(candidate.resolve())

    seen: set[Path] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        if candidate.exists():
            return candidate

    searched = ", ".join(str(path) for path in candidates) or "no candidates"
    raise SystemExit(f"Could not find oh-my-codex. Searched: {searched}")


def resolve_runtime_paths() -> RuntimePaths:
    target_home = Path(os.environ.get("TARGET_HOME", str(Path.home()))).expanduser().resolve()
    default_workdir = Path(
        os.environ.get("OMX_DEFAULT_WORKDIR", str(REPO_ROOT))
    ).expanduser().resolve()
    codex_model = os.environ.get("OMX_CODEX_MODEL", "gpt-5.4")
    openclaw_model_primary = os.environ.get("OMX_MODEL_PRIMARY", "openai-codex/gpt-5.4")
    return RuntimePaths(
        repo_root=REPO_ROOT,
        target_home=target_home,
        default_workdir=default_workdir,
        oh_my_codex_root=detect_oh_my_codex_root(),
        codex_model=codex_model,
        openclaw_model_primary=openclaw_model_primary,
    )
