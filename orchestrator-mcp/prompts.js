/**
 * Dual-Prompt Templates - Different prompts for different model families
 *
 * Claude-like models: Mechanics-driven (detailed checklists, step-by-step)
 * GPT-like models: Principle-driven (concise principles, explicit criteria)
 */

import { getPromptStyle } from "./models.js";

// Prompt templates by task type and style
const PROMPTS = {
  codeReview: {
    mechanics: `## Code Review Checklist

Follow this checklist systematically:

### 1. Correctness
- [ ] Logic errors
- [ ] Off-by-one errors
- [ ] Null/undefined handling
- [ ] Edge cases

### 2. Security
- [ ] Injection vulnerabilities (SQL, XSS, command)
- [ ] Authentication/authorization issues
- [ ] Sensitive data exposure
- [ ] Input validation

### 3. Performance
- [ ] N+1 queries
- [ ] Unnecessary iterations
- [ ] Memory leaks
- [ ] Blocking operations

### 4. Code Quality
- [ ] Code style violations
- [ ] Dead code
- [ ] Duplicated code
- [ ] Poor naming

For EACH issue found, provide:
1. File and line number
2. Severity: critical/high/medium/low
3. Description of the issue
4. Suggested fix with code example

Output as structured list.`,

    principles: `Principle: Identify all defects that could cause incorrect behavior, security risk, or performance degradation.

Decision Complete: Report must leave zero ambiguity about what to fix.

Output format for each issue:
- severity: critical|high|medium|low
- location: file:line
- issue: what is wrong
- fix: how to fix it

Completeness: After listing issues, confirm whether any obvious bugs remain.`
  },

  debug: {
    mechanics: `## Debug Protocol

Follow these steps in order:

### Step 1: Reproduce
- What is the expected behavior?
- What is the actual behavior?
- What are the reproduction steps?

### Step 2: Identify Symptoms
- Error messages
- Stack traces
- Unexpected values
- Missing data

### Step 3: Enumerate Possible Causes
List ALL possible causes (minimum 3):
1. [Cause]
2. [Cause]
3. [Cause]

### Step 4: Evidence Gathering
For each cause, evaluate:
- What evidence supports this cause?
- What evidence contradicts it?
- Confidence level (high/medium/low)

### Step 5: Root Cause Ranking
Rank causes by likelihood with reasoning.

### Step 6: Proposed Fix
For the most likely cause:
- Exact change needed
- Files to modify
- Code snippet

### Step 7: Verification
- How to verify the fix works
- What tests to run
- What edge cases to check`,

    principles: `Principle: Find the root cause, not just symptoms. A fix that doesn't address root cause will fail again.

Decision Complete: Your output must leave zero ambiguity about:
1. What the root cause is
2. What exact change to make
3. How to verify it works

Output format:
- root_cause: what is actually wrong
- evidence: proof that this is the cause
- fix: exact code change
- verification: how to confirm it works
- alternative_causes: other possibilities if primary is wrong`
  },

  edgeCases: {
    mechanics: `## Edge Case Analysis

Systematically check each category:

### Input Boundaries
- Empty/null/undefined inputs
- Minimum and maximum values
- Boundary conditions (0, 1, -1, MAX_INT)
- Unicode and special characters

### State Transitions
- Initial state
- Final state
- Interrupted operations
- Concurrent access

### Error Conditions
- Network failures
- Timeout scenarios
- Permission denied
- Resource exhaustion

### Race Conditions
- Multiple simultaneous requests
- Out-of-order events
- Stale data
- Lock contention

### Data Integrity
- Partial writes
- Corrupted input
- Type mismatches
- Format violations

For EACH edge case found:
1. Scenario description
2. Why it's a problem
3. Current behavior
4. Suggested handling`,

    principles: `Principle: If it can fail, it will fail. Find every failure mode before production does.

Focus areas:
- Inputs: empty, null, boundary values, invalid types
- State: race conditions, partial operations, stale data
- External: network, disk, permissions, timeouts

Output for each edge case:
- scenario: what happens
- risk: what could go wrong
- likelihood: how likely in production
- mitigation: how to handle it`
  },

  security: {
    mechanics: `## Security Audit Checklist

### Injection Vulnerabilities
- [ ] SQL injection
- [ ] Command injection
- [ ] XSS (reflected, stored, DOM)
- [ ] Template injection
- [ ] Path traversal

### Authentication
- [ ] Weak password requirements
- [ ] Missing rate limiting
- [ ] Session management issues
- [ ] JWT vulnerabilities
- [ ] OAuth misconfiguration

### Authorization
- [ ] Missing access controls
- [ ] IDOR vulnerabilities
- [ ] Privilege escalation
- [ ] Role bypass

### Data Protection
- [ ] Sensitive data in logs
- [ ] Unencrypted transmission
- [ ] Insecure storage
- [ ] Data leakage

### Configuration
- [ ] Debug mode in production
- [ ] Default credentials
- [ ] Missing security headers
- [ ] CORS misconfiguration

For EACH vulnerability:
1. CWE ID if applicable
2. Severity: critical/high/medium/low
3. Location in code
4. Proof of concept
5. Remediation steps`,

    principles: `Principle: Assume malicious input. Every input is an attack vector until proven safe.

Check for:
1. Injection: SQL, XSS, command, path traversal
2. Auth: broken authentication, missing authorization
3. Data: exposure, insecure storage, leakage

Output for each finding:
- vulnerability: type and description
- severity: critical|high|medium|low
- location: where in code
- exploit: how it could be attacked
- fix: how to remediate`
  },

  architecture: {
    mechanics: `## Architecture Review

### Component Analysis
- What are the main components?
- What are their responsibilities?
- How do they communicate?

### Coupling Assessment
- Which components are tightly coupled?
- Where are the dependency issues?
- What would break if X changes?

### Scalability Check
- What are the bottlenecks?
- How does it handle increased load?
- What are the scaling limits?

### Maintainability
- Is the code well-organized?
- Are concerns properly separated?
- Is it testable?

### Data Flow
- How does data move through the system?
- Where are the data stores?
- Are there consistency issues?

### Recommendations
For each issue:
1. Current state
2. Problem it causes
3. Recommended change
4. Migration path`,

    principles: `Principle: Good architecture enables change. Bad architecture resists it.

Evaluate:
1. Coupling: can parts change independently?
2. Cohesion: do related things stay together?
3. Scalability: where are the limits?
4. Testability: can it be tested in isolation?

Output:
- strengths: what's done well
- weaknesses: what needs improvement
- risks: what could cause problems
- recommendations: specific changes to make`
  }
};

