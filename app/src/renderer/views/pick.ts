// How a view reads the item a report link names (the `item` of an `open` link). A link may name
// something that isn't there, and then the view opens with nothing picked rather than failing.

// A position in a list of `count`, written as plain digits. Anything else names nothing.
export function pickIndex(item: string | null, count: number): number | null {
  if (item === null || !/^(0|[1-9]\d*)$/.test(item)) return null
  const n = Number(item)
  return n < count ? n : null
}

// The position of the entry whose key is the item, for views whose items are named rather than
// numbered.
export function pickKey<T>(item: string | null, list: T[], key: (t: T) => string): number | null {
  if (item === null) return null
  const at = list.findIndex((t) => key(t) === item)
  return at < 0 ? null : at
}
