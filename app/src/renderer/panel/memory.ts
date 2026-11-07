// What each of the panel's views remembers (its sort, filter, switches and span) while one report
// is open. report/useReport.ts makes a new one for each report, so another report starts afresh.
// A view is gone from the page while another shows, so its state is kept here rather than in it.

import type { ViewId } from '../../main/navigation'

export class ViewMemory {
  private kept = new Map<ViewId, unknown>()

  get<S>(view: ViewId, start: S): S {
    return this.kept.has(view) ? (this.kept.get(view) as S) : start
  }

  set<S>(view: ViewId, state: S): void {
    this.kept.set(view, state)
  }
}
