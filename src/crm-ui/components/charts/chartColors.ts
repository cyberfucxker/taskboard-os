/**
 * Shared categorical palette for Recharts, derived from the Acme brand + semantic tones.
 * SVG presentation attributes cannot read CSS variables reliably, so these are literal
 * colours chosen to read on both TaskBoard's dark and light surfaces.
 */
export const CHART_COLORS = {
  brand: '#3E8B93',
  accent: '#D29922',
  navy: '#5B9DFF',
  success: '#2EA043',
  info: '#79B8FF',
  warning: '#E3B341',
  danger: '#F85149',
  violet: '#A371F7',
  slate: '#7F8C9F',
};

export const CHART_SERIES = [
  CHART_COLORS.brand,
  CHART_COLORS.accent,
  CHART_COLORS.navy,
  CHART_COLORS.success,
  CHART_COLORS.violet,
  CHART_COLORS.warning,
];

export const GRID_STROKE = 'rgba(127,140,159,0.22)';
export const AXIS_TICK = { fill: '#7F8C9F', fontSize: 11 };

/** Tooltip box — CSS (not SVG), so it can follow the theme variables. */
export const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: '1px solid var(--edge)',
  background: 'var(--raised)',
  color: 'var(--ink)',
  fontSize: 12,
};
