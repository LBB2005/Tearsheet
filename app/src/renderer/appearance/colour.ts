// Small colour sums for the Appearance page: hex codes only (#RRGGBB), never names, rgb() or
// anything a theme file could hide CSS in.

const HEX = /^#[0-9A-Fa-f]{6}$/

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value)
}

export function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const two = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0').toUpperCase()

export function hexOf([r, g, b]: [number, number, number]): string {
  return `#${two(r)}${two(g)}${two(b)}`
}

// "255 255 255", the form the CSS takes for colours it uses at many strengths (rgb(var(--ink) / .1)).
export function triple(hex: string): string {
  return rgbOf(hex).join(' ')
}

export function hexOfTriple(t: string): string {
  const [r, g, b] = t.split(' ').map(Number)
  return hexOf([r, g, b])
}

// `a` moved toward `b` by `t` (0 = a, 1 = b).
export function mix(a: string, b: string, t: number): string {
  const x = rgbOf(a)
  const y = rgbOf(b)
  return hexOf([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t])
}

// WCAG's relative luminance and contrast ratio (1 to 21).
export function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (hi + 0.05) / (lo + 0.05)
}