/**
 * Get the appropriate prompt for a task type and model
 */
export function getPrompt(taskType, model, context = "") {
  const style = getPromptStyle(model);
  const templates = PROMPTS[taskType];

  if (!templates) {
    return context; // No template, just use context
  }

  const template = templates[style] || templates.mechanics;

  // Append context if provided
  if (context) {
    return `${template}\n\n## Content to Analyze\n\n${context}`;
  }

  return template;
}

/**
 * Get prompt without model-specific adjustment (raw template)
 */
export function getRawPrompt(taskType, style = "mechanics") {
  const templates = PROMPTS[taskType];
  return templates?.[style] || null;
}

/**
 * List available prompt templates
 */
export function listPromptTemplates() {
  return Object.keys(PROMPTS);
}

/**
 * Get both versions of a prompt for comparison
 */
export function getPromptComparison(taskType) {
  const templates = PROMPTS[taskType];
  if (!templates) {
    return null;
  }

  return {
    taskType,
    mechanics: templates.mechanics,
    principles: templates.principles,
    mechanicsLength: templates.mechanics.length,
    principlesLength: templates.principles.length
  };
}

/**
 * Build a custom prompt with context
 */
export function buildPrompt(options) {
  const { taskType, model, context, additionalInstructions } = options;

  let prompt = getPrompt(taskType, model, context);

  if (additionalInstructions) {
    prompt += `\n\n## Additional Instructions\n\n${additionalInstructions}`;
  }

  return prompt;
}
