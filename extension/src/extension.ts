import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("bobReadiness.hello", () => {
      void vscode.window.showInformationMessage("Bob Readiness is running");
    }),
  );
}

export function deactivate(): void {
  // nothing to clean up yet
}
