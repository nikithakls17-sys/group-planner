// The app name is not final: change it here and APP_NAME in backend/app/config.py
export const APP_NAME = 'Nobody Plans'

/* Pastel tab colors, which double as member colors. Pastels alone aren't color-blind safe, so members are ALWAYS
   shown with initials, and neighbouring colors differ in lightness as well as hue. `deep` is the AA-readable
   version used for headings on paper. */
export const PASTELS = [
  { hex: '#FFD54F', deep: '#7a5a00', name: 'sunshine' },
  { hex: '#FFB366', deep: '#8a4508', name: 'peach' },
  { hex: '#A3B454', deep: '#4c5a12', name: 'sunlit green' },
  { hex: '#FFE8A1', deep: '#7a6214', name: 'butter' },
  { hex: '#C9B6E4', deep: '#5b4290', name: 'lilac' },
  { hex: '#9FCDE8', deep: '#245f80', name: 'sky' },
  { hex: '#F29C8B', deep: '#9a3523', name: 'coral' },
  { hex: '#BFD3A0', deep: '#4c6626', name: 'sage' },
  { hex: '#EBA6B8', deep: '#8f3550', name: 'rose' },
  { hex: '#E3CFA6', deep: '#6f5626', name: 'sand' },
  { hex: '#A9B8EC', deep: '#3a4c99', name: 'periwinkle' },
  { hex: '#D9A58A', deep: '#7d4429', name: 'clay' },
  { hex: '#A8DCC4', deep: '#2f6b52', name: 'mint' },
  { hex: '#C9C3BA', deep: '#57514a', name: 'stone' },
  { hex: '#FFCBA4', deep: '#8a4a1f', name: 'apricot' },
  { hex: '#F7A8A8', deep: '#9a2f2f', name: 'blush' },
  { hex: '#D8E28A', deep: '#56621a', name: 'lime' },
  { hex: '#B5E3E0', deep: '#2b6b67', name: 'aqua' },
  { hex: '#E2C2F0', deep: '#6d3e85', name: 'orchid' },
  { hex: '#F5E1C8', deep: '#6e5534', name: 'oat' },
  { hex: '#C4D7F2', deep: '#34557f', name: 'cornflower' },
  { hex: '#F2C6DE', deep: '#8a3a64', name: 'candy' },
  { hex: '#CFE8B4', deep: '#466b25', name: 'pistachio' },
  { hex: '#FFDFA0', deep: '#7d5a10', name: 'honey' },
]
export const MEMBER_COLORS = PASTELS

export const colorName = (hex: string) => PASTELS.find((c) => c.hex.toLowerCase() === hex?.toLowerCase())?.name ?? 'this color'

/* The book's tabs. Each has its own pastel. */
export const PLAN_TABS = [
  { key: 'what', label: 'What', color: PASTELS[0] },
  { key: 'who', label: 'Who', color: PASTELS[1] },
  { key: 'dates', label: 'Dates', color: PASTELS[2] },
  { key: 'budget', label: 'Budget', color: PASTELS[3] },
  { key: 'activity', label: 'Activity', color: PASTELS[4] },
  { key: 'where', label: 'Where', color: PASTELS[5] },
  { key: 'places', label: 'Places', color: PASTELS[6] },
  { key: 'tasks', label: 'Tasks', color: PASTELS[7] },
  // only once the plan is fixed
  { key: 'wear', label: 'Wear', color: PASTELS[8] },
  { key: 'rides', label: 'Rides', color: PASTELS[9] },
  { key: 'map', label: 'Map', color: PASTELS[10] },
  { key: 'money', label: 'Money', color: PASTELS[11] },
] as const
export type PlanTab = (typeof PLAN_TABS)[number]['key']

export const APP_TABS = [
  { key: '/', label: 'Home', color: { hex: '#EDB10C', deep: '#6b4d00', name: 'marigold' } }, // darker than the sunshine desk
  { key: '/plans', label: 'Plans', color: PASTELS[4] },
  { key: '/groups', label: 'Groups', color: PASTELS[1] },
  { key: '/settings', label: 'Settings', color: PASTELS[3] },
  { key: '/about', label: 'About', color: PASTELS[2] },
]
