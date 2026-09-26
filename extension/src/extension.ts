import * as vscode from "vscode";
import { registerCodeLens } from "./codelens";
import { registerCommands } from "./commands";
import { ContextStore } from "./contextStore";
import { Decorations } from "./decorations";
import { Diagnostics } from "./diagnostics";
import { HighlightState } from "./highlightState";
import { registerHover } from "./hover";
import { Queue } from "./queue";
import { SessionCoins } from "./session";
import { StatusBar } from "./statusBar";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const store = new ContextStore();
  const state = new HighlightState(context.workspaceState);
  const session = new SessionCoins();
  const queue = new Queue(context.workspaceState, store);

  context.subscriptions.push(
    store,
    state,
    session,
    queue,
    new Decorations(store, state, context.extensionUri),
    new Diagnostics(store, state),
    new StatusBar(store, state, session),
    registerHover(store, state, queue),
    registerCodeLens(store, state, queue),
  );
  registerCommands(context, store, state, queue);

  await store.load();
}

export function deactivate(): void {
  // Everything is disposed through context.subscriptions.
}
