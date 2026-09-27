import * as vscode from "vscode";
import type { Finding } from "./contract";
import type { ContextStore } from "./contextStore";
import { canQueue, queueTotals, type QueueTotals } from "./queueLogic";

const KEY = "bobReadiness.queue";

/** The one shared selection of finding ids, used by the panel, hover links and CodeLens. */
export class Queue implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<ReadonlySet<string>>();
  readonly onDidChange = this.emitter.event;
  private ids: Set<string>;

  constructor(private readonly memento: vscode.Memento, private readonly store: ContextStore) {
    this.ids = new Set(memento.get<string[]>(KEY, []));
    // Drop ids that no longer exist or are no longer allowed whenever the context reloads.
    store.onDidChange(() => void this.prune());
  }

  get selected(): ReadonlySet<string> {
    return this.ids;
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  /** Selected findings that exist in the current context, in context order. */
  selectedFindings(): Finding[] {
    const ctx = this.store.getContext();
    if (!ctx) return [];
    return ctx.findings.filter((f) => this.ids.has(f.id) && canQueue(f));
  }

  totals(): QueueTotals {
    return queueTotals(this.selectedFindings());
  }

  /** Add a finding. Returns false (and explains) when it must not be sent to Bob. */
  async add(id: string): Promise<boolean> {
    const finding = this.store.findingById(id);
    if (!finding) {
      void vscode.window.showWarningMessage(`Bob Readiness: finding ${id} is not in the context file.`);
      return false;
    }
    if (!canQueue(finding)) {
      void vscode.window.showInformationMessage(`${id} needs a person. It cannot be sent to Bob.`);
      return false;
    }
    if (this.ids.has(id)) return true;
    this.ids.add(id);
    await this.save();
    return true;
  }

  async remove(id: string): Promise<void> {
    if (!this.ids.delete(id)) return;
    await this.save();
  }

  async toggle(id: string): Promise<void> {
    if (this.ids.has(id)) await this.remove(id);
    else await this.add(id);
  }

  async setMany(ids: string[], selected: boolean): Promise<void> {
    let changed = false;
    for (const id of ids) {
      const finding = this.store.findingById(id);
      if (!finding || !canQueue(finding)) continue;
      if (selected && !this.ids.has(id)) {
        this.ids.add(id);
        changed = true;
      } else if (!selected && this.ids.delete(id)) {
        changed = true;
      }
    }
    if (changed) await this.save();
  }

  async clear(): Promise<void> {
    if (this.ids.size === 0) return;
    this.ids.clear();
    await this.save();
  }

  private async prune(): Promise<void> {
    const ctx = this.store.getContext();
    if (!ctx) return;
    const valid = new Set(ctx.findings.filter(canQueue).map((f) => f.id));
    const before = this.ids.size;
    this.ids = new Set([...this.ids].filter((id) => valid.has(id)));
    if (this.ids.size !== before) await this.save();
    else this.emitter.fire(this.ids);
  }

  private async save(): Promise<void> {
    await this.memento.update(KEY, [...this.ids]);
    this.emitter.fire(this.ids);
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
