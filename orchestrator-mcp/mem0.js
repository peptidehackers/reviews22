/**
 * Mem0 Integration - Persistent memory for patterns, fixes, and learned context
 */

const MEM0_API_KEY = process.env.MEM0_API_KEY;
const MEM0_API_URL = "https://api.mem0.ai/v1";

/**
 * Check if mem0 is configured
 */
export function isMem0Available() {
  return !!MEM0_API_KEY;
}

/**
 * Search memories for relevant context
 */
export async function searchMemories(query, options = {}) {
  if (!MEM0_API_KEY) {
    return { success: false, error: "MEM0_API_KEY not configured" };
  }

  const { limit = 10, userId = "orchestrator" } = options;

  try {
    const response = await fetch(`${MEM0_API_URL}/memories/search/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Token ${MEM0_API_KEY}`
      },
      body: JSON.stringify({
        query,
        user_id: userId,
        limit
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mem0 API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return {
      success: true,
      memories: data.results || data.memories || data || [],
      query
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      query
    };
  }
}

/**
 * Add a memory
 */
export async function addMemory(content, options = {}) {
  if (!MEM0_API_KEY) {
    return { success: false, error: "MEM0_API_KEY not configured" };
  }

  const { userId = "orchestrator", metadata = {} } = options;

  try {
    const response = await fetch(`${MEM0_API_URL}/memories/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Token ${MEM0_API_KEY}`
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content
          }
        ],
        user_id: userId,
        metadata
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mem0 API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return {
      success: true,
      memory: data,
      content: content.substring(0, 100) + "..."
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get all memories for a user
 */
export async function getMemories(options = {}) {
  if (!MEM0_API_KEY) {
    return { success: false, error: "MEM0_API_KEY not configured" };
  }

  const { userId = "orchestrator", limit = 50 } = options;

  try {
    const response = await fetch(`${MEM0_API_URL}/memories/?user_id=${userId}&limit=${limit}`, {
      method: "GET",
      headers: {
        "Authorization": `Token ${MEM0_API_KEY}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mem0 API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return {
      success: true,
      memories: data.results || data.memories || data || [],
      count: (data.results || data.memories || data || []).length
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Format memories for context injection
 */
export function formatMemoriesForContext(memories) {
  if (!memories || memories.length === 0) {
    return "No relevant memories found.";
  }

  const lines = ["## Relevant Memories from Mem0\n"];

  for (const mem of memories) {
    const content = mem.memory || mem.content || mem.text || JSON.stringify(mem);
    const score = mem.score ? ` (relevance: ${(mem.score * 100).toFixed(0)}%)` : "";
    lines.push(`- ${content}${score}`);
  }

  return lines.join("\n");
}

/**
 * Build memory content for storage after successful fix
 */
export function buildFixMemory(options) {
  const {
    bugType,
    rootCause,
    fixApproach,
    filesAffected,
    edgeCases,
    modelFindings,
    consensus
  } = options;

  const lines = [
    `Bug Type: ${bugType}`,
    `Root Cause: ${rootCause}`,
    `Fix Approach: ${fixApproach}`,
    `Files Affected: ${filesAffected.join(", ")}`,
  ];

  if (edgeCases && edgeCases.length > 0) {
    lines.push(`Edge Cases: ${edgeCases.join("; ")}`);
  }

  if (modelFindings) {
    lines.push(`Model Insights: ${modelFindings}`);
  }

  if (consensus) {
    lines.push(`Consensus Confidence: ${(consensus * 100).toFixed(0)}%`);
  }

  return lines.join("\n");
}
