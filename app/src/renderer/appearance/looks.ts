// The ready-made looks, accents, Buy/Hold/Sell sets and fonts on Settings → Appearance (Liam's
// picks of 7 Nov 2026: six looks, each dark and light; ratings only from tested sets; Mac fonts
// only, so nothing is downloaded). Everything a look can be is listed here, so a theme file can
// only ever name one of these or give a hex colour (appearance/themeFile.ts).

export type LookId = 'tearsheet' | 'graphite' | 'evergreen' | 'amber' | 'dusk' | 'contrast'
export type Shade = 'dark' | 'light'

// The colours a look is made of. Every other colour in the window is worked out from these
// (appearance/tokens.ts). All are #RRGGBB.
export interface Core {
  bg: string // the sidebar and the window behind everything
  base: string // the main area under its glow
  ink: string // what thin lines, panels and hovers are made of
  text: string
  muted: string
  accent: string
  accent2: string
  g1: string // the three glows: top left, right, bottom
  g2: string
  g3: string
}

export interface Look {
  id: LookId
  name: string
  note: string
  // Strong lines and bright text; picking it sets Lines to Strong.
  contrast?: boolean
  dark: Core
  light: Core
}

export const LOOKS: Look[] = [
  {
    id: 'tearsheet',
    name: 'Tearsheet',
    note: 'Today’s look',
    dark: { bg: '#0A0D14', base: '#070B14', ink: '#FFFFFF', text: '#EAF1F7', muted: '#92A4B6', accent: '#7FE3F7', accent2: '#8FA2FF', g1: '#207896', g2: '#463CAA', g3: '#145A78' },
    light: { bg: '#E8EDF2', base: '#F5F7FA', ink: '#0E1726', text: '#0E1726', muted: '#55677B', accent: '#087A96', accent2: '#4F5FD1', g1: '#3CAAC8', g2: '#786EDC', g3: '#3C96B4' }
  },
  {
    id: 'graphite',
    name: 'Graphite',
    note: 'Neutral grey',
    dark: { bg: '#0F1012', base: '#0B0C0E', ink: '#FFFFFF', text: '#ECEEF1', muted: '#9A9FA8', accent: '#9DB9FF', accent2: '#C3C8D2', g1: '#6E737D', g2: '#5A5F6E', g3: '#646973' },
    light: { bg: '#EBECEE', base: '#F7F7F8', ink: '#16181C', text: '#16181C', muted: '#5E636B', accent: '#2F62D9', accent2: '#5B6170', g1: '#969BA5', g2: '#8C91A0', g3: '#969BA5' }
  },
  {
    id: 'evergreen',
    name: 'Evergreen',
    note: 'Green-black, mint',
    dark: { bg: '#08110E', base: '#060D0B', ink: '#FFFFFF', text: '#E8F3EE', muted: '#8FA79C', accent: '#8CE8C8', accent2: '#E6D9A8', g1: '#1E825F', g2: '#5A783C', g3: '#146450' },
    light: { bg: '#E6F0EA', base: '#F4F9F6', ink: '#0F1E18', text: '#0F1E18', muted: '#526A5F', accent: '#0E7F58', accent2: '#8A6D1F', g1: '#46AA82', g2: '#8CAA5A', g3: '#3C9678' }
  },
  {
    id: 'amber',
    name: 'Amber',
    note: 'Old trading screen',
    dark: { bg: '#0C0A07', base: '#090806', ink: '#FFFFFF', text: '#F3EBDD', muted: '#A89A84', accent: '#FFB547', accent2: '#E8C79A', g1: '#A0641E', g2: '#824628', g3: '#8C5A1E' },
    light: { bg: '#F3ECE0', base: '#FBF8F2', ink: '#241B0E', text: '#241B0E', muted: '#6B5D48', accent: '#A35F00', accent2: '#7A5A3A', g1: '#DCA050', g2: '#C8825A', g3: '#D29646' }
  },
  {
    id: 'dusk',
    name: 'Dusk',
    note: 'Deep purple',
    dark: { bg: '#0E0A16', base: '#0A0711', ink: '#FFFFFF', text: '#EFE9F7', muted: '#A398B6', accent: '#C9A7FF', accent2: '#FF9ECF', g1: '#6E3CAA', g2: '#A03278', g3: '#503296' },
    light: { bg: '#EEE8F6', base: '#F8F6FB', ink: '#1C1428', text: '#1C1428', muted: '#645878', accent: '#6E44C9', accent2: '#B0377A', g1: '#AA82E6', g2: '#DC78B4', g3: '#9678DC' }
  },
  {
    id: 'contrast',
    name: 'High contrast',
    note: 'Brightest text',
    contrast: true,
    dark: { bg: '#000000', base: '#000000', ink: '#FFFFFF', text: '#FFFFFF', muted: '#C9D3DD', accent: '#8FF0FF', accent2: '#B3BDFF', g1: '#000000', g2: '#000000', g3: '#000000' },
    light: { bg: '#FFFFFF', base: '#FFFFFF', ink: '#000000', text: '#000000', muted: '#33393F', accent: '#0050B0', accent2: '#3D2DB8', g1: '#FFFFFF', g2: '#FFFFFF', g3: '#FFFFFF' }
  }
]

