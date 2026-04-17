#!/usr/bin/env python3
"""Apply repo-owned overlay files to installed oh-my-codex."""

import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OVERLAY_DIR = ROOT / "overlay"
MANIFEST_PATH = OVERLAY_DIR / "manifest.json"

def get_oh_my_codex_root() -> Path:
    try:
        result = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True, check=True)
        npm_root = result.stdout.strip()
        return Path(npm_root) / "oh-my-codex"
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Failed to get npm root: {e}")

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()

def main():
    print("Applying permanence overlay...")
    
    if not MANIFEST_PATH.exists():
        print("  No manifest.json found, skipping overlay")
        return
    
    manifest = json.loads(MANIFEST_PATH.read_text())
    omx_root = get_oh_my_codex_root()
    
    if not omx_root.exists():
        print(f"  oh-my-codex not found at {omx_root}")
        return
    
    print(f"  Target: {omx_root}")
    
    applied = 0
    skipped = 0
    
    for rel_path, expected_hash in manifest.items():
        overlay_file = OVERLAY_DIR / "oh-my-codex" / rel_path
        target_file = omx_root / rel_path
        
        if not overlay_file.exists():
            print(f"  MISSING: {rel_path}")
            continue
        
        overlay_hash = sha256_file(overlay_file)
        
        if target_file.exists():
            target_hash = sha256_file(target_file)
            if target_hash == overlay_hash:
                skipped += 1
                continue
        
        target_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(overlay_file, target_file)
        print(f"  APPLIED: {rel_path}")
        applied += 1
    
    print(f"Applied {applied} files, skipped {skipped} unchanged")

if __name__ == "__main__":
    main()
