// In-house cleaner roster for housekeeping assignment suggestions.
// Cleaners have no HotelEase accounts — assignment stores a name, not a uid.
// Free text is always allowed; these names only appear as suggestions.
// To seed the crew, add names here, e.g. ["Maria Santos", "Jose Reyes"].
export const CLEANER_ROSTER = [];

export function cleanerSuggestions(query = "") {
  const q = query.trim().toLowerCase();
  if (!q) return CLEANER_ROSTER;
  return CLEANER_ROSTER.filter((name) => name.toLowerCase().includes(q));
}
