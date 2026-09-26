import * as vscode from "vscode";
import { getSettings } from "./settings";

const KEY = "bobReadiness.highlightsOn";

/** Whether highlights, hovers, CodeLens and Problems entries are shown. Persisted per workspace. */
export class HighlightState implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<boolean>();
  readonly onDidChange = this.emitter.event;
  private on: boolean;

  constructor(private readonly memento: vscode.Memento) {
    const remembered = memento.get<boolean | undefined>(KEY, undefined);
    this.on = remembered ?? getSettings().highlightOnStartup;
  }

  get isOn(): boolean {
    return this.on;
  }

  async set(on: boolean): Promise<void> {
    if (on === this.on) return;
    this.on = on;
    await this.memento.update(KEY, on);
    this.emitter.fire(on);
  }

  toggle(): Promise<void> {
    return this.set(!this.on);
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
