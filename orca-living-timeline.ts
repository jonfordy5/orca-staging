/** Strict public annotation contract. Timestamp accepts ISO-8601 or Unix seconds/milliseconds. */
export interface TimelineAnnotation {
  id: string;
  timestamp: string;
  category: 'earnings' | 'product' | 'macro' | 'legal' | 'custom_note';
  title: string;
  aiSummary: string;
  sourceUrl: string;
}
export interface TimelineCandle {
  time: string; // exchange session YYYY-MM-DD
  value: number; // recorded daily closing price
}
