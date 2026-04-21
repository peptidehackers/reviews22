#!/usr/bin/env python3
from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path


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
    else:
        npm_root = subprocess.check_output(["npm", "root", "-g"], text=True).strip()
        candidate = Path(npm_root) / "oh-my-codex"
    if not candidate.exists():
        raise SystemExit(f"Could not find oh-my-codex at {candidate}")
    return candidate


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
