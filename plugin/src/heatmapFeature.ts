import type { ContextStore } from "./contextStore";
import { buildHeatmap, type HeatmapView } from "./heatmap";
import type { PanelExtras } from "./panel/PanelProvider";
import type { ReportStore } from "./report/reportStore";

/** Heatmap tab: files over runs from the exam history, functions by file from the readiness context. */
export class HeatmapFeature implements PanelExtras {
  constructor(
    private readonly store: ContextStore,
    private readonly reports: ReportStore,
  ) {}

  extraState(): { heatmap: HeatmapView } {
    return { heatmap: buildHeatmap(this.reports.getHistory(), this.reports.getReport(), this.store.getIndex()) };
  }
}
