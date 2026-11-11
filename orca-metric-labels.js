/*
 * ORCA R2 — presentation-only names for the existing research metrics.
 * Do NOT use these names as task keys, board keys, database values, R4 tags,
 * publication arguments, or the source of truth for an assignment's realm.
 * The server-assigned board remains authoritative.
 */
const METRIC_ALIASES = Object.freeze({
  'sec filings & catalysts': 'Royal Decrees',
  'news & market sentiment': 'War Drums',
  'fundamentals & valuation': 'The Ledger',
  'technical analysis': 'Battle Map',
  'volume & market positioning': 'Troop Movements',
  'volume': 'Troop Movements',
  'relative trading volume': 'Troop Movements',
  'options': 'Signal Fires',
  'options activity': 'Signal Fires'
});

export function metricDisplayParts(area) {
  const original = typeof area === 'string' ? area.trim() : '';
  if (!original) return {title: 'Research metric', subtitle: '', themed: false};
  const alias = METRIC_ALIASES[original.toLowerCase()] || '';
  return {title: alias || original, subtitle: alias ? original : '', themed: Boolean(alias)};
}

export function metricDisplayText(area) {
  const {title,subtitle} = metricDisplayParts(area);
  return subtitle ? title + ' — ' + subtitle : title;
}
