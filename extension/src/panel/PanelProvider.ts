import * as vscode from "vscode";
import { openFileAtLine } from "../commands";
import type { ContextStore } from "../contextStore";
import type { Queue } from "../queue";
import type { SessionCoins } from "../session";
import { nonce, panelHtml } from "./html";
import { buildPanelState, TAB_IDS, type PanelState, type TabId } from "./state";

const TAB_KEY = "bobReadiness.activeTab";

/** Messages the webview sends. Anything else is ignored. */
export type PanelMessage =
  | { type: "ready" }
  | { type: "setTab"; tab: string }
  | { type: "openFile"; file: string; line: number }
  | { type: "openDiff"; file: string }
  | { type: "toggleFinding"; id: string; selected: boolean }
  | { type: "sendToBob" }
  | { type: "keep" }
  | { type: "discard" }
  | { type: "cancelRun" }
  | { type: "dismissRun" }
  | { type: "runTests" }
  | { type: "copyReleaseNotes" }
  | { type: "ask"; question: string };

/** Other features plug in here so the provider stays small. */
export interface PanelExtras {
  /** Extra state merged into the PanelState before posting (release, onboarding, run). */
  extraState?: () => Partial<PanelState>;
  /** Handle a message. Return true when handled. */
  handle?: (msg: PanelMessage) => Promise<boolean> | boolean;
}

export class PanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = "bobReadiness.panel";

  private view: vscode.WebviewView | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly extras: PanelExtras[] = [];
  private activeTab: TabId;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly memento: vscode.Memento,
    private readonly store: ContextStore,
    private readonly queue: Queue,
    private readonly session: SessionCoins,
  ) {
    const remembered = memento.get<string>(TAB_KEY, "review");
    this.activeTab = (TAB_IDS as string[]).includes(remembered) ? (remembered as TabId) : "review";
    this.disposables.push(
      store.onDidChange(() => this.refresh()),
      queue.onDidChange(() => this.refresh()),
      session.onDidChange(() => this.refresh()),
    );
  }

  /** Let another feature contribute state and handle messages. */
  addExtras(extra: PanelExtras): void {
    this.extras.push(extra);
  }

  get currentTab(): TabId {
    return this.activeTab;
  }

  async showTab(tab: TabId): Promise<void> {
    this.activeTab = tab;
    await this.memento.update(TAB_KEY, tab);
    this.refresh();
  }

  async reveal(tab?: TabId): Promise<void> {
    if (tab) await this.showTab(tab);
    if (this.view) this.view.show(true);
    else await vscode.commands.executeCommand("bobReadiness.panel.focus");
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
    };
    view.webview.html = panelHtml(view.webview.cspSource, nonce());
    const sub = view.webview.onDidReceiveMessage((msg: PanelMessage) => void this.onMessage(msg));
    view.onDidDispose(() => {
      sub.dispose();
      if (this.view === view) this.view = undefined;
    });
    view.onDidChangeVisibility(() => {
      if (view.visible) this.refresh();
    });
  }

  refresh(): void {
    if (!this.view) return;
    const state = buildPanelState(this.store.getIndex(), this.queue.selected, this.session.spent, this.activeTab);
    for (const extra of this.extras) {
      if (extra.extraState) Object.assign(state, extra.extraState());
    }
    void this.view.webview.postMessage({ type: "state", state });
  }

  private async onMessage(msg: PanelMessage): Promise<void> {
    if (!msg || typeof msg !== "object") return;
    switch (msg.type) {
      case "ready":
        this.refresh();
        return;
      case "setTab":
        if ((TAB_IDS as string[]).includes(msg.tab)) await this.showTab(msg.tab as TabId);
        return;
      case "openFile":
        if (typeof msg.file === "string") await openFileAtLine(this.store, msg.file, Number(msg.line) || 1);
        return;
      case "toggleFinding":
        if (typeof msg.id === "string") {
          if (msg.selected) await this.queue.add(msg.id);
          else await this.queue.remove(msg.id);
          // The webview already moved the checkbox; make sure it reflects the real queue.
          this.refresh();
        }
        return;
      default:
        for (const extra of this.extras) {
          if (extra.handle && (await extra.handle(msg))) return;
        }
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
