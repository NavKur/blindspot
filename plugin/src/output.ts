import * as vscode from "vscode";

/** The "Bob Readiness" Output channel with timestamped lines, as in ref-03. */
export class Log implements vscode.Disposable {
  private readonly channel = vscode.window.createOutputChannel("Bob Readiness");

  line(text: string): void {
    const t = new Date();
    const stamp = [t.getHours(), t.getMinutes(), t.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
    this.channel.appendLine(`[${stamp}] ${text}`);
  }

  show(): void {
    this.channel.show(true);
  }

  dispose(): void {
    this.channel.dispose();
  }
}
