/**
 * One room-label rule for every screen that names a room.
 *
 * The label is built from the room document only — name, then type, then
 * "Room <number>". It deliberately never falls back to the Firestore room id:
 * pages that rendered a booking list before their rooms query resolved used to
 * print that id and then swap it for the real name (the room-id flash on the
 * bookings, cancellations and check-out screens). Callers pass the placeholder
 * to show meanwhile — "…" while the list is still loading, "—" once it is known
 * the room really is gone.
 */
export function roomLabel(room, unknown = "…") {
  if (!room) return unknown;
  return room.name || room.type || (room.roomNumber ? `Room ${room.roomNumber}` : unknown);
}

/** The same label for one booking's room, resolved through an id → room map. */
export function roomLabelFrom(roomsById, roomId, unknown = "—") {
  return roomLabel(roomsById?.[roomId], unknown);
}
