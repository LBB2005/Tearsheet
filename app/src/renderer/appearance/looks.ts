// The ready-made looks, accents, Buy/Hold/Sell sets and fonts on Settings → Appearance (Liam's
// picks of 7 Nov 2026: six looks, each dark and light; ratings only from tested sets; Mac fonts
// only, so nothing is downloaded; then on 8 Nov, twenty more looks on a More looks page, each with
// its own font, corners and glow). Everything a look can be is listed here, so a theme file can
// only ever name one of these or give a hex colour (appearance/themeFile.ts).

export type LookId =
  | 'tearsheet' | 'graphite' | 'evergreen' | 'amber' | 'dusk' | 'contrast'
  // More looks (Liam: "just add all", 8 Nov 2026), on a page of their own.
  | 'midnight' | 'terminal' | 'ledger' | 'glacier' | 'rosewood' | 'cobalt' | 'moss' | 'ultraviolet' | 'lavender' | 'coral'
  | 'copper' | 'signal' | 'aurora' | 'sunset' | 'espresso' | 'carbon' | 'neon' | 'newsprint' | 'mono' | 'desert'
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

// The font, corners and glow a look comes with. Picking a look brings them, apart from any of the
// three the person changed from the last look's (store.ts pickLook).
export interface LookStyle {
  font: FontId
  corners: number
  glow: number
}

// The six first looks come with today's: Avenir Next, 14 px corners, Liam's 40% glow.
export const PLAIN_STYLE: LookStyle = { font: 'avenir', corners: 14, glow: 40 }

