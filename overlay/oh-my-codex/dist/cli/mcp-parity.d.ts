interface ParsedMcpCliArgs {
    toolName: string | null;
    input: Record<string, unknown>;
    json: boolean;
    help: boolean;
}
type McpParityCommandName = "state" | "memory" | "notepad" | "project-memory" | "trace" | "code-intel" | "wiki";
export type McpParityExecutionResult = {
    ok: true;
    help: string;
} | {
    ok: true;
    data: unknown;
} | {
    ok: false;
    error: unknown;
};
export declare function parseMcpCliArgs(args: string[]): ParsedMcpCliArgs;
export declare function mcpParityCommand(commandName: McpParityCommandName, args: string[]): Promise<void>;
export declare function executeMcpParityCommand(commandName: McpParityCommandName, args: string[]): Promise<McpParityExecutionResult>;
export {};
//# sourceMappingURL=mcp-parity.d.ts.map
