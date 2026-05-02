/**
 * OMX Project Memory & Notepad MCP Server
 * Provides persistent project memory and session notepad tools
 * Storage: .omx/project-memory.json, .omx/notepad.md
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { readFile, writeFile, mkdir, rename, readdir } from 'fs/promises';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { parseNotepadPruneDaysOld } from './memory-validation.js';
import { autoStartStdioMcpServer } from './bootstrap.js';
import { resolveWorkingDirectoryForState } from './state-paths.js';
import { WIKI_SCHEMA_VERSION, listPages, queryWiki, readPage, readAllPages, titleToSlug, writePage, } from '../wiki/index.js';
function getMemoryPath(wd) {
    return join(wd, '.omx', 'project-memory.json');
}
function getNotepadPath(wd) {
    return join(wd, '.omx', 'notepad.md');
}
function getWikiPath(wd) {
    return join(wd, '.omx', 'wiki');
}
const MEMORY_CLASSIFICATIONS = ['repo_state', 'reference_fact', 'procedural_pattern', 'trajectory', 'exact_recall_only', 'unclassified'];
const MEMORY_CONFIDENCE = ['verified', 'high', 'medium', 'low', 'assumed'];
const WIKI_SYSTEM_FILES = new Set(['index.md', 'log.md', 'environment.md']);
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const NEO_BRIDGE_PATH = join(PACKAGE_ROOT, 'src', 'scripts', 'neo-memory-bridge.py');
function resolvePythonCommand() {
    const preferred = process.env.OMX_PYTHON_BIN;
    if (preferred && preferred.trim()) {
        return preferred.trim();
    }
    return process.env.PYENV_VERSION || process.env.PYENV_ROOT || process.env.VIRTUAL_ENV ? 'python' : 'python3';
}
const PYTHON_CMD = resolvePythonCommand();
const NEO_STATUS_TIMEOUT_MS = 10_000;
const NEO_WRITE_TIMEOUT_MS = 60_000;
const NEO_SEARCH_TIMEOUT_MS = 30_000;
const BROAD_QUERY_STOPWORDS = new Set(['problem', 'workflow', 'system', 'memory', 'note', 'notes', 'rule', 'rules', 'fix', 'issue', 'issues', 'task', 'tasks']);
const server = new Server({ name: 'omx-memory', version: '0.1.0' }, { capabilities: { tools: {} } });
export function buildMemoryServerTools() {
    return [
        {
            name: 'memory_routed_write',
            description: 'Classify, deduplicate, and write a verified memory item to exactly one owned backend.',
            inputSchema: {
                type: 'object',
                properties: {
                    classification: { type: 'string', enum: MEMORY_CLASSIFICATIONS },
                    problem: { type: 'string', description: 'Short problem statement' },
                    context: { type: 'string', description: 'Relevant context for the memory item' },
                    solution: { type: 'string', description: 'Verified solution or key fact' },
                    failure: { type: 'string', description: 'Failure mode or rejected path' },
                    confidence: { type: 'string', enum: MEMORY_CONFIDENCE },
                    source: { type: 'string', description: 'Where this memory came from' },
                    tags: { type: 'array', items: { type: 'string' }, maxItems: 20 },
                    title: { type: 'string', description: 'Optional title override for reference facts' },
                    verified: { type: 'boolean', description: 'Must be true for routed writes' },
                    workingDirectory: { type: 'string' },
                },
                required: ['classification', 'problem', 'source', 'verified'],
            },
        },
        {
            name: 'memory_backend_list',
            description: 'List available OMX memory backends and their current runtime status.',
            inputSchema: {
                type: 'object',
                properties: {
                    workingDirectory: { type: 'string' },
                },
            },
        },
        {
            name: 'memory_backend_search',
            description: 'Search across one or more OMX memory backends (project-memory, notepad, wiki, mempalace).',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search query text' },
                    backend: { type: 'string', enum: ['all', 'project-memory', 'notepad', 'semantic-memory', 'wiki', 'mempalace'] },
                    limit: { type: 'integer', minimum: 1, description: 'Maximum results to return (default: 10, max: 20)' },
                    exactRecall: { type: 'boolean', description: 'Use MemPalace fallback only when exact recall is explicitly needed and primary retrieval fails.' },
                    workingDirectory: { type: 'string' },
                },
                required: ['query'],
            },
        },
        // Project Memory tools
        {
            name: 'project_memory_read',
            description: 'Read project memory. Can read full memory or a specific section.',
            inputSchema: {
                type: 'object',
                properties: {
                    section: { type: 'string', enum: ['all', 'techStack', 'build', 'conventions', 'structure', 'notes', 'directives'] },
                    workingDirectory: { type: 'string' },
                },
            },
        },
        {
            name: 'project_memory_write',
            description: 'Write/update project memory. Can replace entirely or merge.',
            inputSchema: {
                type: 'object',
                properties: {
                    memory: { type: 'object', description: 'Memory object to write' },
                    merge: { type: 'boolean', description: 'Merge with existing (true) or replace (false)' },
                    workingDirectory: { type: 'string' },
                },
                required: ['memory'],
            },
        },
        {
            name: 'project_memory_add_note',
            description: 'Add a categorized note to project memory.',
            inputSchema: {
                type: 'object',
                properties: {
                    category: { type: 'string', description: 'Note category (build, test, deploy, env, architecture)' },
                    content: { type: 'string', description: 'Note content' },
                    workingDirectory: { type: 'string' },
                },
                required: ['category', 'content'],
            },
        },
        {
            name: 'project_memory_add_directive',
            description: 'Add a persistent directive to project memory.',
            inputSchema: {
                type: 'object',
                properties: {
                    directive: { type: 'string', description: 'The directive text' },
                    priority: { type: 'string', enum: ['high', 'normal'] },
                    context: { type: 'string' },
                    workingDirectory: { type: 'string' },
                },
                required: ['directive'],
            },
        },
        // Notepad tools
        {
            name: 'notepad_read',
            description: 'Read notepad content. Can read full or a specific section (priority, working, manual).',
            inputSchema: {
                type: 'object',
                properties: {
                    section: { type: 'string', enum: ['all', 'priority', 'working', 'manual'] },
                    workingDirectory: { type: 'string' },
                },
            },
        },
        {
            name: 'notepad_write_priority',
            description: 'Write to Priority Context section. Replaces existing. Keep under 500 chars.',
            inputSchema: {
                type: 'object',
                properties: {
                    content: { type: 'string', description: 'Priority content (under 500 chars)' },
                    workingDirectory: { type: 'string' },
                },
                required: ['content'],
            },
        },
        {
            name: 'notepad_write_working',
            description: 'Add timestamped entry to Working Memory section.',
            inputSchema: {
                type: 'object',
                properties: {
                    content: { type: 'string', description: 'Working memory entry' },
                    workingDirectory: { type: 'string' },
                },
                required: ['content'],
            },
        },
        {
            name: 'notepad_write_manual',
            description: 'Add entry to Manual section. Never auto-pruned.',
            inputSchema: {
                type: 'object',
                properties: {
                    content: { type: 'string', description: 'Manual entry content' },
                    workingDirectory: { type: 'string' },
                },
                required: ['content'],
            },
        },
        {
            name: 'notepad_prune',
            description: 'Prune Working Memory entries older than N days (default: 7).',
            inputSchema: {
                type: 'object',
                properties: {
                    daysOld: { type: 'integer', minimum: 0, description: 'Prune entries older than this many days (default: 7)' },
                    workingDirectory: { type: 'string' },
                },
            },
        },
        {
            name: 'notepad_stats',
            description: 'Get statistics about the notepad (size, entry count, oldest entry).',
            inputSchema: {
                type: 'object',
                properties: {
                    workingDirectory: { type: 'string' },
                },
            },
        },
    ];
}
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: buildMemoryServerTools(),
}));
export async function handleMemoryToolCall(request) {
    const { name, arguments: args } = request.params;
    const a = (args || {});
    let wd;
    try {
        wd = resolveWorkingDirectoryForState(a.workingDirectory);
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }],
            isError: true,
        };
    }
    switch (name) {
        case 'memory_routed_write': {
            return await handleMemoryRoutedWrite(wd, a);
        }
        case 'memory_backend_list': {
            return text({ backends: await listMemoryBackends(wd) });
        }
        case 'memory_backend_search': {
            const query = typeof a.query === 'string' ? a.query.trim() : '';
            if (!query) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ error: 'query must be a non-empty string' }) }],
                    isError: true,
                };
            }
            const backend = typeof a.backend === 'string' ? a.backend : 'all';
            const limit = Math.max(1, Math.min(20, Number.isFinite(a.limit) ? Number(a.limit) : 10));
            return text(await searchMemoryBackends(wd, query, backend, limit, Boolean(a.exactRecall)));
        }
        // === Project Memory ===
        case 'project_memory_read': {
            const memPath = getMemoryPath(wd);
            if (!existsSync(memPath)) {
                return text({ exists: false });
            }
            let data = {};
            try {
                data = JSON.parse(await readFile(memPath, 'utf-8'));
            }
            catch {
                data = {};
            }
            const section = a.section;
            if (section && section !== 'all' && section in data) {
                return text(data[section]);
            }
            return text(data);
        }
        case 'project_memory_write': {
            const memPath = getMemoryPath(wd);
            await mkdir(join(wd, '.omx'), { recursive: true });
            const merge = a.merge;
            const newMem = a.memory;
            if (merge && existsSync(memPath)) {
                let existing = {};
                try {
                    existing = JSON.parse(await readFile(memPath, 'utf-8'));
                }
                catch {
                    existing = {};
                }
                const merged = { ...existing, ...newMem };
                await writeFile(memPath, JSON.stringify(merged, null, 2));
            }
            else {
                await writeFile(memPath, JSON.stringify(newMem, null, 2));
            }
            return text({ success: true });
        }
        case 'project_memory_add_note': {
            const memPath = getMemoryPath(wd);
            await mkdir(join(wd, '.omx'), { recursive: true });
            let data = {};
            if (existsSync(memPath)) {
                try {
                    data = JSON.parse(await readFile(memPath, 'utf-8'));
                }
                catch {
                    data = {};
                }
            }
            if (!data.notes)
                data.notes = [];
            data.notes.push({
                category: a.category,
                content: a.content,
                timestamp: new Date().toISOString(),
            });
            await writeFile(memPath, JSON.stringify(data, null, 2));
            return text({ success: true, noteCount: data.notes.length });
        }
        case 'project_memory_add_directive': {
            const memPath = getMemoryPath(wd);
            await mkdir(join(wd, '.omx'), { recursive: true });
            let data = {};
            if (existsSync(memPath)) {
                try {
                    data = JSON.parse(await readFile(memPath, 'utf-8'));
                }
                catch {
                    data = {};
                }
            }
            if (!data.directives)
                data.directives = [];
            data.directives.push({
                directive: a.directive,
                priority: a.priority || 'normal',
                context: a.context,
                timestamp: new Date().toISOString(),
            });
            await writeFile(memPath, JSON.stringify(data, null, 2));
            return text({ success: true, directiveCount: data.directives.length });
        }
        // === Notepad ===
        case 'notepad_read': {
            const notePath = getNotepadPath(wd);
            if (!existsSync(notePath)) {
                return text({ exists: false, content: '' });
            }
            const content = await readFile(notePath, 'utf-8');
            const section = a.section;
            if (section && section !== 'all') {
                const sectionContent = extractSection(content, section);
                return text({ section, content: sectionContent });
            }
            return text({ content });
        }
        case 'notepad_write_priority': {
            const notePath = getNotepadPath(wd);
            await mkdir(join(wd, '.omx'), { recursive: true });
            const content = a.content;
            let existing;
            try {
                existing = await readFile(notePath, 'utf-8');
            }
            catch (err) {
                if (err.code === 'ENOENT') {
                    existing = '';
                }
                else {
                    throw err;
                }
            }
            existing = replaceSection(existing, 'PRIORITY', content.slice(0, 500));
            const tmpPath = notePath + '.tmp.' + process.pid;
            await writeFile(tmpPath, existing);
            await rename(tmpPath, notePath);
            return text({ success: true });
        }
        case 'notepad_write_working': {
            const notePath = getNotepadPath(wd);
            await mkdir(join(wd, '.omx'), { recursive: true });
            const entry = `\n[${new Date().toISOString()}] ${a.content}`;
            let existing;
            try {
                existing = await readFile(notePath, 'utf-8');
            }
            catch (err) {
                if (err.code === 'ENOENT') {
                    existing = '';
                }
                else {
                    throw err;
                }
            }
            existing = appendToSection(existing, 'WORKING MEMORY', entry);
            const tmpPath = notePath + '.tmp.' + process.pid;
            await writeFile(tmpPath, existing);
            await rename(tmpPath, notePath);
            return text({ success: true });
        }
        case 'notepad_write_manual': {
            const notePath = getNotepadPath(wd);
            await mkdir(join(wd, '.omx'), { recursive: true });
            const entry = `\n${a.content}`;
            let existing;
            try {
                existing = await readFile(notePath, 'utf-8');
            }
            catch (err) {
                if (err.code === 'ENOENT') {
                    existing = '';
                }
                else {
                    throw err;
                }
            }
            existing = appendToSection(existing, 'MANUAL', entry);
            const tmpPath = notePath + '.tmp.' + process.pid;
            await writeFile(tmpPath, existing);
            await rename(tmpPath, notePath);
            return text({ success: true });
        }
        case 'notepad_prune': {
            const notePath = getNotepadPath(wd);
            if (!existsSync(notePath)) {
                return text({ pruned: 0, message: 'No notepad file found' });
            }
            const parsedDays = parseNotepadPruneDaysOld(a.daysOld);
            if (!parsedDays.ok) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ error: parsedDays.error }) }],
                    isError: true,
                };
            }
            const days = parsedDays.days;
            const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
            const content = await readFile(notePath, 'utf-8');
            const workingSection = extractSection(content, 'WORKING MEMORY');
            if (!workingSection) {
                return text({ pruned: 0, message: 'No working memory entries found' });
            }
            const lines = workingSection.split('\n');
            let pruned = 0;
            const kept = [];
            for (const line of lines) {
                const match = line.match(/^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\]/);
                if (match) {
                    const entryTime = new Date(match[1]).getTime();
                    if (entryTime < cutoff) {
                        pruned++;
                        continue;
                    }
                }
                kept.push(line);
            }
            if (pruned > 0) {
                const updated = replaceSection(content, 'WORKING MEMORY', kept.join('\n'));
                await writeFile(notePath, updated);
            }
            return text({ pruned, remaining: kept.filter(l => l.match(/^\[/)).length });
        }
        case 'notepad_stats': {
            const notePath = getNotepadPath(wd);
            if (!existsSync(notePath)) {
                return text({ exists: false, size: 0, entryCount: 0, oldestEntry: null });
            }
            const content = await readFile(notePath, 'utf-8');
            const stats = await import('fs/promises').then(fs => fs.stat(notePath));
            const workingSection = extractSection(content, 'WORKING MEMORY');
            const timestamps = [];
            if (workingSection) {
                for (const line of workingSection.split('\n')) {
                    const match = line.match(/^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\]/);
                    if (match)
                        timestamps.push(match[1]);
                }
            }
            const prioritySection = extractSection(content, 'PRIORITY');
            const manualSection = extractSection(content, 'MANUAL');
            return text({
                exists: true,
                size: stats.size,
                sections: {
                    priority: prioritySection ? prioritySection.length : 0,
                    working: timestamps.length,
                    manual: manualSection ? manualSection.split('\n').filter(l => l.trim()).length : 0,
                },
                entryCount: timestamps.length,
                oldestEntry: timestamps.length > 0 ? timestamps[0] : null,
                newestEntry: timestamps.length > 0 ? timestamps[timestamps.length - 1] : null,
            });
        }
        default:
            return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
}
server.setRequestHandler(CallToolRequestSchema, handleMemoryToolCall);
function text(data) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
function extractSection(content, section) {
    const header = `## ${section.toUpperCase()}`;
    const idx = content.indexOf(header);
    if (idx < 0)
        return '';
    const nextHeader = content.indexOf('\n## ', idx + header.length);
    return nextHeader < 0
        ? content.slice(idx + header.length).trim()
        : content.slice(idx + header.length, nextHeader).trim();
}
function replaceSection(content, section, newContent) {
    const header = `## ${section}`;
    const idx = content.indexOf(header);
    if (idx < 0) {
        return content + `\n\n${header}\n${newContent}\n`;
    }
    const nextHeader = content.indexOf('\n## ', idx + header.length);
    if (nextHeader < 0) {
        return content.slice(0, idx) + `${header}\n${newContent}\n`;
    }
    return content.slice(0, idx) + `${header}\n${newContent}\n` + content.slice(nextHeader);
}
function appendToSection(content, section, entry) {
    const header = `## ${section}`;
    const idx = content.indexOf(header);
    if (idx < 0) {
        return content + `\n\n${header}${entry}\n`;
    }
    const nextHeader = content.indexOf('\n## ', idx + header.length);
    if (nextHeader < 0) {
        return content + entry;
    }
    return content.slice(0, nextHeader) + entry + content.slice(nextHeader);
}
async function listMemoryBackends(wd) {
    const memPath = getMemoryPath(wd);
    const notePath = getNotepadPath(wd);
    const wikiPath = getWikiPath(wd);
    const backends = [
        {
            backend: 'project-memory',
            type: 'local-file',
            status: existsSync(memPath) ? 'ready' : 'empty',
            path: memPath,
            writable: true,
        },
        {
            backend: 'notepad',
            type: 'local-file',
            status: existsSync(notePath) ? 'ready' : 'empty',
            path: notePath,
            writable: true,
        },
    ];
    let wikiStatus = 'empty';
    let totalPages = 0;
    let userPages = 0;
    if (existsSync(wikiPath)) {
        try {
            totalPages = (await readdir(wikiPath)).filter((name) => name.endsWith('.md')).length;
            userPages = Math.max(0, totalPages - Array.from(WIKI_SYSTEM_FILES).filter((name) => existsSync(join(wikiPath, name))).length);
            wikiStatus = totalPages > 0 ? 'ready' : 'empty';
        }
        catch {
            wikiStatus = 'unavailable';
        }
    }
    backends.push({
        backend: 'semantic-memory',
        type: 'external-python',
        writable: true,
        ...(getSemanticMemoryBackendStatus(wd)),
    });
    backends.push({
        backend: 'wiki',
        type: 'local-directory',
        status: wikiStatus,
        path: wikiPath,
        user_pages: userPages,
        system_pages: Math.max(0, totalPages - userPages),
        total_pages: totalPages,
        writable: true,
    });
    backends.push(await getMempalaceBackendStatus());
    return backends;
}
async function searchMemoryBackends(wd, query, backend, limit, exactRecall = false) {
    const queryMode = classifyQueryMode(query);
    const requestedBackends = backend === 'all'
        ? queryMode === 'broad_noisy'
            ? ['project-memory', 'wiki']
            : ['project-memory', 'semantic-memory', 'wiki']
        : [backend];
    const results = [];
    const unavailable = [];
    let projectMemoryStrongEnough = false;
    for (const currentBackend of requestedBackends) {
        if (results.length >= limit)
            break;
        if (currentBackend === 'project-memory') {
            const projectMatches = await searchProjectMemoryBackend(wd, query, limit - results.length, queryMode, backend !== 'all');
            if (projectMatches.length > 0 && queryMode !== 'broad_noisy') {
                const bestScore = projectMatches[0].score ?? 0;
                projectMemoryStrongEnough = bestScore >= 0.55;
            }
            results.push(...projectMatches);
            continue;
        }
        if (currentBackend === 'notepad') {
            results.push(...await searchNotepadBackend(wd, query, limit - results.length));
            continue;
        }
        if (currentBackend === 'semantic-memory') {
            if (projectMemoryStrongEnough && queryMode !== 'broad_noisy') {
                continue;
            }
            const semanticResult = searchSemanticMemoryBackend(wd, query, limit - results.length);
            if ('unavailable' in semanticResult) {
                unavailable.push({
                    backend: 'semantic-memory',
                    reason: semanticResult.unavailable,
                });
            }
            else {
                results.push(...semanticResult.results.slice(0, limit - results.length));
            }
            continue;
        }
        if (currentBackend === 'wiki') {
            results.push(...await searchWikiBackend(wd, query, limit - results.length));
            continue;
        }
        if (currentBackend === 'mempalace') {
            const mempalaceResult = searchMempalaceBackend(query);
            if ('unavailable' in mempalaceResult) {
                unavailable.push({
                    backend: 'mempalace',
                    reason: mempalaceResult.unavailable,
                });
            }
            else {
                results.push(...mempalaceResult.results.slice(0, limit - results.length));
            }
        }
    }
    if (backend === 'all' && exactRecall && results.length === 0) {
        const mempalaceResult = searchMempalaceBackend(query);
        if ('unavailable' in mempalaceResult) {
            unavailable.push({
                backend: 'mempalace',
                reason: mempalaceResult.unavailable,
            });
        }
        else {
            results.push(...mempalaceResult.results.slice(0, limit));
        }
    }
    return {
        query,
        backend,
        query_mode: queryMode,
        retrieval_order: backend === 'all'
            ? ['project-memory', 'semantic-memory', 'wiki', ...(exactRecall ? ['mempalace:fallback'] : [])]
            : [backend],
        resultCount: results.length,
        results,
        unavailable,
    };
}
async function searchProjectMemoryBackend(wd, query, limit, queryMode = 'semantic', includeLegacy = false) {
    const memPath = getMemoryPath(wd);
    if (!existsSync(memPath) || limit <= 0)
        return [];
    let data = {};
    try {
        data = JSON.parse(await readFile(memPath, 'utf-8'));
    }
    catch {
        return [];
    }
    return scoreProjectMemoryEntries(collectProjectMemorySearchEntries(data, includeLegacy), query, queryMode)
        .slice(0, limit)
        .map((entry) => ({
        backend: 'project-memory',
        section: entry.section,
        title: entry.title,
        snippet: buildSnippet(entry.text, query),
        path: memPath,
        score: entry.score,
    }));
}
function collectProjectMemorySearchEntries(data, includeLegacy = false) {
    const entries = [];
    if (Array.isArray(data?.memory_items)) {
        data.memory_items.forEach((item, index) => {
            entries.push({
                section: 'memory_items',
                title: item.title || item.problem || item.id || `memory_items[${index}]`,
                text: JSON.stringify(item, null, 2),
            });
        });
    }
    if (!includeLegacy) {
        return entries;
    }
    for (const [section, value] of Object.entries(data || {})) {
        if (section === 'memory_items')
            continue;
        if (Array.isArray(value)) {
            value.forEach((item, index) => {
                const serialized = typeof item === 'string' ? item : JSON.stringify(item, null, 2);
                entries.push({
                    section,
                    title: `${section}[${index}]`,
                    text: serialized,
                });
            });
            continue;
        }
        if (value && typeof value === 'object') {
            entries.push({
                section,
                title: section,
                text: JSON.stringify(value, null, 2),
            });
            continue;
        }
        entries.push({
            section,
            title: section,
            text: String(value),
        });
    }
    return entries;
}
function classifyQueryMode(query) {
    const normalized = normalizeForFingerprint(query);
    const tokens = tokenizeForSearch(normalized);
    if (/[A-Z0-9_]{6,}/.test(query) || /["']/.test(query)) {
        return 'exact';
    }
    if (tokens.length <= 2 && tokens.every((token) => BROAD_QUERY_STOPWORDS.has(token))) {
        return 'broad_noisy';
    }
    if (tokens.length === 1 && tokens[0].length <= 8) {
        return 'broad_noisy';
    }
    return 'semantic';
}
function tokenizeForSearch(text) {
    return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
function scoreProjectMemoryEntries(entries, query, queryMode) {
    const normalizedQuery = normalizeForFingerprint(query);
    const queryTokens = tokenizeForSearch(normalizedQuery);
    const scored = [];
    for (const entry of entries) {
        const text = String(entry.text || '');
        const normalizedText = normalizeForFingerprint(text);
        const title = normalizeForFingerprint(entry.title || '');
        const textTokens = new Set(tokenizeForSearch(normalizedText));
        const overlap = queryTokens.filter((token) => textTokens.has(token));
        let score = 0;
        if (normalizedText.includes(normalizedQuery) || title.includes(normalizedQuery)) {
            score += 1;
        }
        score += overlap.length / Math.max(1, queryTokens.length);
        if (entry.section === 'memory_items')
            score += 0.15;
        if (queryMode === 'broad_noisy') {
            if (entry.section === 'memory_items') {
                continue;
            }
            const exactTitleMatch = title === normalizedQuery;
            const strongTagMatch = queryTokens.length > 0 && queryTokens.every((token) => title.includes(token));
            if (!exactTitleMatch && !strongTagMatch) {
                continue;
            }
        }
        else if (score < 0.25) {
            continue;
        }
        scored.push({ ...entry, score });
    }
    scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return compressProjectMemoryResults(scored);
}
function compressProjectMemoryResults(entries) {
    const seen = new Set();
    const compressed = [];
    for (const entry of entries) {
        const key = `${entry.section}:${normalizeForFingerprint(entry.title || entry.text || '')}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        compressed.push(entry);
    }
    return compressed;
}
async function handleMemoryRoutedWrite(wd, args) {
    if (args.verified !== true) {
        return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'memory_routed_write requires verified=true' }) }],
            isError: true,
        };
    }
    const classification = typeof args.classification === 'string' ? args.classification : 'unclassified';
    const allowed = new Set(MEMORY_CLASSIFICATIONS);
    if (!allowed.has(classification)) {
        return {
            content: [{ type: 'text', text: JSON.stringify({ error: `Unknown classification: ${classification}` }) }],
            isError: true,
        };
    }
    const entry = buildStructuredMemoryEntry(args);
    const intendedBackend = classification === 'repo_state'
        ? 'project-memory'
        : classification === 'reference_fact'
            ? 'wiki'
            : 'rejected';
    const crossBackendDuplicate = await findCrossBackendDuplicate(wd, entry);
    if (crossBackendDuplicate && crossBackendDuplicate.backend !== intendedBackend) {
        return text({
            accepted: false,
            classification,
            route: 'rejected_duplicate',
            existing_backend: crossBackendDuplicate.backend,
            existing_id: crossBackendDuplicate.id,
            reason: `similar memory item already exists in ${crossBackendDuplicate.backend}`,
        });
    }
    if (classification === 'repo_state') {
        return text(await routeRepoStateWrite(wd, entry));
    }
    if (classification === 'reference_fact') {
        return text(await routeReferenceFactWrite(wd, entry));
    }
    return text({
        accepted: false,
        classification,
        route: 'rejected',
        reason: rejectionReasonForClassification(classification),
    });
}
function buildStructuredMemoryEntry(args) {
    const timestamp = new Date().toISOString();
    const classification = String(args.classification || 'unclassified');
    const type = classification === 'repo_state'
        ? 'state'
        : classification === 'reference_fact'
            ? 'reference'
            : classification === 'procedural_pattern'
                ? 'procedural'
                : classification === 'trajectory'
                    ? 'trajectory'
                    : classification === 'exact_recall_only'
                        ? 'exact_recall'
                        : 'semantic';
    const problem = String(args.problem || '').trim();
    const context = String(args.context || '').trim();
    const solution = String(args.solution || '').trim();
    const failure = String(args.failure || '').trim();
    const source = String(args.source || '').trim();
    const tags = Array.isArray(args.tags) ? args.tags.map((value) => String(value).trim()).filter(Boolean) : [];
    const confidence = typeof args.confidence === 'string' && MEMORY_CONFIDENCE.includes(args.confidence)
        ? args.confidence
        : 'verified';
    const fingerprint = createMemoryFingerprint({ classification, problem, context, solution, failure, source });
    return {
        id: `mem-${fingerprint.slice(0, 24)}`,
        type,
        classification,
        problem,
        context,
        solution,
        failure,
        confidence,
        source,
        timestamp,
        tags,
        title: typeof args.title === 'string' && args.title.trim() ? args.title.trim() : problem,
        fingerprint,
    };
}
function createMemoryFingerprint(input) {
    return normalizeForFingerprint(Object.values(input).join(' ')).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 200);
}
function normalizeForFingerprint(value) {
    return value.toLowerCase().replace(/\s+/g, ' ').trim();
}
function rejectionReasonForClassification(classification) {
    if (classification === 'procedural_pattern')
        return 'procedural patterns belong in skills, not routed memory storage';
    if (classification === 'trajectory')
        return 'trajectories belong in trace/audit storage, not routed memory storage';
    if (classification === 'exact_recall_only')
        return 'exact recall items belong in MemPalace only when explicitly intended';
    return 'unclassified memory item rejected';
}
async function routeRepoStateWrite(wd, entry) {
    const memPath = getMemoryPath(wd);
    await mkdir(join(wd, '.omx'), { recursive: true });
    let data = {};
    if (existsSync(memPath)) {
        try {
            data = JSON.parse(await readFile(memPath, 'utf-8'));
        }
        catch {
            data = {};
        }
    }
    if (!Array.isArray(data.memory_items))
        data.memory_items = [];
    const duplicateIndex = data.memory_items.findIndex((item) => item?.fingerprint === entry.fingerprint
        || (item?.classification === entry.classification && item?.problem === entry.problem && item?.source === entry.source));
    if (duplicateIndex >= 0) {
        data.memory_items[duplicateIndex] = { ...data.memory_items[duplicateIndex], ...entry };
        await writeFile(memPath, JSON.stringify(data, null, 2));
        const semantic = maybeWriteSemanticMemory(wd, entry);
        return {
            accepted: true,
            classification: entry.classification,
            route: 'project-memory',
            action: 'updated',
            id: data.memory_items[duplicateIndex].id,
            path: memPath,
            semantic_memory: semantic,
        };
    }
    data.memory_items.push(entry);
    await writeFile(memPath, JSON.stringify(data, null, 2));
    const semantic = maybeWriteSemanticMemory(wd, entry);
    return {
        accepted: true,
        classification: entry.classification,
        route: 'project-memory',
        action: 'created',
        id: entry.id,
        path: memPath,
        semantic_memory: semantic,
    };
}
async function routeReferenceFactWrite(wd, entry) {
    const title = entry.title || entry.problem || 'Memory Reference';
    const slug = titleToSlug(title);
    const filename = slug.endsWith('.md') ? slug : `${slug}.md`;
    const existing = readPage(wd, filename);
    const page = {
        filename,
        frontmatter: {
            title,
            tags: Array.from(new Set(['memory-router', ...entry.tags])),
            created: existing?.frontmatter.created || entry.timestamp,
            updated: entry.timestamp,
            sources: [entry.source],
            links: [],
            category: 'reference',
            confidence: entry.confidence === 'verified' ? 'high' : entry.confidence === 'assumed' ? 'low' : 'medium',
            schemaVersion: WIKI_SCHEMA_VERSION,
        },
        content: buildReferencePageContent(entry),
    };
    if (existing && normalizeForFingerprint(existing.content) === normalizeForFingerprint(page.content)) {
        return {
            accepted: true,
            classification: entry.classification,
            route: 'wiki',
            action: 'skipped_duplicate',
            page: filename,
        };
    }
    writePage(wd, page);
    return {
        accepted: true,
        classification: entry.classification,
        route: 'wiki',
        action: existing ? 'updated' : 'created',
        page: filename,
    };
}
function buildReferencePageContent(entry) {
    const lines = [
        '',
        `# ${entry.title}`,
        '',
        `- id: ${entry.id}`,
        `- fingerprint: ${entry.fingerprint}`,
        `- type: ${entry.type}`,
        `- classification: ${entry.classification}`,
        `- confidence: ${entry.confidence}`,
        `- source: ${entry.source}`,
        `- timestamp: ${entry.timestamp}`,
    ];
    if (entry.problem)
        lines.push('', '## Problem', '', entry.problem);
    if (entry.context)
        lines.push('', '## Context', '', entry.context);
    if (entry.solution)
        lines.push('', '## Solution', '', entry.solution);
    if (entry.failure)
        lines.push('', '## Failure', '', entry.failure);
    return lines.join('\n');
}
function getSemanticMemoryBackendStatus(wd) {
    if (!existsSync(NEO_BRIDGE_PATH)) {
        return {
            status: 'unavailable',
            reason: 'neo bridge script not found',
        };
    }
    try {
        const output = execFileSync(PYTHON_CMD, [NEO_BRIDGE_PATH, 'status', wd], {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: NEO_STATUS_TIMEOUT_MS,
        });
        const parsed = JSON.parse(output);
        return {
            status: parsed.status || 'ready',
            provider: parsed.provider || 'neo',
            fact_count: parsed.fact_count ?? 0,
            project_id: parsed.project_id || '',
        };
    }
    catch (error) {
        return {
            status: 'unavailable',
            reason: extractCommandErrorText(error) || 'neo bridge status failed',
        };
    }
}
function maybeWriteSemanticMemory(wd, entry) {
    if (!existsSync(NEO_BRIDGE_PATH))
        return { status: 'skipped', reason: 'neo bridge missing' };
    if (!entry.solution && !entry.failure)
        return { status: 'skipped', reason: 'no semantic pattern content' };
    try {
        const output = execFileSync(PYTHON_CMD, [NEO_BRIDGE_PATH, 'write', wd, JSON.stringify({
                problem: entry.problem,
                context: entry.context,
                solution: entry.solution,
                failure: entry.failure,
                confidence: entry.confidence,
                source: entry.source,
                tags: entry.tags,
            })], {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: NEO_WRITE_TIMEOUT_MS,
        });
        return JSON.parse(output);
    }
    catch (error) {
        return {
            status: 'unavailable',
            reason: extractCommandErrorText(error) || 'neo bridge write failed',
        };
    }
}
function searchSemanticMemoryBackend(wd, query, limit) {
    if (!existsSync(NEO_BRIDGE_PATH)) {
        return { unavailable: 'neo bridge script not found' };
    }
    try {
        const output = execFileSync(PYTHON_CMD, [NEO_BRIDGE_PATH, 'search', wd, JSON.stringify({ query, limit })], {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: NEO_SEARCH_TIMEOUT_MS,
        });
        const parsed = JSON.parse(output);
        return {
            results: Array.isArray(parsed.results)
                ? compressSemanticResults(parsed.results.map((entry) => ({
                    backend: 'semantic-memory',
                    title: entry.subject,
                    snippet: buildSnippet(entry.body || entry.subject || '', query),
                    confidence: entry.confidence,
                    tags: entry.tags || [],
                    source: entry.source || '',
                    fact_id: entry.fact_id,
                })))
                : [],
        };
    }
    catch (error) {
        return {
            unavailable: extractCommandErrorText(error) || 'neo bridge search failed',
        };
    }
}
async function findCrossBackendDuplicate(wd, entry) {
    const memPath = getMemoryPath(wd);
    if (existsSync(memPath)) {
        try {
            const data = JSON.parse(await readFile(memPath, 'utf-8'));
            if (Array.isArray(data?.memory_items)) {
                const projectMatch = data.memory_items.find((item) => item?.fingerprint === entry.fingerprint
                    || (item?.problem === entry.problem && item?.source === entry.source));
                if (projectMatch) {
                    return {
                        backend: 'project-memory',
                        id: projectMatch.id,
                    };
                }
            }
        }
        catch {
        }
    }
    for (const page of readAllPages(wd)) {
        const normalizedContent = normalizeForFingerprint(page.content);
        if (normalizedContent.includes(entry.fingerprint)
            || normalizedContent.includes(normalizeForFingerprint(entry.problem))) {
            return {
                backend: 'wiki',
                id: page.filename,
            };
        }
    }
    return null;
}
async function searchNotepadBackend(wd, query, limit) {
    const notePath = getNotepadPath(wd);
    if (!existsSync(notePath) || limit <= 0)
        return [];
    const content = await readFile(notePath, 'utf-8');
    return [
        { section: 'priority', text: extractSection(content, 'PRIORITY') },
        { section: 'working', text: extractSection(content, 'WORKING MEMORY') },
        { section: 'manual', text: extractSection(content, 'MANUAL') },
    ]
        .filter((entry) => entry.text && entry.text.toLowerCase().includes(query.toLowerCase()))
        .slice(0, limit)
        .map((entry) => ({
        backend: 'notepad',
        section: entry.section,
        title: entry.section,
        snippet: buildSnippet(entry.text, query),
        path: notePath,
    }));
}
async function searchWikiBackend(wd, query, limit) {
    const wikiPath = getWikiPath(wd);
    if (!existsSync(wikiPath) || limit <= 0)
        return [];
    let files = [];
    try {
        files = (await readdir(wikiPath)).filter((name) => name.endsWith('.md'));
    }
    catch {
        return [];
    }
    const results = [];
    for (const file of files) {
        if (results.length >= limit)
            break;
        const filePath = join(wikiPath, file);
        const content = await readFile(filePath, 'utf-8');
        if (!content.toLowerCase().includes(query.toLowerCase()))
            continue;
        results.push({
            backend: 'wiki',
            title: file,
            snippet: buildSnippet(content, query),
            path: filePath,
        });
    }
    return results;
}
async function getMempalaceBackendStatus() {
    try {
        execFileSync('mempalace', ['--help'], { stdio: 'ignore' });
    }
    catch (error) {
        return {
            backend: 'mempalace',
            type: 'external-cli',
            status: 'unavailable',
            writable: false,
            reason: error?.code === 'ENOENT' ? 'mempalace command not found' : 'mempalace help command failed',
        };
    }
    try {
        const output = execFileSync('mempalace', ['status'], {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        if (output.includes('No palace found')) {
            return {
                backend: 'mempalace',
                type: 'external-cli',
                status: 'unconfigured',
                writable: false,
                reason: output.trim(),
            };
        }
        return {
            backend: 'mempalace',
            type: 'external-cli',
            status: 'ready',
            writable: false,
            detail: normalizeMempalaceOutput(output.trim()),
        };
    }
    catch (error) {
        const detail = normalizeMempalaceOutput(extractCommandErrorText(error));
        return {
            backend: 'mempalace',
            type: 'external-cli',
            status: detail.includes('No palace found') ? 'unconfigured' : 'unavailable',
            writable: false,
            reason: detail || 'mempalace status failed',
        };
    }
}
function searchMempalaceBackend(query) {
    try {
        const output = execFileSync('mempalace', ['search', query], {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return {
            results: [{
                    backend: 'mempalace',
                    title: 'mempalace search',
                    snippet: normalizeMempalaceOutput(output.trim()),
                }],
        };
    }
    catch (error) {
        return {
            unavailable: normalizeMempalaceOutput(extractCommandErrorText(error)) || 'mempalace search failed',
        };
    }
}
function normalizeMempalaceOutput(text) {
    if (!text)
        return '';
    return text
        .replaceAll('/Users/apps/.omx/mempalace-source/', '/Users/apps/')
        .replaceAll('/Users/apps/.omx/mempalace-source', '/Users/apps')
        .replaceAll('mempalace_source / documentation', '/Users/apps / documentation')
        .replaceAll('mempalace_source / scripts', '/Users/apps / scripts')
        .replaceAll('mempalace_source / templates', '/Users/apps / templates')
        .replaceAll('mempalace_source / overlay', '/Users/apps / overlay')
        .replaceAll('mempalace_source / bin', '/Users/apps / bin')
        .replaceAll('mempalace_source / general', '/Users/apps / general');
}
function extractCommandErrorText(error) {
    if (!error)
        return '';
    const stdout = typeof error.stdout === 'string' ? error.stdout.trim() : '';
    const stderr = typeof error.stderr === 'string' ? error.stderr.trim() : '';
    return [stdout, stderr].filter(Boolean).join('\n').trim();
}
function buildSnippet(text, query) {
    const normalizedText = text.replace(/\s+/g, ' ').trim();
    if (!normalizedText)
        return '';
    const lowerText = normalizedText.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    if (index < 0) {
        return normalizedText.length > 180 ? normalizedText.slice(0, 177) + '...' : normalizedText;
    }
    const start = Math.max(0, index - 70);
    const end = Math.min(normalizedText.length, index + query.length + 70);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < normalizedText.length ? '...' : '';
    return prefix + normalizedText.slice(start, end) + suffix;
}
function compressSemanticResults(entries) {
    const byTitle = new Map();
    for (const entry of entries) {
        const key = normalizeForFingerprint(entry.title || '');
        const existing = byTitle.get(key);
        if (!existing || (entry.confidence ?? 0) > (existing.confidence ?? 0)) {
            byTitle.set(key, entry);
        }
    }
    return Array.from(byTitle.values()).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
}
autoStartStdioMcpServer('memory', server);
//# sourceMappingURL=memory-server.js.map
