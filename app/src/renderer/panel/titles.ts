// Each view's name, for its heading and the panel's switch. A Full-report table is named by its
// own title, which comes with the report's numbers.

import type { ViewId, ViewKind } from '../../main/navigation'
import type { ReportTable } from '../../shared/protocol'

const TITLES: Record<ViewKind, string> = {
  price: 'Price chart',
  factors: 'Score by factor',
  metrics: 'Key metrics',
  methods: 'Value per share by method',
  returns: 'Total return',
  flags: 'Red flags',
  economy: 'Economy',
  rings: 'Peer ratings and checks',
  analysts: 'Analyst ratings'
}

const TABLE = 'table-'

export function viewTitle(view: ViewId, tables: ReportTable[] | null): string {
  if (view.startsWith(TABLE)) {
    const key = view.slice(TABLE.length)
    const table = tables?.find((t) => t.key === key)
    return table ? `${table.title} table` : 'Table'
  }
  return TITLES[view as ViewKind]
}
