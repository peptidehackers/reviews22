#!/usr/bin/env python3
"""
Enforcement Logic - Called by TypeScript Handler
"""

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

RISK_RANK = {"low": 1, "medium": 2, "high": 3, "critical": 4}
MUTATION_CLASS = "mutation"
DISCOVERY_CLASS = "discovery"
VERIFICATION_CLASS = "verification"
NEUTRAL_CLASS = "neutral"
UNKNOWN_RUN_ID = "unknown"
UNKNOWN_SESSION_KEY = "unknown"

CONFIG = {
    "boundary_contract_path": Path(
        os.path.expanduser(
            os.environ.get(
                "BOUNDARY_CONTRACT_PATH",
                "~/.openclaw/config/boundary-contract.yaml",
            )
        )
    ),
    "freeze_state_path": Path.home() / ".openclaw/workspace/state/freeze.json",
    "governance_state_path": Path.home()
    / ".openclaw/workspace/state/governance-checkpoints.json",
    "review_required": True,
    "max_retries": 2,
    "log_file": Path.home() / ".openclaw/hooks/pre-execution-governance/enforcement.log",
}

DISCOVERY_TOOL_NAMES = {
    "read",
    "cat",
    "ls",
    "grep",
    "find",
    "glob",
    "search",
    "open",
    "hover",
    "references",
    "symbols",
}

DISCOVERY_COMMAND_PATTERNS = [
    r"\brg\b",
    r"\bgrep\b",
    r"\bfind\b",
    r"\bls\b",
    r"\bcat\b",
    r"\bsed\s+-n\b",
    r"\bhead\b",
    r"\btail\b",
    r"\bgit\s+status\b",
]

VERIFICATION_COMMAND_PATTERNS = [
    r"\bpytest\b",
    r"\bjest\b",
    r"\bvitest\b",
    r"\bgo\s+test\b",
    r"\bcargo\s+test\b",
    r"\btsc\b",
    r"\bmypy\b",
    r"\bruff\b",
    r"\beslint\b",
    r"\bbiome\b",
    r"\bmake\s+test\b",
    r"\bnpm\s+(run\s+)?test\b",
    r"\bpnpm\s+(run\s+)?test\b",
    r"\bbun\s+test\b",
    r"\bnpm\s+run\s+build\b",
    r"\bpnpm\s+run\s+build\b",
    r"\bbun\s+run\s+build\b",
    r"\bpython\s+-m\s+pytest\b",
]


