// Minimal stand-in for the "vscode" module so pure logic can be unit tested with vitest.
// Only the pieces our pure modules touch at import time are provided.
export class Range {
  constructor(
    public readonly startLine: number,
    public readonly startCharacter: number,
    public readonly endLine: number,
    public readonly endCharacter: number,
  ) {}
}
export class Position {
  constructor(public readonly line: number, public readonly character: number) {}
}
export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}
export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];
  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter((l) => l !== listener); } };
  };
  fire(e: T): void { for (const l of this.listeners) l(e); }
  dispose(): void { this.listeners = []; }
}
export class MarkdownString {
  value = "";
  isTrusted: boolean | { enabledCommands: string[] } = false;
  supportHtml = false;
  constructor(value = "") { this.value = value; }
  appendMarkdown(s: string): this { this.value += s; return this; }
  appendText(s: string): this { this.value += s; return this; }
}
export class Uri {
  private constructor(public readonly fsPath: string, public readonly scheme = "file") {}
  static file(p: string): Uri { return new Uri(p); }
  static parse(p: string): Uri { return new Uri(p, p.split(":")[0]); }
  static joinPath(base: Uri, ...paths: string[]): Uri { return new Uri([base.fsPath, ...paths].join("/")); }
  toString(): string { return `${this.scheme}://${this.fsPath}`; }
  with(): Uri { return this; }
}
export const workspace = {
  getConfiguration: () => ({ get: <T>(_k: string, d: T) => d }),
  workspaceFolders: undefined as unknown,
};
export const window = {
  showInformationMessage: async () => undefined,
  showWarningMessage: async () => undefined,
  showErrorMessage: async () => undefined,
};
export const commands = { registerCommand: () => ({ dispose() {} }), executeCommand: async () => undefined };
export class RelativePattern {
  constructor(public base: unknown, public pattern: string) {}
}
(workspace as Record<string, unknown>).onDidChangeConfiguration = () => ({ dispose() {} });
(workspace as Record<string, unknown>).createFileSystemWatcher = () => ({
  onDidChange() {}, onDidCreate() {}, onDidDelete() {}, dispose() {},
});
export class CancellationTokenSource {
  token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };
  cancel(): void { this.token.isCancellationRequested = true; }
  dispose(): void {}
}
export enum ProgressLocation { Notification = 15 }
