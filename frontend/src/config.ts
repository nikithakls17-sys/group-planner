// The app name is not final: change it here and APP_NAME in backend/app/config.py
export const APP_NAME = 'Nobody Plans'

// Okabe-Ito: color-blind-safe member colors. Always shown with initials, never color alone.
export const MEMBER_COLORS = [
  { hex: '#0072B2', name: 'blue' },
  { hex: '#E69F00', name: 'orange' },
  { hex: '#009E73', name: 'green' },
  { hex: '#CC79A7', name: 'pink' },
  { hex: '#56B4E9', name: 'sky blue' },
  { hex: '#D55E00', name: 'red' },
  { hex: '#F0E442', name: 'yellow' },
  { hex: '#000000', name: 'black' },
]

export const colorName = (hex: string) =>
  MEMBER_COLORS.find((c) => c.hex.toLowerCase() === hex?.toLowerCase())?.name ?? 'this color'