class EnforcementEngine:
    def __init__(self):
        self.contract = self.load_boundary_contract()
        self.retry_tracker: Dict[str, Dict[str, int]] = {}
        self.freeze_state = self.load_freeze_state()
        self.governance_state = self.load_governance_state()

    def load_boundary_contract(self) -> Dict[str, Any]:
        """Load boundary contract from YAML."""
        contract_path = CONFIG["boundary_contract_path"]

        default_contract = {
            "allowed_sources": [
                "cli",
                "telegram",
                "discord",
                "slack",
                "whatsapp",
                "webchat",
                "signal",
                "imessage",
                "matrix",
            ],
            "risky_task_patterns": {
                "medium": ["write", "edit", "patch", "exec", "run"],
                "high": [
                    "openclaw",
                    "gateway",
                    "config",
                    "architecture",
                    "implementation",
                    "dependency",
                    "auth",
                    "token",
                    "key",
                    "secret",
                ],
                "critical": [
                    "rm",
                    "delete",
                    "drop",
                    "truncate",
                    "destroy",
                    "remove",
                    "reset --hard",
                ],
            },
            "authority_rules": {
                "cli": {"risk_limit": "critical"},
                "telegram": {"risk_limit": "high"},
                "discord": {"risk_limit": "high"},
                "whatsapp": {"risk_limit": "high"},
            },
            "self_healing_limits": {
                "max_retries": CONFIG["max_retries"],
                "retry_delay_seconds": 30,
                "retryable_failures": ["config", "auth", "state", "routing", "execution"],
            },
        }

        if contract_path.exists():
            try:
                with open(contract_path) as f:
                    loaded = yaml.safe_load(f)
                if loaded:
                    self.contract = {**default_contract, **loaded}
                    self.log(f"Loaded boundary contract from {contract_path}")
                else:
                    self.contract = default_contract
            except Exception as e:
                self.log(f"Failed to load boundary contract: {e}, using defaults")
                self.contract = default_contract
        else:
            self.log(f"Boundary contract not found at {contract_path}, using defaults")
            self.contract = default_contract

        return self.contract

    def load_freeze_state(self) -> Dict[str, Any]:
        """Load optional freeze lock state."""
        freeze_path = CONFIG["freeze_state_path"]
        default_state = {"active": False}

        if not freeze_path.exists():
            return default_state

        try:
            with open(freeze_path) as f:
                loaded = json.load(f)
            if isinstance(loaded, dict):
                return {**default_state, **loaded}
        except Exception as e:
            self.log(f"Failed to load freeze state: {e}, ignoring freeze state")

        return default_state

    def load_governance_state(self) -> Dict[str, Any]:
        path = CONFIG["governance_state_path"]
        default_state = {"sessions": {}}

        if not path.exists():
            return default_state

        try:
            with open(path) as f:
                loaded = json.load(f)
            if isinstance(loaded, dict):
                loaded.setdefault("sessions", {})
                return loaded
        except Exception as e:
            self.log(f"Failed to load governance state: {e}, resetting state")

        return default_state

    def save_governance_state(self) -> None:
        path = CONFIG["governance_state_path"]
        path.parent.mkdir(parents=True, exist_ok=True)
        self.governance_state["updated_at"] = datetime.now().isoformat()
        with open(path, "w") as f:
            json.dump(self.governance_state, f, indent=2, sort_keys=True)

    def ensure_session_state(self, session_key: str) -> Dict[str, Any]:
        sessions = self.governance_state.setdefault("sessions", {})
        session = sessions.setdefault(
            session_key,
            {
                "session_key": session_key,
                "discovery_count": 0,
                "discovery_paths": [],
                "mutation_count": 0,
                "verification_count": 0,
                "pending_mutation": False,
                "pending_tool_calls": {},
                "runs": {},
            },
        )
        session.setdefault("pending_tool_calls", {})
        session.setdefault("runs", {})
        session.setdefault("discovery_paths", [])
        return session

    def ensure_run_state(self, session_key: str, run_id: str) -> Dict[str, Any]:
        session = self.ensure_session_state(session_key)
        runs = session.setdefault("runs", {})
        run = runs.setdefault(
            run_id,
            {
                "run_id": run_id,
                "discovery_count": 0,
                "discovery_paths": [],
                "mutation_count": 0,
                "verification_count": 0,
                "pending_mutation": False,
                "pending_tool_calls": {},
            },
        )
        run.setdefault("pending_tool_calls", {})
        run.setdefault("discovery_paths", [])
        return run

    def serialize_paths(self, paths: List[Path]) -> List[str]:
        seen = set()
        serialized: List[str] = []
        for path in paths:
            text = str(path)
            if text not in seen:
                seen.add(text)
                serialized.append(text)
        return serialized

    def set_tool_checkpoint(
        self,
        session_key: str,
        run_id: str,
        tool_call_id: str,
        tool_name: str,
        classification: str,
        tool_args: Dict[str, Any],
    ) -> None:
        session = self.ensure_session_state(session_key)
        target = session
        if run_id != UNKNOWN_RUN_ID:
            target = self.ensure_run_state(session_key, run_id)

        include_workdir = classification != DISCOVERY_CLASS
        target_paths = self.serialize_paths(
            self.extract_relevant_paths(tool_args, include_workdir=include_workdir)
        )

        target["pending_tool_calls"][tool_call_id] = {
            "tool_name": tool_name,
            "classification": classification,
            "target_paths": target_paths,
            "recorded_at": datetime.now().isoformat(),
        }
        self.save_governance_state()

    def paths_overlap(self, discovery_path: str, target_path: Path) -> bool:
        discovery = self.normalize_path(discovery_path)
        if discovery is None:
            return False

        try:
            target_path.relative_to(discovery)
            return True
        except ValueError:
            pass

        try:
            discovery.relative_to(target_path)
            return True
        except ValueError:
            return False

    def find_matching_discovery_path(
        self, session_key: str, run_id: str, target_paths: List[Path]
    ) -> Optional[str]:
        session = self.ensure_session_state(session_key)
        discovery_paths: List[str] = []

        if run_id != UNKNOWN_RUN_ID:
            run = self.ensure_run_state(session_key, run_id)
            discovery_paths.extend([p for p in run.get("discovery_paths", []) if isinstance(p, str)])
        else:
            discovery_paths.extend([p for p in session.get("discovery_paths", []) if isinstance(p, str)])

        for discovery_path in discovery_paths:
            for target_path in target_paths:
                if self.paths_overlap(discovery_path, target_path):
                    return discovery_path
        return None

    def has_discovery_evidence(self, session_key: str, run_id: str) -> bool:
        session = self.ensure_session_state(session_key)
        if run_id != UNKNOWN_RUN_ID:
            run = self.ensure_run_state(session_key, run_id)
            return int(run.get("discovery_count", 0)) > 0
        return int(session.get("discovery_count", 0)) > 0

    def check_source_authorization(self, source: str) -> bool:
        return source in self.contract["allowed_sources"]

    def is_mutating_tool(self, tool_name: str, tool_args: Dict[str, Any]) -> bool:
        tool_name_lc = (tool_name or "").lower()
        task_desc = json.dumps(tool_args).lower()

        if tool_name_lc in ["read", "cat", "ls", "grep", "find", "glob", "search", "open"]:
            return False

        mutating_markers = [
            "write",
            "edit",
            "patch",
            "delete",
            "rm",
            "exec",
            "restart",
            "install",
            "create",
            "update",
        ]
        return any(marker in tool_name_lc or marker in task_desc for marker in mutating_markers)

    def normalize_path(self, candidate: str) -> Optional[Path]:
        if not candidate or "://" in candidate:
            return None

        try:
            path = Path(candidate).expanduser()
            if not path.is_absolute():
                path = (Path.home() / ".openclaw" / path).resolve()
            else:
                path = path.resolve()
            return path
        except Exception:
            return None

    def extract_relevant_paths(
        self, tool_args: Dict[str, Any], include_workdir: bool = True
    ) -> List[Path]:
        candidates: List[str] = []
        explicit_keys = ["path", "file", "filepath", "file_path", "target", "root"]
        contextual_keys = ["cwd", "workdir"] if include_workdir else []

        for key in explicit_keys + contextual_keys:
            value = tool_args.get(key)
            if isinstance(value, str):
                candidates.append(value)
            elif isinstance(value, list):
                candidates.extend([item for item in value if isinstance(item, str)])

        for key in ["command", "cmd"]:
            command = tool_args.get(key)
            if isinstance(command, str):
                candidates.extend(
                    re.findall(r'(~?/[^\s\'"]+|\./[^\s\'"]+|\.\./[^\s\'"]+)', command)
                )

        normalized: List[Path] = []
        for candidate in candidates:
            resolved = self.normalize_path(candidate)
            if resolved is not None:
                normalized.append(resolved)

        return normalized

    def violates_freeze_lock(self, tool_name: str, tool_args: Dict[str, Any]) -> Optional[str]:
        if not self.freeze_state.get("active"):
            return None

        if not self.is_mutating_tool(tool_name, tool_args):
            return None

        freeze_root = self.freeze_state.get("root")
        if not isinstance(freeze_root, str) or not freeze_root.strip():
            return None

        root_path = self.normalize_path(freeze_root)
        if root_path is None:
            return None

        paths = self.extract_relevant_paths(tool_args)
        if not paths:
            return f"Active freeze lock on {root_path}; mutating tool has no scoped path"

        for candidate in paths:
            try:
                candidate.relative_to(root_path)
            except ValueError:
                return f"Active freeze lock on {root_path}; target {candidate} is outside allowed root"

        return None

    def get_risk_level(self, tool_name: str, tool_args: Dict[str, Any], source: str) -> str:
        tool_name_lc = (tool_name or "").lower()
        task_desc = json.dumps(tool_args).lower()
        semantic_desc = self.semantic_description(tool_args)
        target_paths = self.extract_relevant_paths(tool_args)
        matched_risk = "low"

        for category, patterns in self.contract["risky_task_patterns"].items():
            for pattern in patterns:
                if pattern in tool_name_lc or pattern in semantic_desc:
                    if RISK_RANK[category] > RISK_RANK[matched_risk]:
                        matched_risk = category

        path_risk = self.path_risk_level(target_paths)
        if RISK_RANK[path_risk] > RISK_RANK[matched_risk]:
            matched_risk = path_risk

        if matched_risk == "low":
            if tool_name_lc in ["read", "cat", "ls", "grep", "find", "glob", "search", "open"]:
                matched_risk = "low"
            elif tool_name_lc in ["write", "edit", "exec", "exec_command"]:
                matched_risk = "medium"
            elif tool_name_lc in ["delete", "rm", "gateway", "restart"]:
                matched_risk = "high"
            elif any(p in task_desc for p in ["delete", "drop", "truncate", "remove"]):
                matched_risk = "critical"

        source_limit = self.contract["authority_rules"].get(source, {}).get("risk_limit", "medium")
        if RISK_RANK[matched_risk] > RISK_RANK.get(source_limit, RISK_RANK["medium"]):
            return "critical"

        return matched_risk

    def semantic_description(self, value: Any) -> str:
        path_keys = {"path", "file", "filepath", "file_path", "target", "cwd", "workdir", "root"}

        if isinstance(value, dict):
            parts = []
            for key, nested in value.items():
                if key in path_keys:
                    continue
                parts.append(self.semantic_description(nested))
            return " ".join(part for part in parts if part).lower()

        if isinstance(value, list):
            return " ".join(self.semantic_description(item) for item in value).lower()

        if isinstance(value, str):
            return value.lower()

        return ""

    def path_risk_level(self, paths: List[Path]) -> str:
        highest = "low"

        for path in paths:
            text = str(path).lower()
            path_risk = "low"

            if "/.git/" in text or text.endswith("/.git"):
                path_risk = "critical"
            elif any(part in text for part in ["/config/", "/auth", "token", "secret", "credential", "key"]):
                path_risk = "high"
            elif any(part in text for part in ["/package.json", "/bun.lock", "/tsconfig", "/requirements", "/pyproject"]):
                path_risk = "high"

            if RISK_RANK[path_risk] > RISK_RANK[highest]:
                highest = path_risk

        return highest

    def classify_exec_command(self, command: str) -> str:
        command_lc = command.lower()

        if any(re.search(pattern, command_lc) for pattern in VERIFICATION_COMMAND_PATTERNS):
            return VERIFICATION_CLASS
        if any(re.search(pattern, command_lc) for pattern in DISCOVERY_COMMAND_PATTERNS):
            return DISCOVERY_CLASS
        return NEUTRAL_CLASS

    def classify_tool_call(self, tool_name: str, tool_args: Dict[str, Any]) -> str:
        tool_name_lc = (tool_name or "").lower()

        if self.is_mutating_tool(tool_name, tool_args):
            return MUTATION_CLASS

        if tool_name_lc in DISCOVERY_TOOL_NAMES or any(marker in tool_name_lc for marker in ["read", "grep", "search", "find", "glob", "hover", "symbol"]):
            return DISCOVERY_CLASS

        if any(marker in tool_name_lc for marker in ["test", "lint", "typecheck", "build", "verify"]):
            return VERIFICATION_CLASS

        for key in ["command", "cmd"]:
            value = tool_args.get(key)
            if isinstance(value, str):
                return self.classify_exec_command(value)

        return NEUTRAL_CLASS

    def check_self_healing_applicable(self, failure_class: str, tool_name: str) -> Dict[str, Any]:
        limits = self.contract["self_healing_limits"]

        if failure_class not in limits["retryable_failures"]:
            return {"applicable": False, "max_retries": 0}

        if tool_name not in self.retry_tracker:
            self.retry_tracker[tool_name] = {}

        return {
            "applicable": True,
            "max_retries": limits["max_retries"],
            "retry_count": self.retry_tracker[tool_name].get(failure_class, 0),
        }

    def increment_retry_count(self, tool_name: str, failure_class: str) -> int:
        if tool_name not in self.retry_tracker:
            self.retry_tracker[tool_name] = {}

        if failure_class not in self.retry_tracker[tool_name]:
            self.retry_tracker[tool_name][failure_class] = 0

        self.retry_tracker[tool_name][failure_class] += 1
        return self.retry_tracker[tool_name][failure_class]

    def should_block_execution(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        tool_name = metadata.get("tool_name", "")
        tool_args = metadata.get("tool_arguments", {})
        source = metadata.get("source", "cli")
        session_key = metadata.get("session_key", UNKNOWN_SESSION_KEY)
        run_id = metadata.get("run_id", UNKNOWN_RUN_ID)
        tool_call_id = metadata.get("tool_call_id", "unknown")

        self.log(f"Checking tool: {tool_name} (source: {source})")

        if not self.check_source_authorization(source):
            self.log(f"BLOCKED: Source not allowed: {source}")
            return {
                "decision": "block",
                "reason": f"Source not allowed: {source}",
                "risk_level": "critical",
            }

        freeze_violation = self.violates_freeze_lock(tool_name, tool_args)
        if freeze_violation:
            self.log(f"BLOCKED: {freeze_violation}")
            return {
                "decision": "block",
                "reason": freeze_violation,
                "risk_level": "critical",
            }

        classification = self.classify_tool_call(tool_name, tool_args)
        target_paths = self.extract_relevant_paths(tool_args)
        if classification == MUTATION_CLASS:
            if not target_paths and not self.has_discovery_evidence(session_key, run_id):
                reason = (
                    "Mutating tool blocked: discovery evidence is required in the current run before editing. "
                    "Search/read the relevant surface first, then retry."
                )
                self.log(f"BLOCKED: {reason}")
                return {
                    "decision": "block",
                    "risk_level": "high",
                    "reason": reason,
                }

            if target_paths:
                matched_discovery = self.find_matching_discovery_path(session_key, run_id, target_paths)
                if matched_discovery is None:
                    example_target = str(target_paths[0])
                    reason = (
                        "Mutating tool blocked: no discovery evidence matches the target surface in the current run. "
                        f"Target: {example_target}. Search/read that file or its directory first, then retry."
                    )
                    self.log(f"BLOCKED: {reason}")
                    return {
                        "decision": "block",
                        "risk_level": "high",
                        "reason": reason,
                    }

        risk_level = self.get_risk_level(tool_name, tool_args, source)

        if tool_call_id and tool_call_id != "unknown":
            self.set_tool_checkpoint(
                session_key, run_id, tool_call_id, tool_name, classification, tool_args
            )

        if risk_level == "critical":
            self.log(f"BLOCKED: {tool_name} ({source}) risk={risk_level}")
            return {
                "decision": "block",
                "risk_level": risk_level,
                "reason": f"Critical risk operation from {source}",
                "self_healing": {"applicable": False, "max_retries": 0},
            }

        if risk_level == "high":
            self.log(f"REVIEW: {tool_name} ({source}) risk={risk_level}")
            return {
                "decision": "needs_review",
                "risk_level": risk_level,
                "reason": "High-risk operation requires review",
                "self_healing": {
                    "applicable": True,
                    "max_retries": self.contract["self_healing_limits"]["max_retries"],
                    "fix_strategies": ["validate", "retry"],
                },
            }

        self.log(f"ALLOW: {tool_name} ({source}) risk={risk_level} class={classification}")
        return {
            "decision": "allow",
            "risk_level": risk_level,
            "reason": "Operation allowed",
            "classification": classification,
            "self_healing": {
                "applicable": True,
                "max_retries": self.contract["self_healing_limits"]["max_retries"],
            },
        }

    def log(self, message: str, level: str = "INFO"):
        timestamp = datetime.now().isoformat()
        log_entry = f"[{timestamp}] [{level}] {message}\n"

        log_file = CONFIG["log_file"]
        log_file.parent.mkdir(parents=True, exist_ok=True)

        with open(log_file, "a") as f:
            f.write(log_entry)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 enforce.py <metadata_json>")
        sys.exit(1)

    metadata_json = sys.argv[1]
    try:
        metadata = json.loads(metadata_json)
        engine = EnforcementEngine()
        result = engine.should_block_execution(metadata)
        print(json.dumps(result))
    except Exception as e:
        error_result = {
            "decision": "block",
            "reason": f"Enforcement error: {str(e)}",
            "risk_level": "critical",
        }
        print(json.dumps(error_result))
        sys.exit(1)
