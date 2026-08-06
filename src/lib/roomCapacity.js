export const ROOM_TYPE_CAPACITY_DEFAULTS = {
  "Single Room": { basePax: 1, maxPax: 2, extraPaxFee: 300 },
  "Suite Room": { basePax: 2, maxPax: 4, extraPaxFee: 500 },
  "Presidential Room": { basePax: 4, maxPax: 8, extraPaxFee: 1000 },
};

export function getRoomCapacity(room) {
  const defaults =
    ROOM_TYPE_CAPACITY_DEFAULTS[room?.type] || {
      basePax: 2,
      maxPax: 4,
      extraPaxFee: 500,
    };

  const basePax = Number.isFinite(Number(room?.basePax))
    ? Number(room.basePax)
    : defaults.basePax;
  const maxPax = Number.isFinite(Number(room?.maxPax))
    ? Number(room.maxPax)
    : defaults.maxPax;
  const extraPaxFee = Number.isFinite(Number(room?.extraPaxFee))
    ? Number(room.extraPaxFee)
    : defaults.extraPaxFee;

  return { basePax, maxPax, extraPaxFee };
}

export function calculateBookingPricing({
  ratePerNight = 0,
  basePax = 2,
  maxPax = 4,
  extraPaxFee = 500,
  nights = 1,
  paxCount = 1,
}) {
  const validNights = Math.max(1, Number(nights) || 1);
  const validPax = Math.max(1, Number(paxCount) || 1);
  const rate = Number(ratePerNight) || 0;

  const extraPaxCount = Math.max(0, validPax - basePax);
  const baseTotal = rate * validNights;
  const extraPaxTotal = extraPaxCount * extraPaxFee * validNights;
  const totalCost = baseTotal + extraPaxTotal;
  const isExceedingMaxPax = validPax > maxPax;

  return {
    nights: validNights,
    paxCount: validPax,
    basePax,
    maxPax,
    extraPaxFee,
    extraPaxCount,
    baseTotal,
    extraPaxTotal,
    totalCost,
    isExceedingMaxPax,
  };
}
