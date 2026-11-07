// A Full-report table, opened bigger: which column it is sorted by and what it is filtered to.
// The tables arrive as text, so a cell is read as a number only when it plainly is one.

const MULTIPLIER: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 }

// Money, percentages, multiples and bracketed negatives: "$1.2 billion", "(3.4)%", "14.2×".
// Spaces and thousands commas are ignored. Anything else, such as a word or a date, is no number.
const NUMBER = /^(-|−)?(\()?(-|−)?\$?(\d+(?:\.\d+)?|\.\d+)(\))?(%|×|thousand|million|billion|trillion)?$/i

export function cellNumber(text: string): number | null {
  const m = NUMBER.exec(text.replace(/[\s,]/g, ''))
  // A bracket must open and close together.
  if (!m || Boolean(m[2]) !== Boolean(m[5])) return null
  const magnitude = Number(m[4]) * (MULTIPLIER[(m[6] ?? '').toLowerCase()] ?? 1)
  return m[1] || m[2] || m[3] ? -magnitude : magnitude
}

// A column sorts as numbers only when every cell below the header reads as one, so a single
// "not meaningful" among dollar values makes the whole column sort as text. A blank cell says
// nothing either way, so it is ignored, but there must be at least one cell that isn't blank.
const blank = (c: string | undefined) => (c ?? '').trim() === ''

export function numericColumn(rows: string[][], col: number): boolean {
  const filled = rows.slice(1).filter((r) => !blank(r[col]))
  return filled.length > 0 && filled.every((r) => cellNumber(r[col]) !== null)
}

export type Sort = { col: number; dir: 'asc' | 'desc' } | null

export interface TableState {
  sort: Sort
  filter: string
}

export const TABLE_START: TableState = { sort: null, filter: '' }

export interface Row {
  // The data row's place in the table, from 0, which a link's item names and sorting never moves.
  at: number
  cells: string[]
}

export function tableRows(rows: string[][], s: TableState): Row[] {
  const needle = s.filter.trim().toLowerCase()
  let out: Row[] = rows
    .slice(1)
    .map((cells, at) => ({ at, cells }))
    .filter((r) => needle === '' || r.cells.some((c) => c.toLowerCase().includes(needle)))
  if (s.sort) {
    const { col, dir } = s.sort
    const sign = dir === 'asc' ? 1 : -1
    const numbers = numericColumn(rows, col)
    const cmp = numbers
      ? (a: Row, b: Row) => (cellNumber(a.cells[col] ?? '') as number) - (cellNumber(b.cells[col] ?? '') as number)
      : (a: Row, b: Row) => (a.cells[col] ?? '').localeCompare(b.cells[col] ?? '', undefined, { numeric: true, sensitivity: 'base' })
    // Array.sort is stable, so equal cells keep their order in either direction. In a numeric
    // column the blank cells go last whichever way it runs, outside the direction's sign.
    out = [...out].sort((a, b) => {
      if (numbers) {
        const ba = blank(a.cells[col])
        const bb = blank(b.cells[col])
        if (ba || bb) return ba === bb ? 0 : ba ? 1 : -1
      }
      return sign * cmp(a, b)
    })
  }
  return out
}

// Off, then ascending, then descending, then ascending again; another column starts ascending.
export function nextSort(s: Sort, col: number): Sort {
  if (!s || s.col !== col) return { col, dir: 'asc' }
  return { col, dir: s.dir === 'asc' ? 'desc' : 'asc' }
}
