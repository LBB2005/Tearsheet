// Value per share by method: the switches it remembers, which of them have something stored behind
// them, and the line the methods’ dots sit on.

import type { ReportNumbers } from '../../shared/protocol'
import { scaleOf, type Scale } from './scale'

export interface MethodsState {
  // The 12-month range, as a band behind the methods.
  range: boolean
  // Today’s price, as a dashed line.
  price: boolean
  // The estimate, as a solid line.
  estimate: boolean
}

export const METHODS_START: MethodsState = { range: true, price: true, estimate: true }

// What is stored, so a switch with nothing behind it can say so rather than do nothing.
export function canShow(n: ReportNumbers): MethodsState {
  return { range: n.range !== null, price: n.price !== null, estimate: n.estimate !== null }
}

// One line for every method, the price, the estimate and the range’s ends, each only while it is
// both switched on and stored, so a switch that is off or empty doesn’t stretch the line.
export function methodsScale(n: ReportNumbers, s: MethodsState): Scale {
  const values = (n.methods ?? []).map((m) => m.value)
  if (s.price && n.price) values.push(n.price.value)
  if (s.estimate && n.estimate) values.push(n.estimate.value)
  if (s.range && n.range) values.push(n.range.bear, n.range.bull)
  return scaleOf(values, 0.05)
}
