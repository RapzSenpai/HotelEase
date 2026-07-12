/**
 * Phase 1: seed placeholders
 *
 * Overview requirements:
 * - Set up Firestore data models and seed data
 * - Training mode must use separate collections prefixed with `training_`
 *
 * NOTE: This file intentionally does not write to Firestore yet.
 * Implement seeding in later phases (admin tooling) to avoid accidental data changes.
 */

export async function seedBaseData() {
  // TODO: seed initial `rooms` + optional demo `users` (if admin enables it)
  // Collections:
  // - rooms
  // - users
}

export async function seedTrainingData() {
  // TODO: seed sandbox/training data using:
  // - training_bookings
  // - training_guests
  // - (and any other training_ mirrored collections)
}

