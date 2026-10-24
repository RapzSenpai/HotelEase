// Top card of the photo stack rotates to the back — the gallery loops forever.
export function nextOrder(order) {
  return [...order.slice(1), order[0]];
}
