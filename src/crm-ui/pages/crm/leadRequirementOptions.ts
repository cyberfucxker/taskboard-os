/**
 * What the sales team asks every prospective client. Kept as plain lists rather than enums in
 * the database: these are labels on a dropdown and the team renames them faster than a
 * migration can follow.
 */

/** What Acme Inc sells — a lead can want several. */
export const SERVICE_OPTIONS = [
  'SEO',
  'Social Media Marketing',
  'Performance Marketing / Paid Ads',
  'Website Development',
  'App Development',
  'Branding & Design',
  'Content & Copywriting',
  'Video Production',
  'E-commerce',
];

/** The one service they are leading with — same list, single choice. */
export const SERVICE_INTEREST_OPTIONS = SERVICE_OPTIONS;

/** Monthly budget, INR. */
export const BUDGET_RANGE_OPTIONS = [
  'Under ₹25k',
  '₹25k–50k',
  '₹50k–1L',
  '₹1L–3L',
  '₹3L+',
];

/** What they are trying to achieve. */
export const REQUIREMENT_OPTIONS = [
  'New website',
  'Website redesign',
  'Lead generation',
  'Brand awareness',
  'Sales growth',
  'Local visibility',
  'Social presence',
  'App build',
  'Other',
];

/** Turns a list into Select options with a blank "not asked yet" entry at the top. */
export function asOptions(values: string[], placeholder: string) {
  return [{ value: '', label: placeholder }, ...values.map((value) => ({ value, label: value }))];
}
