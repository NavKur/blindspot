import { spawn } from "node:child_process";
import type * as vscode from "vscode";

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled: boolean;
}

export interface RunOptions {
  cwd: string;
  /** Text written to stdin, then stdin is closed. */
  stdin?: string;
  timeoutMs?: number;
  token?: vscode.CancellationToken;
  /** Receives every output line as it arrives. */
  onLine?: (line: string, stream: "stdout" | "stderr") => void;
  /** Run through the user's shell (for test commands like "pytest -q"). */
  shell?: boolean;
}

/** Spawn a process, stream its output line by line and collect the result. Never throws. */
export function runProcess(command: string, args: string[], options: RunOptions): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let cancelled = false;
    let settled = false;

    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: options.shell ?? false,
      env: { ...process.env, CI: "1", NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cancelSub?.dispose();
      resolve({ code, stdout, stderr, timedOut, cancelled });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 3000).unref();
    }, options.timeoutMs ?? 10 * 60 * 1000);

    const cancelSub = options.token?.onCancellationRequested(() => {
      cancelled = true;
      child.kill("SIGTERM");
    });

    const pipe = (stream: NodeJS.ReadableStream | null, which: "stdout" | "stderr") => {
      if (!stream) return;
      let buffer = "";
      stream.setEncoding("utf8");
      stream.on("data", (chunk: string) => {
        if (which === "stdout") stdout += chunk;
        else stderr += chunk;
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) options.onLine?.(line, which);
      });
      stream.on("end", () => {
        if (buffer) options.onLine?.(buffer, which);
      });
    };
    pipe(child.stdout, "stdout");
    pipe(child.stderr, "stderr");

    child.on("error", (err) => {
      stderr += `\n${err.message}`;
      options.onLine?.(err.message, "stderr");
      finish(null);
    });
    child.on("close", (code) => finish(code));

    if (options.stdin !== undefined) {
      child.stdin?.on("error", () => undefined);
      child.stdin?.end(options.stdin);
    } else {
      child.stdin?.end();
    }
  });
}
