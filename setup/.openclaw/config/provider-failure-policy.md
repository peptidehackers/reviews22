# Provider Failure Policy

Use this policy for provider-facing, model-routing, or external-LLM work.

This is a compact OMX policy, not a full runtime router.

## Core Rules

### 1. Prefer the direct, current path

- use the configured provider/model path that is already proven in current config
- do not invent fallback chains from archived notes or old experiments
- treat `workspace/openarc/` as reference material, not live runtime proof

### 2. Do not retry dead providers blindly

- if a provider failure is clearly billing, quota, auth, or unsupported-model related,
  do not keep retrying the same path
- classify the failure first, then choose a different provider only if a real
  alternative is available

### 3. Fallback only when it is real

- fall back only to a provider/model path that is:
  - currently configured or otherwise directly verified
  - allowed by current policy and constraints
  - meaningfully different from the failed path
- if no safe fallback is available, fail clearly instead of hiding the problem in retries

### 4. Clamp before the next call

- if context, payload size, or request shape likely caused the failure,
  reduce or narrow the request before retrying elsewhere
- do not repeat the same oversized or malformed request on a second provider

### 5. Tell the truth about provider state

- do not claim a provider is working, configured, supported, or preferred unless
  current evidence proves it
- use `not verified` or `cannot determine from current evidence` when provider
  status is unclear

## Planning Questions

When provider/model work is in scope, the plan should answer:

1. What is the current provider path?
2. What failure class are we dealing with?
3. Is there a verified fallback?
4. What must be reduced or changed before retry?
5. What is the clear stop condition if fallback is unavailable?

## Review Standard

Reject or modify plans that:

- retry the same failing provider path without new evidence
- cite archived/provider notes as if they prove current runtime behavior
- name fallback providers that are not currently verified
- hide missing provider support behind vague “retry later” language
