declare module "node:child_process" {
  export function spawn(command: string, args?: string[]): {
    stdout: { on(event: string, handler: (data: { toString(): string } | string) => void): void };
    stderr: { on(event: string, handler: (data: { toString(): string } | string) => void): void };
    on(event: "error", handler: (error: Error) => void): void;
    on(event: "close", handler: (code: number | null) => void): void;
    on(event: string, handler: (...args: unknown[]) => void): void;
  };
}

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: string): string;
  export function writeFileSync(path: string, data: string): void;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
}

declare const process: {
  env: Record<string, string | undefined>;
  cwd(): string;
};
