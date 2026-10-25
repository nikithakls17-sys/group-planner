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
]
export const MEMBER_COLORS = PASTELS

export const colorName = (hex: string) => PASTELS.find((c) => c.hex.toLowerCase() === hex?.toLowerCase())?.name ?? 'this color'

/* The book's tabs. Each has its own pastel. */
export const PLAN_TABS = [
  { key: 'what', label: 'What', color: PASTELS[0] },
  { key: 'who', label: 'Who', color: PASTELS[1] },
  { key: 'dates', label: 'Dates', color: PASTELS[2] },
  { key: 'budget', label: 'Budget', color: PASTELS[3] },
  { key: 'plans', label: 'Plans', color: PASTELS[4] },
  { key: 'tasks', label: 'Tasks', color: PASTELS[5] },
  { key: 'go', label: 'Go', color: PASTELS[6] },
  { key: 'money', label: 'Money', color: PASTELS[7] },
] as const
export type PlanTab = (typeof PLAN_TABS)[number]['key']

export const APP_TABS = [
  { key: '/', label: 'Home', color: PASTELS[0] },
  { key: '/plans', label: 'Plans', color: PASTELS[4] },
  { key: '/groups', label: 'Groups', color: PASTELS[1] },
  { key: '/settings', label: 'Settings', color: PASTELS[3] },
  { key: '/about', label: 'About', color: PASTELS[2] },
]
