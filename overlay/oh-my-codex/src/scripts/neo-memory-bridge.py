#!/usr/bin/env python3
import json
import sys
from typing import Any

from neo.memory.store import FactStore
from neo.memory.models import FactKind, FactScope


CONFIDENCE_MAP = {
    "verified": 0.95,
    "high": 0.85,
    "medium": 0.65,
    "low": 0.35,
    "assumed": 0.15,
}


def load_store(working_directory: str) -> FactStore:
    return FactStore(codebase_root=working_directory, eager_init=False)


def semantic_body(payload: dict[str, Any]) -> str:
    lines = [
        f"problem: {payload.get('problem', '').strip()}",
        f"context: {payload.get('context', '').strip()}",
        f"solution: {payload.get('solution', '').strip()}",
        f"failure: {payload.get('failure', '').strip()}",
    ]
    return "\n".join(line for line in lines if not line.endswith(": "))


def handle_status(working_directory: str) -> dict[str, Any]:
    store = load_store(working_directory)
    valid_facts = [fact for fact in store._facts if getattr(fact, "is_valid", False)]
    return {
        "backend": "semantic-memory",
        "provider": "neo",
        "status": "ready",
        "fact_count": len(valid_facts),
        "project_id": store.project_id,
        "org_id": store.org_id,
    }


def handle_write(working_directory: str, payload: dict[str, Any]) -> dict[str, Any]:
    store = load_store(working_directory)
    fact = store.add_fact(
        subject=payload.get("problem", "").strip() or "semantic-memory-entry",
        body=semantic_body(payload),
        kind=FactKind.PATTERN if payload.get("solution") else FactKind.FAILURE,
        scope=FactScope.PROJECT,
        confidence=CONFIDENCE_MAP.get(str(payload.get("confidence", "medium")), 0.65),
        source_file=str(payload.get("source", "")),
        source_prompt=str(payload.get("source", "")),
        tags=list(payload.get("tags", [])) + ["omx-semantic"],
        provenance="observed" if payload.get("confidence") == "verified" else "inferred",
    )
    return {
        "backend": "semantic-memory",
        "provider": "neo",
        "status": "ready",
        "action": "stored",
        "fact_id": fact.id,
        "subject": fact.subject,
        "project_id": store.project_id,
    }


def handle_search(working_directory: str, query: str, limit: int) -> dict[str, Any]:
    store = load_store(working_directory)
    facts = store.retrieve_relevant(query, k=limit)
    return {
        "backend": "semantic-memory",
        "provider": "neo",
        "status": "ready",
        "results": [
            {
                "fact_id": fact.id,
                "subject": fact.subject,
                "body": fact.body,
                "kind": fact.kind.value,
                "scope": fact.scope.value,
                "confidence": fact.metadata.confidence,
                "tags": fact.tags,
                "source": fact.metadata.source_file,
            }
            for fact in facts
        ],
    }


def main() -> int:
    if len(sys.argv) < 3:
        print(json.dumps({"error": "usage: neo-memory-bridge.py <status|write|search> <working_directory> [payload-json]"}))
        return 1

    command = sys.argv[1]
    working_directory = sys.argv[2]

    try:
        if command == "status":
            result = handle_status(working_directory)
        elif command == "write":
            payload = json.loads(sys.argv[3])
            result = handle_write(working_directory, payload)
        elif command == "search":
            payload = json.loads(sys.argv[3])
            result = handle_search(working_directory, payload.get("query", ""), int(payload.get("limit", 5)))
        else:
            print(json.dumps({"error": f"unknown command: {command}"}))
            return 1
        print(json.dumps(result))
        return 0
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