export function lookById(id: string): Look | undefined {
  return LOOKS.find((l) => l.id === id)
}

// The accent swatches: the look's own, then six that read on both grounds.
export type AccentId = 'look' | 'teal' | 'blue' | 'violet' | 'pink' | 'amber' | 'mint'
export const ACCENTS: { id: AccentId; name: string; dark?: string; light?: string }[] = [
  { id: 'look', name: 'The look’s own' },
  { id: 'teal', name: 'Teal', dark: '#7FE3F7', light: '#087A96' },
  { id: 'blue', name: 'Blue', dark: '#8AB4FF', light: '#2F62D9' },
  { id: 'violet', name: 'Violet', dark: '#B9A2FF', light: '#6E44C9' },
  { id: 'pink', name: 'Pink', dark: '#FF9EC7', light: '#B8326E' },
  { id: 'amber', name: 'Amber', dark: '#FFB547', light: '#A35F00' },
  { id: 'mint', name: 'Mint', dark: '#8CE8C8', light: '#0E7F58' }
]

// Buy, Hold and Sell (and up and down) come only from these sets, so no theme can make Buy look
// like Sell (Liam's answer 4A).
export type RatingSet = 'standard' | 'colourblind' | 'strong'
export interface RatingColours {
  up: string
  hold: string
  down: string
}
export const RATINGS: { id: RatingSet; name: string; dark: RatingColours; light: RatingColours }[] = [
  { id: 'standard', name: 'Standard', dark: { up: '#63DFA5', hold: '#FFC56B', down: '#FF7F8A' }, light: { up: '#0B7D4C', hold: '#8F5A00', down: '#CC3344' } },
  { id: 'colourblind', name: 'Colour-blind friendly', dark: { up: '#5AB4FF', hold: '#F0D46A', down: '#FF9F45' }, light: { up: '#1F6FD1', hold: '#7A6200', down: '#B04F00' } },
  { id: 'strong', name: 'High contrast', dark: { up: '#3DFFB0', hold: '#FFD400', down: '#FF5468' }, light: { up: '#006B3C', hold: '#7A4D00', down: '#B0001A' } }
]

// Mac fonts only. The stacks are fixed here; a theme file names one by its id.
export type FontId = 'avenir' | 'sf' | 'ny' | 'rounded' | 'mono'
export const FONTS: { id: FontId; name: string; stack: string }[] = [
  { id: 'avenir', name: 'Avenir Next (today’s)', stack: '"Avenir Next", "Helvetica Neue", sans-serif' },
  { id: 'sf', name: 'SF Pro (the Mac’s own)', stack: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif' },
  { id: 'ny', name: 'New York (serif)', stack: 'ui-serif, "New York", Georgia, serif' },
  { id: 'rounded', name: 'SF Rounded', stack: 'ui-rounded, "SF Pro Rounded", -apple-system, sans-serif' },
  { id: 'mono', name: 'SF Mono', stack: '"SF Mono", ui-monospace, Menlo, monospace' }
]

export function fontStack(id: FontId): string {
  return (FONTS.find((f) => f.id === id) ?? FONTS[0]).stack
}
