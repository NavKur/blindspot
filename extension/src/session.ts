import * as vscode from "vscode";

/** Running total of Bobcoins spent in this IDE session. */
export class SessionCoins implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<number>();
  readonly onDidChange = this.emitter.event;
  private total = 0;

  get spent(): number {
    return this.total;
  }

  add(coins: number): void {
    if (!Number.isFinite(coins) || coins <= 0) return;
    this.total = Math.round((this.total + coins) * 1000) / 1000;
    this.emitter.fire(this.total);
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