export interface Look {
  id: LookId
  name: string
  note: string
  // Strong lines and bright text; picking it sets Lines to Strong.
  contrast?: boolean
  // One of the twenty on More looks, rather than the six on the Appearance page.
  more?: boolean
  style?: LookStyle
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
  },
  // ---------- More looks: twenty, each with its own font, corners and glow (8 Nov 2026) ----------
  {
    id: 'midnight',
    name: 'Midnight',
    note: 'Navy and gold',
    more: true,
    style: { font: 'sf', corners: 12, glow: 45 },
    dark: { bg: '#0B1020', base: '#080C1A', ink: '#FFFFFF', text: '#EEF1F8', muted: '#9AA6BF', accent: '#E8C36A', accent2: '#8FB0FF', g1: '#1E3A8A', g2: '#3B2F7A', g3: '#1A3D6E' },
    light: { bg: '#E6EAF3', base: '#F6F7FB', ink: '#0D1530', text: '#0D1530', muted: '#495572', accent: '#8A6400', accent2: '#2F55C8', g1: '#8FA8E8', g2: '#B0A0E0', g3: '#8CB4E0' }
  },
  {
    id: 'terminal',
    name: 'Terminal',
    note: 'Phosphor green, all mono',
    more: true,
    style: { font: 'mono', corners: 2, glow: 15 },
    dark: { bg: '#050806', base: '#030504', ink: '#FFFFFF', text: '#D8F5DF', muted: '#7FA88A', accent: '#5CF08F', accent2: '#E8F06A', g1: '#0F5A2A', g2: '#2A4A10', g3: '#0A4A30' },
    light: { bg: '#E3ECE4', base: '#F3F7F3', ink: '#0B1F12', text: '#0B1F12', muted: '#435B4B', accent: '#0B7A3A', accent2: '#6B6A00', g1: '#7CC896', g2: '#B4C878', g3: '#78BFA0' }
  },
  {
    id: 'ledger',
    name: 'Ledger',
    note: 'Paper and ink, a serif',
    more: true,
    style: { font: 'ny', corners: 6, glow: 0 },
    dark: { bg: '#15130F', base: '#11100D', ink: '#FFFFFF', text: '#F1EBDF', muted: '#ACA392', accent: '#9DB8F0', accent2: '#D9B98A', g1: '#3A3020', g2: '#2A2A3A', g3: '#302818' },
    light: { bg: '#EDE6D8', base: '#FBF8F1', ink: '#1E1A14', text: '#1E1A14', muted: '#5A5443', accent: '#1F4FA8', accent2: '#8A5A1F', g1: '#E0D0B0', g2: '#D0D0E0', g3: '#E0D4B8' }
  },
  {
    id: 'glacier',
    name: 'Glacier',
    note: 'Ice blue, soft corners',
    more: true,
    style: { font: 'rounded', corners: 18, glow: 55 },
    dark: { bg: '#0C141C', base: '#091017', ink: '#FFFFFF', text: '#E8F3FA', muted: '#93A9BA', accent: '#9FD4FF', accent2: '#C2B8FF', g1: '#2A6A9A', g2: '#4A5AA8', g3: '#2A7A8A' },
    light: { bg: '#E2EEF6', base: '#F4F9FC', ink: '#0C2233', text: '#0C2233', muted: '#445B6D', accent: '#1468A8', accent2: '#5A4FC0', g1: '#8CC4EA', g2: '#A8B0EC', g3: '#8CD0DA' }
  },
  {
    id: 'rosewood',
    name: 'Rosewood',
    note: 'Wine and rose',
    more: true,
    style: { font: 'avenir', corners: 14, glow: 45 },
    dark: { bg: '#150B0E', base: '#10080B', ink: '#FFFFFF', text: '#F6E9EC', muted: '#B3989F', accent: '#F4A3B8', accent2: '#E8C08A', g1: '#7A2238', g2: '#5A2A4A', g3: '#6A2A2A' },
    light: { bg: '#F3E6E9', base: '#FCF7F8', ink: '#2A1218', text: '#2A1218', muted: '#6B4F55', accent: '#B0305A', accent2: '#8A5A10', g1: '#E8A0B4', g2: '#D0A8C8', g3: '#E8B0A8' }
  },
  {
    id: 'cobalt',
    name: 'Cobalt',
    note: 'Electric blue',
    more: true,
    style: { font: 'sf', corners: 10, glow: 60 },
    dark: { bg: '#070C1A', base: '#050914', ink: '#FFFFFF', text: '#E8EFFF', muted: '#929FC3', accent: '#6FA6FF', accent2: '#8CF0FF', g1: '#1A3AA8', g2: '#2A2A9A', g3: '#0A4A9A' },
    light: { bg: '#E4EAF8', base: '#F5F8FE', ink: '#0A1638', text: '#0A1638', muted: '#46547A', accent: '#1F5FE0', accent2: '#00809A', g1: '#8CA8F0', g2: '#A0A0F0', g3: '#80B8F0' }
  },
  {
    id: 'moss',
    name: 'Moss',
    note: 'Olive and chartreuse',
    more: true,
    style: { font: 'avenir', corners: 12, glow: 40 },
    dark: { bg: '#0D100A', base: '#0A0C07', ink: '#FFFFFF', text: '#EEF2E2', muted: '#A0A88C', accent: '#C4DC72', accent2: '#E8C88A', g1: '#4A6A1A', g2: '#6A5A20', g3: '#3A5A2A' },
    light: { bg: '#E9ECDD', base: '#F8F9F2', ink: '#1C2210', text: '#1C2210', muted: '#525940', accent: '#5A7A00', accent2: '#8A5E10', g1: '#B4CC78', g2: '#D4C088', g3: '#A8C890' }
  },
  {
    id: 'ultraviolet',
    name: 'Ultraviolet',
    note: 'Indigo and violet',
    more: true,
    style: { font: 'sf', corners: 14, glow: 65 },
    dark: { bg: '#0C0A1C', base: '#080714', ink: '#FFFFFF', text: '#EEEBFF', muted: '#A39CC8', accent: '#A795FF', accent2: '#66E3F5', g1: '#4A2AC8', g2: '#2A3AB0', g3: '#6A20A0' },
    light: { bg: '#E9E6F8', base: '#F8F7FE', ink: '#1A1440', text: '#1A1440', muted: '#56507E', accent: '#5B3FD9', accent2: '#00809A', g1: '#B0A0F4', g2: '#A0B0F0', g3: '#C8A0E8' }
  },
  {
    id: 'lavender',
    name: 'Lavender',
    note: 'Soft lilac, round',
    more: true,
    style: { font: 'rounded', corners: 22, glow: 50 },
    dark: { bg: '#14121B', base: '#100E16', ink: '#FFFFFF', text: '#F1EDF8', muted: '#ABA3BD', accent: '#C8B2FF', accent2: '#A8E0D0', g1: '#5A4A8A', g2: '#6A4A7A', g3: '#4A5A8A' },
    light: { bg: '#EEE9F7', base: '#FAF8FD', ink: '#251E36', text: '#251E36', muted: '#5C546F', accent: '#6A4CC0', accent2: '#2A7A6A', g1: '#CDBEF0', g2: '#E0C0E8', g3: '#BCCCF0' }
  },
  {
    id: 'coral',
    name: 'Coral',
    note: 'Deep sea and coral',
    more: true,
    style: { font: 'avenir', corners: 14, glow: 45 },
    dark: { bg: '#08131A', base: '#060F15', ink: '#FFFFFF', text: '#E9F3F5', muted: '#93AAB2', accent: '#FF9A78', accent2: '#6ED8E2', g1: '#0E5A6A', g2: '#6A3A4A', g3: '#0A4A5A' },
    light: { bg: '#E3EEF0', base: '#F5FAFA', ink: '#0C2730', text: '#0C2730', muted: '#415B65', accent: '#C2482A', accent2: '#0A7A88', g1: '#8CCCD8', g2: '#F0B8A8', g3: '#8CC8D4' }
  },
  {
    id: 'copper',
    name: 'Copper',
    note: 'Dark wood and copper',
    more: true,
    style: { font: 'ny', corners: 8, glow: 40 },
    dark: { bg: '#120D0A', base: '#0E0A08', ink: '#FFFFFF', text: '#F4EAE2', muted: '#AF9D8F', accent: '#E89E68', accent2: '#A8C8C0', g1: '#7A4020', g2: '#5A3A30', g3: '#6A3A1A' },
    light: { bg: '#F0E6DE', base: '#FBF7F3', ink: '#2A1A10', text: '#2A1A10', muted: '#655242', accent: '#A4521A', accent2: '#2A6A62', g1: '#E8B898', g2: '#D8B8A8', g3: '#E0B088' }
  },
  {
    id: 'signal',
    name: 'Signal',
    note: 'Black and yellow, square',
    more: true,
    style: { font: 'sf', corners: 4, glow: 0 },
    dark: { bg: '#0A0A0A', base: '#070707', ink: '#FFFFFF', text: '#F5F5F0', muted: '#A8A8A0', accent: '#F5D84A', accent2: '#9AB8FF', g1: '#3A3A10', g2: '#2A2A2A', g3: '#3A3010' },
    light: { bg: '#ECECE6', base: '#FAFAF6', ink: '#141410', text: '#141410', muted: '#55554C', accent: '#7A6400', accent2: '#2A4FB0', g1: '#E8E0A0', g2: '#D8D8D0', g3: '#E8DCA0' }
  },
  {
    id: 'aurora',
    name: 'Aurora',
    note: 'Green and violet glow',
    more: true,
    style: { font: 'avenir', corners: 16, glow: 85 },
    dark: { bg: '#070D12', base: '#050A0E', ink: '#FFFFFF', text: '#E6F4F2', muted: '#8FA8AA', accent: '#7EF0C9', accent2: '#B49CFF', g1: '#10A07A', g2: '#6A40C8', g3: '#1A70A0' },
    light: { bg: '#E2F0EE', base: '#F4FAF9', ink: '#0C2424', text: '#0C2424', muted: '#445D5D', accent: '#0A7F5E', accent2: '#5A40C0', g1: '#7CDCC0', g2: '#B8A4F0', g3: '#8CC4E4' }
  },
  {
    id: 'sunset',
    name: 'Sunset',
    note: 'Plum with an orange glow',
    more: true,
    style: { font: 'avenir', corners: 16, glow: 75 },
    dark: { bg: '#120A14', base: '#0E070F', ink: '#FFFFFF', text: '#F7EAEE', muted: '#B39AA8', accent: '#FFA870', accent2: '#FF8FB8', g1: '#B0502A', g2: '#A02A6A', g3: '#6A2A8A' },
    light: { bg: '#F6E8EA', base: '#FDF7F7', ink: '#2A1420', text: '#2A1420', muted: '#6B505D', accent: '#B4521A', accent2: '#B0306A', g1: '#F8C0A0', g2: '#F0A8C8', g3: '#D0B0E8' }
  },
  {
    id: 'espresso',
    name: 'Espresso',
    note: 'Coffee and crema',
    more: true,
    style: { font: 'ny', corners: 12, glow: 30 },
    dark: { bg: '#120E0B', base: '#0E0B08', ink: '#FFFFFF', text: '#F2EAE1', muted: '#AC9F92', accent: '#DDB88E', accent2: '#9CC9B4', g1: '#5A3A22', g2: '#4A3A2A', g3: '#5A402A' },
    light: { bg: '#EEE6DC', base: '#FAF6F1', ink: '#241A12', text: '#241A12', muted: '#5E5242', accent: '#8A5A2A', accent2: '#2A6A50', g1: '#E0C8B0', g2: '#D8CCB8', g3: '#E0C8A8' }
  },
  {
    id: 'carbon',
    name: 'Carbon',
    note: 'Charcoal and safety orange',
    more: true,
    style: { font: 'sf', corners: 6, glow: 0 },
    dark: { bg: '#111214', base: '#0D0E10', ink: '#FFFFFF', text: '#ECEDEF', muted: '#A1A5AB', accent: '#FF8A3D', accent2: '#8FC2FF', g1: '#3A3A3E', g2: '#2E2E34', g3: '#3A3632' },
    light: { bg: '#E8E9EB', base: '#F7F7F8', ink: '#15171A', text: '#15171A', muted: '#51555B', accent: '#C2500A', accent2: '#1F5FB0', g1: '#C8C8CC', g2: '#C0C0C8', g3: '#CCC4BC' }
  },
  {
    id: 'neon',
    name: 'Neon',
    note: 'Magenta and cyan',
    more: true,
    style: { font: 'sf', corners: 10, glow: 80 },
    dark: { bg: '#0B0612', base: '#08040E', ink: '#FFFFFF', text: '#F6ECFF', muted: '#A894BC', accent: '#FF6AD5', accent2: '#5FF3FF', g1: '#A0208A', g2: '#2050C0', g3: '#7020B0' },
    light: { bg: '#F3E8F6', base: '#FCF7FD', ink: '#2A0F33', text: '#2A0F33', muted: '#674F71', accent: '#B8209A', accent2: '#007C8A', g1: '#F0A8E0', g2: '#A8C0F8', g3: '#D0A8F0' }
  },
  {
    id: 'newsprint',
    name: 'Newsprint',
    note: 'Grey paper, a serif',
    more: true,
    style: { font: 'ny', corners: 2, glow: 0 },
    dark: { bg: '#131313', base: '#101010', ink: '#FFFFFF', text: '#EDEDEA', muted: '#A6A6A1', accent: '#A7BEDD', accent2: '#D8C7A0', g1: '#2A2A2A', g2: '#262626', g3: '#2A2A2A' },
    light: { bg: '#E6E5E0', base: '#F5F4EF', ink: '#161616', text: '#161616', muted: '#54544D', accent: '#2A4F80', accent2: '#7A5A20', g1: '#D8D8D0', g2: '#D0D0C8', g3: '#D8D8D0' }
  },
  {
    id: 'mono',
    name: 'Mono',
    note: 'No colour at all',
    more: true,
    style: { font: 'sf', corners: 10, glow: 0 },
    dark: { bg: '#0F0F0F', base: '#0B0B0B', ink: '#FFFFFF', text: '#F2F2F2', muted: '#A3A3A3', accent: '#FFFFFF', accent2: '#B8B8B8', g1: '#303030', g2: '#2A2A2A', g3: '#303030' },
    light: { bg: '#EAEAEA', base: '#FAFAFA', ink: '#111111', text: '#111111', muted: '#575757', accent: '#111111', accent2: '#6A6A6A', g1: '#D0D0D0', g2: '#C8C8C8', g3: '#D0D0D0' }
  },
  {
    id: 'desert',
    name: 'Desert',
    note: 'Warm dusk and cactus green',
    more: true,
    style: { font: 'avenir', corners: 14, glow: 50 },
    dark: { bg: '#140F0E', base: '#100B0B', ink: '#FFFFFF', text: '#F5EBE3', muted: '#B09E92', accent: '#9CD08A', accent2: '#EBC08F', g1: '#8A4A30', g2: '#6A3A5A', g3: '#5A6A3A' },
    light: { bg: '#F2E7DC', base: '#FCF7F2', ink: '#2A1C14', text: '#2A1C14', muted: '#635244', accent: '#3F7A2A', accent2: '#9A5A1A', g1: '#F0C0A0', g2: '#E0B0C8', g3: '#C8D8A0' }
  }
]

export function lookById(id: string): Look | undefined {
  return LOOKS.find((l) => l.id === id)
}

export function styleOf(look: Look | undefined): LookStyle {
  return look?.style ?? PLAIN_STYLE
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
