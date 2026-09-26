import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import type { BobRunner } from "./bobRunner";
import type { StarterTask } from "./contract";
import type { ContextStore } from "./contextStore";
import { Git } from "./git";
import { costLabel, lookupAnswer, setupLines, SUGGESTED_QUESTIONS, withAnswer, type AnswerCache } from "./onboardingLogic";
import type { Log } from "./output";
import type { PanelExtras, PanelMessage } from "./panel/PanelProvider";
import { buildOnboardingPrompt } from "./prompt";

const CACHE_KEY = "bobReadiness.onboardingAnswers";

export interface ChatMessage {
  question: string;
  answer: string;
  costLabel: string;
  pending: boolean;
}

export interface OnboardingView {
  setup: string[];
  starterTasks: StarterTask[];
  messages: ChatMessage[];
  suggested: string[];
  busy: boolean;
}

/** Onboarding tab: setup, starter tasks and a chat answered by Bob, read-only, cached per question. */
export class OnboardingFeature implements PanelExtras {
  private readonly messages: ChatMessage[] = [];
  private busy = false;
  private cancel: vscode.CancellationTokenSource | undefined;

  constructor(
    private readonly memento: vscode.Memento,
    private readonly store: ContextStore,
    private readonly runner: BobRunner,
    private readonly log: Log,
    private readonly onChange: () => void,
  ) {}

  extraState(): { onboarding?: OnboardingView } {
    const ctx = this.store.getContext();
    if (!ctx) return { onboarding: undefined };
    return {
      onboarding: {
        setup: setupLines(ctx),
        starterTasks: ctx.starter_tasks,
        messages: this.messages,
        suggested: SUGGESTED_QUESTIONS,
        busy: this.busy,
      },
    };
  }

  async handle(msg: PanelMessage): Promise<boolean> {
    if (msg.type !== "ask") return false;
    if (typeof msg.question === "string" && msg.question.trim()) await this.ask(msg.question.trim());
    return true;
  }

  async ask(question: string): Promise<void> {
    const ctx = this.store.getContext();
    const root = this.store.workspaceRoot;
    if (!ctx || !root) {
      void vscode.window.showWarningMessage("Bob Readiness: no context file, so Bob has nothing to answer from.");
      return;
    }
    if (this.busy) {
      void vscode.window.showInformationMessage("Bob is still answering the previous question.");
      return;
    }

    const cached = lookupAnswer(this.cache(), question);
    if (cached) {
      this.messages.push({ question, answer: cached.answer, costLabel: costLabel(cached.cost, true), pending: false });
      this.onChange();
      return;
    }

    const message: ChatMessage = { question, answer: "", costLabel: "", pending: true };
    this.messages.push(message);
    this.busy = true;
    this.cancel = new vscode.CancellationTokenSource();
    this.onChange();

    try {
      let notes: string | undefined;
      try {
        notes = await fs.readFile(path.join(root, ...ctx.notes_markdown_path.split("/")), "utf8");
      } catch {
        notes = undefined;
      }
      const prompt = buildOnboardingPrompt(question, ctx, notes);
      this.log.line(`Onboarding question: ${question}`);
      const git = new Git(root);
      const cleanBefore = (await git.isRepo()) ? await git.isClean() : undefined;

      const result = await this.runner.runBob(prompt, root, this.cancel.token);

      if (cleanBefore === true && !(await git.isClean())) {
        this.log.line("Warning: the working tree changed during a read-only onboarding question. Check git status.");
        void vscode.window.showWarningMessage("Bob changed files while answering a question. Check git status; onboarding answers should be read-only.");
      }

      if (!result.ok) {
        message.answer = result.cancelled ? "Cancelled." : `Bob could not answer: ${result.summary}`;
        message.costLabel = result.cost > 0 ? costLabel(result.cost, false) : "No answer, nothing cached";
      } else {
        message.answer = result.summary;
        message.costLabel = costLabel(result.cost, false);
        await this.memento.update(CACHE_KEY, withAnswer(this.cache(), question, result.summary, result.cost));
      }
    } catch (err) {
      message.answer = `Something went wrong: ${err instanceof Error ? err.message : String(err)}`;
      message.costLabel = "No answer";
    } finally {
      message.pending = false;
      this.busy = false;
      this.cancel?.dispose();
      this.cancel = undefined;
      this.onChange();
    }
  }

  private cache(): AnswerCache {
    return this.memento.get<AnswerCache>(CACHE_KEY, {});
  }
}
