import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import RequiredIndicator from "@/components/common/RequiredIndicator";
import { createBooking, getAvailableRooms, uploadPaymentProof } from "@/services/bookingsService";
import { mapFirebaseError } from "@/lib/errors";
import { getRoom, isRoomActive, isRoomBookable } from "@/services/roomsService";
import { getRoomCapacity, calculateBookingPricing } from "@/lib/roomCapacity";
import RoomBookingsCalendar from "@/components/calendar/RoomBookingsCalendar";
import { Calendar as CalendarIcon, Upload, CheckCircle2, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import {
  HOTEL_GCASH_NUMBER,
  HOTEL_GCASH_QR_IMAGE_URL,
  calculatePartialPayment,
  getPaymentDetails,
  PROOF_REQUIRED_METHODS,
} from "@/lib/paymentDetails";
import { toast } from "sonner";

const PAYMENT_METHODS = ["GCash", "Bank Transfer", "Credit/Debit Card", "Over-the-Counter"];

const STEPS = [
  { index: 1, label: "Customer Info" },
  { index: 2, label: "Payment Info" },
  { index: 3, label: "Confirmation" },
];

function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((step, i) => {
        const isDone = current > step.index;
        const isActive = current === step.index;
        return (
          <div key={step.index} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors ${
                  isDone
                    ? "border-primary bg-primary text-primary-foreground"
                    : isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-foreground/40"
                }`}
              >
                {isDone ? <CheckCircle2 className="h-4 w-4" /> : step.index}
              </div>
              <span
                className={`mt-1.5 text-xs font-medium whitespace-nowrap ${
                  isActive ? "text-primary" : isDone ? "text-foreground/60" : "text-foreground/30"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`mx-2 mb-5 h-0.5 w-16 transition-colors ${
                  current > step.index ? "bg-primary" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function BookingPage() {
  const navigate = useNavigate();
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const { user, profile, trainingMode } = useAuth();

  const [room, setRoom] = useState(null);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(1);

  // Step 1
  const [leadGuestName, setLeadGuestName] = useState(profile?.fullName || "");
  const [leadGuestEmail, setLeadGuestEmail] = useState(profile?.email || "");
  const [countryCode, setCountryCode] = useState("+63");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [arrivalTime, setArrivalTime] = useState("I don't know");

  const [checkIn, setCheckIn] = useState(searchParams.get("checkIn") || "");
  const [checkOut, setCheckOut] = useState(searchParams.get("checkOut") || "");
  const [paxCount, setPaxCount] = useState(1);
  const [specialRequests, setSpecialRequests] = useState("");
  const [step1Error, setStep1Error] = useState(null);
  const [step1Touched, setStep1Touched] = useState(false);

  // Populate guest fields if profile loads after initial render
  useEffect(() => {
    if (profile) {
      setLeadGuestName((prev) => prev || profile.fullName || "");
      setLeadGuestEmail((prev) => prev || profile.email || "");
      // Handle phone number split from profile
      if (profile.phone) {
        const phone = profile.phone;
        if (phone.startsWith("+63")) {
          setCountryCode("+63");
          setPhoneNumber(phone.slice(3).replace(/\s/g, ""));
        } else {
          // Local PH format (e.g. 0912 345 6789) — strip leading 0 for the +63 code
          setCountryCode("+63");
          setPhoneNumber(phone.replace(/^0/, "").replace(/\s/g, ""));
        }
      }
    }
  }, [profile]);

  // Step 2 — Phase 16: paymentMethod state (was hardcoded "GCash" before)
  const [paymentMethod, setPaymentMethod] = useState("GCash");
  const [paymentType, setPaymentType] = useState("Full"); // Phase 10
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [honeypot, setHoneypot] = useState("");

  // Step 3
  const [bookingId, setBookingId] = useState(null);
  const [createdBookingData, setCreatedBookingData] = useState(null);
  const [paymentFile, setPaymentFile] = useState(null); // Phase 11
  const [uploadingProof, setUploadingProof] = useState(false); // Phase 11

  // Room loader useEffect
  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        setLoadingRoom(true);
        setError(null);
        const data = await getRoom(roomId);
        if (!isMounted) return;
        setRoom(data);
      } catch (e) {
        if (!isMounted) return;
        setError(mapFirebaseError(e) || "Failed to load room.");
      } finally {
        if (isMounted) setLoadingRoom(false);
      }
    }
    load();
    return () => { isMounted = false; };
  }, [roomId]);

  const roomActive = isRoomActive(room);
  const bookable = isRoomBookable(room);

  const resolvedRoomId = useMemo(() => {
    if (typeof room?.id === "string") return room.id;
    if (typeof roomId === "string" && roomId) return roomId;
    return null;
  }, [room?.id, roomId]);

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    const a = new Date(`${checkIn}T00:00:00`);
    const b = new Date(`${checkOut}T00:00:00`);
    if (b <= a) return 0;
    return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
  }, [checkIn, checkOut]);

  const roomCapacity = useMemo(() => getRoomCapacity(room), [room]);

  const pricing = useMemo(() => {
    return calculateBookingPricing({
      ratePerNight: room?.ratePerNight,
      basePax: roomCapacity.basePax,
      maxPax: roomCapacity.maxPax,
      extraPaxFee: roomCapacity.extraPaxFee,
      nights,
      paxCount,
    });
  }, [room?.ratePerNight, roomCapacity, nights, paxCount]);

  const totalCost = pricing.totalCost;

  const partialAmount = useMemo(() => calculatePartialPayment(totalCost), [totalCost]);
  const amountDue = paymentType === "Full" ? totalCost : partialAmount;

  function handleNextStep1() {
    setStep1Error(null);
    setStep1Touched(true);
    if (!leadGuestName || !leadGuestEmail || !phoneNumber) { setStep1Error("Please fill in all required customer information."); return; }
    if (!checkIn || !checkOut) { setStep1Error("Please select check-in and check-out dates."); return; }
    if (nights <= 0) { setStep1Error("Check-out must be after check-in."); return; }
    if (!bookable) { setStep1Error("This room is not currently bookable."); return; }
    if (pricing.isExceedingMaxPax) { setStep1Error(`This room accommodates a maximum of ${roomCapacity.maxPax} guests. Please reduce the guest count.`); return; }
    setStep(2);
  }
  // Step 2 Book Now — includes getAvailableRooms() defensive re-check (P0.1)
  const handleBookNow = useCallback(async () => {
    setSubmitError(null);
    if (honeypot) return; // Bot detected
    if (!user?.uid) { setSubmitError("You must be logged in to book."); return; }
    if (!room) { setSubmitError("Room not found."); return; }
    if (!resolvedRoomId) { setSubmitError("Room ID is missing. Please reload the page."); return; }
    if (!roomActive) { setSubmitError("This room is no longer available for booking."); return; }
    if (!bookable) { setSubmitError("This room is not currently bookable."); return; }
    if (pricing.isExceedingMaxPax) { setSubmitError(`This room accommodates a maximum of ${roomCapacity.maxPax} guests.`); return; }
    try {
      setSubmitting(true);
      // Defensive re-check: room may have been taken while guest was in the wizard.
      const available = await getAvailableRooms(checkIn, checkOut, { trainingMode });
      const isStillAvailable = available.some((r) => r.id === resolvedRoomId);
      if (!isStillAvailable) {
        setSubmitError("This room is no longer available for your selected dates. It may have just been booked. Please go back and choose different dates.");
        return;
      }
      const payload = {
        guestId: user.uid,
        roomId: resolvedRoomId,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        paxCount: Number(paxCount || 1),
        extraPaxCount: pricing.extraPaxCount,
        extraPaxFee: roomCapacity.extraPaxFee,
        extraPaxTotal: pricing.extraPaxTotal,
        specialRequests,
        leadGuestName,
        leadGuestEmail,
        leadGuestPhone: `${countryCode}${phoneNumber}`,
        arrivalTime,
        paymentMethod,
        paymentType,
        trainingMode,
      };
      const res = await createBooking(payload);
      setBookingId(res.id);
      setCreatedBookingData({
        id: res.id,
        totalCost,
        roomName: res.roomName || room?.name || room?.type || "Room",
        leadGuestName,
        leadGuestEmail,
        leadGuestPhone: `${countryCode}${phoneNumber}`,
        arrivalTime,
      });
      setStep(3); // Phase 13: advance to inline confirmation+upload, no Dialog
    } catch (e) {
      setSubmitError(mapFirebaseError(e) || "Booking failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [user, room, resolvedRoomId, roomActive, bookable, checkIn, checkOut, paxCount, pricing, roomCapacity, specialRequests, trainingMode, totalCost, paymentMethod, paymentType]);

  // Phase 10/11: exact signature preserved — only "GCash" arg replaced by paymentMethod
  async function handleUploadProof() {
    if (!paymentFile) { toast.error("Please select a file to upload."); return; }
    setUploadingProof(true);
    try {
      await uploadPaymentProof(bookingId, paymentFile, paymentType, paymentMethod, { trainingMode });
      toast.success("Payment proof uploaded successfully!");
      navigate("/my-bookings");
    } catch (err) {
      toast.error(mapFirebaseError(err) || "Failed to upload payment proof.");
    } finally {
      setUploadingProof(false);
    }
  }

  // Phase 13: Upload Later — booking already created, proof uploadable from My Bookings
  function handleSkipUpload() { navigate("/my-bookings"); }

  // Phase 14+16: dynamic payment instructions via getPaymentDetails()
  function renderPaymentInstructions(method, amount) {
    const details = getPaymentDetails(method);
    return (
      <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-2 text-sm">
        <div className="font-semibold text-sm">Payment Instructions</div>
        <div className="space-y-1.5">
          <p>Please send <span className="font-semibold">&#8369;{amount.toLocaleString()}</span> via {method}:</p>
          {details.number && (
            <div className="flex items-center gap-2 bg-background border border-border p-2 rounded font-mono font-semibold">{details.number}</div>
          )}
          {details.bankName && (
            <div className="space-y-0.5">
              <div className="font-medium">{details.bankName}</div>
              <div className="font-mono text-sm">{details.accountNumber}</div>
              <div className="text-foreground/60 text-sm">{details.accountName}</div>
            </div>
          )}
          {method === "GCash" && HOTEL_GCASH_QR_IMAGE_URL && (
            <div className="flex justify-center pt-1">
              <img src={HOTEL_GCASH_QR_IMAGE_URL} alt="GCash QR Code" className="w-28 h-28 object-contain border border-border rounded" onError={(e) => (e.target.style.display = "none")} />
            </div>
          )}
          <p className="text-foreground/60 text-xs">{details.instructions}</p>
        </div>
      </div>
    );
  }
  // Pre-render guards
  if (loadingRoom) {
    return (
      <div className="space-y-6">
        <div className="space-y-1"><h1 className="font-playfair text-3xl font-semibold">Booking</h1></div>
        <div className="rounded-xl border border-border bg-background p-6 text-sm text-foreground/70">Loading booking data&#8230;</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-6">
        <div className="space-y-1"><h1 className="font-playfair text-3xl font-semibold">Booking</h1></div>
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">{error}</div>
      </div>
    );
  }
  if (!room) {
    return (
      <div className="space-y-6">
        <div className="space-y-1"><h1 className="font-playfair text-3xl font-semibold">Booking</h1></div>
        <div className="rounded-xl border border-border bg-background p-6 text-sm text-foreground/70">Room not found.</div>
      </div>
    );
  }
  // Archived-room graceful-degradation guard — preserved from original (Phase conflict watch)
  if (!roomActive) {
    return (
      <div className="space-y-6">
        <div className="space-y-1"><h1 className="font-playfair text-3xl font-semibold">Booking</h1></div>
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-5 space-y-3">
          <div className="font-semibold">This room is no longer available</div>
          <p className="text-sm text-foreground/80">This room has been archived and cannot accept new bookings.</p>
          <Button variant="outline" onClick={() => navigate("/rooms")}>Browse Available Rooms</Button>
        </div>
      </div>
    );
  }

  const roomDisplayName = room.name || room.type || "Room";
  const roomSubtitle = room.roomNumber ? `Room ${room.roomNumber}` : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-playfair text-3xl font-semibold">Booking</h1>
        <p className="text-foreground/80">
          {roomDisplayName}{roomSubtitle ? ` \u00B7 ${roomSubtitle}` : ""} &mdash; PHP {Number(room.ratePerNight ?? 0).toLocaleString()} / night
        </p>
      </div>

      <StepIndicator current={step} />
      {/* Honeypot — hidden from humans, bots will fill it */}
      <input
        type="text"
        name="fax_number"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        style={{ position: "absolute", left: "-9999px", opacity: 0, height: 0, width: 0 }}
      />
      {/* STEP 1 — Customer Info */}
      {step === 1 && (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-xl border border-border bg-background p-5 space-y-4">
              <div className="text-base font-semibold">Customer Information</div>
              <div className="space-y-2">
                <Label htmlFor="leadGuestName" className="text-sm font-medium">Full Name<RequiredIndicator /></Label>
                <Input id="leadGuestName" required value={leadGuestName} onChange={(e) => setLeadGuestName(e.target.value)} className={step1Touched && !leadGuestName ? "border-destructive focus-visible:ring-destructive" : ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="leadGuestEmail" className="text-sm font-medium">Email Address<RequiredIndicator /></Label>
                <Input id="leadGuestEmail" type="email" required value={leadGuestEmail} onChange={(e) => setLeadGuestEmail(e.target.value)} className={step1Touched && !leadGuestEmail ? "border-destructive focus-visible:ring-destructive" : ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="leadGuestPhone" className="text-sm font-medium">Phone Number<RequiredIndicator /></Label>
                <div className="flex gap-2">
                  <select
                    id="countryCode"
                    className="flex h-10 w-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                  >
                    <option value="+63">+63</option>
                  </select>
                  <Input
                    id="phoneNumber"
                    type="tel"
                    required
                    placeholder="912 345 6789"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className={`flex-1 ${step1Touched && !phoneNumber ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  />
                </div>
              </div>

              <div className="border-t border-border pt-4 mt-4" />

              <div className="text-base font-semibold">Stay Details</div>
              <div className="space-y-2">
                <Label htmlFor="checkIn" className="text-sm font-medium">
                  Check-in <RequiredIndicator /> <span className="text-foreground/50 font-normal">(2:00 PM)</span>
                </Label>
                <div className="relative">
                  <Input id="checkIn" type="date" required className={`pr-10 border-border text-sm [&::-webkit-calendar-picker-indicator]:hidden ${step1Touched && !checkIn ? "border-destructive focus-visible:ring-destructive" : ""}`} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} onFocus={(e) => e.target.blur()} />
                  <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 pointer-events-none" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="checkOut" className="text-sm font-medium">
                  Check-out <RequiredIndicator /> <span className="text-foreground/50 font-normal">(12:00 NN)</span>
                </Label>
                <div className="relative">
                  <Input id="checkOut" type="date" required className={`pr-10 border-border text-sm [&::-webkit-calendar-picker-indicator]:hidden ${step1Touched && !checkOut ? "border-destructive focus-visible:ring-destructive" : ""}`} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} onFocus={(e) => e.target.blur()} />
                  <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 pointer-events-none" />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="paxCount" className="text-sm font-medium">Number of Guests (pax)<RequiredIndicator /></Label>
                  <span className="text-xs text-foreground/50">Max {roomCapacity.maxPax} pax</span>
                </div>
                <Input
                  id="paxCount"
                  type="number"
                  min={1}
                  max={roomCapacity.maxPax}
                  required
                  value={paxCount}
                  onChange={(e) => setPaxCount(e.target.value)}
                  className={pricing.isExceedingMaxPax ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                <p className="text-xs text-foreground/50">
                  Base rate covers up to {roomCapacity.basePax} guest{roomCapacity.basePax !== 1 ? "s" : ""}.
                  {roomCapacity.extraPaxFee > 0 ? ` Extra guest fee: +₱${roomCapacity.extraPaxFee.toLocaleString()}/night per extra guest.` : ""}
                </p>
                {pricing.isExceedingMaxPax && (
                  <p className="text-xs font-medium text-destructive">
                    Exceeds maximum capacity of {roomCapacity.maxPax} guests. Please reduce guest count.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="specialRequests" className="text-sm font-medium">
                  Special Requests <span className="text-foreground/50 font-normal">(optional)</span>
                </Label>
                <Input id="specialRequests" placeholder="e.g., late arrival, extra towels" value={specialRequests} onChange={(e) => setSpecialRequests(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="arrivalTime" className="text-sm font-medium">Expected Arrival Time</Label>
                <select
                  id="arrivalTime"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={arrivalTime}
                  onChange={(e) => setArrivalTime(e.target.value)}
                >
                  <option value="I don't know">I don't know</option>
                  <option value="Standard Arrival (Anytime after 2:00 PM)">Standard Arrival (Anytime after 2:00 PM)</option>
                  <option value="Late Arrival (After Midnight)">Late Arrival (After Midnight)</option>
                </select>
              </div>
              {nights > 0 && (
                <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-foreground/50">Nights</span>
                    <span className="font-semibold text-foreground/80">{nights}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-foreground/50">Base Room Total ({nights} night{nights !== 1 ? "s" : ""})</span>
                    <span className="font-medium text-foreground/80">PHP {pricing.baseTotal.toLocaleString()}</span>
                  </div>
                  {pricing.extraPaxCount > 0 && (
                    <div className="flex items-center justify-between text-xs text-primary/90 font-medium">
                      <span>Extra Guests ({pricing.extraPaxCount} pax × ₱{roomCapacity.extraPaxFee.toLocaleString()} × {nights}n)</span>
                      <span>+PHP {pricing.extraPaxTotal.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-border/30 pt-1.5">
                    <span className="text-foreground/70 font-semibold">Estimated Total</span>
                    <span className="font-bold text-primary text-base">PHP {pricing.totalCost.toLocaleString()}</span>
                  </div>
                </div>
              )}
              {!bookable && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground/80">
                  This room is currently not bookable (status: {room?.status || "Unknown"}).
                </div>
              )}
              {step1Error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground">{step1Error}</div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" variant="default" onClick={handleNextStep1} disabled={!bookable}>
                  Next <ChevronRight className="ml-1.5 h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate(`/rooms/${roomId}`)}>Back to Room</Button>
              </div>
            </div>
          </div>
          <div className="lg:col-span-3">
            {resolvedRoomId ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="font-semibold">Booking Calendar</div>
                  <div className="text-sm text-foreground/70">Existing bookings for this room. Date conflicts are blocked on submit.</div>
                </div>
                <RoomBookingsCalendar roomId={resolvedRoomId} trainingMode={trainingMode} />
              </div>
            ) : null}
          </div>
        </div>
      )}
      {/* STEP 2 — Payment Information */}
      {/* Phase 16: full multi-method selector; Phase 14: dynamic instructions; Phase 10: Full/Partial */}
      {step === 2 && (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-4">
            <div className="rounded-xl border border-border bg-background p-5 space-y-5">
              <div className="text-base font-semibold">Payment Information</div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-foreground/60">Payment Method</label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map((method) => (
                    <label key={method} className={`flex items-center gap-2 cursor-pointer rounded-lg border p-3 transition-colors ${paymentMethod === method ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/30"}`}>
                      <input type="radio" name="paymentMethod" value={method} checked={paymentMethod === method} onChange={(e) => setPaymentMethod(e.target.value)} className="accent-primary" />
                      <span className="text-sm font-medium">{method}</span>
                    </label>
                  ))}
                </div>
              </div>
              {renderPaymentInstructions(paymentMethod, amountDue)}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-foreground/60">Payment Type</label>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="paymentType" value="Full" checked={paymentType === "Full"} onChange={(e) => setPaymentType(e.target.value)} className="accent-primary" />
                    <span className="text-sm">Full Payment (&#8369;{totalCost.toLocaleString()})</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="paymentType" value="Partial" checked={paymentType === "Partial"} onChange={(e) => setPaymentType(e.target.value)} className="accent-primary" />
                    <span className="text-sm">Partial Payment (&#8369;{partialAmount.toLocaleString()})</span>
                  </label>
                </div>
              </div>
              {submitError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground">{submitError}</div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => { setSubmitError(null); setStep(1); }} disabled={submitting}>
                  <ChevronLeft className="mr-1.5 h-4 w-4" /> Back
                </Button>
                <Button type="button" variant="default" onClick={handleBookNow} disabled={submitting}>
                  {submitting ? "Verifying & Booking\u2026" : "Book Now"}
                </Button>
              </div>
            </div>
          </div>
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-border bg-background p-5 space-y-4 sticky top-6">
              <div className="text-base font-semibold">Booking Summary</div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70">Room</span>
                  <span className="font-medium text-right">{roomDisplayName}{roomSubtitle ? ` \u00B7 ${roomSubtitle}` : ""}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70">Check-in</span>
                  <span className="font-medium">{checkIn}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70">Check-out</span>
                  <span className="font-medium">{checkOut}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70">Nights</span>
                  <span className="font-medium">{nights}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70">Guests (pax)</span>
                  <span className="font-medium">{paxCount}</span>
                </div>
              </div>
              <div className="border-t border-border pt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70">Base Room Total</span>
                  <span className="font-medium">PHP {pricing.baseTotal.toLocaleString()}</span>
                </div>
                {pricing.extraPaxCount > 0 && (
                  <div className="flex items-center justify-between text-xs text-primary font-medium">
                    <span>Extra Guests ({pricing.extraPaxCount} pax × ₱{roomCapacity.extraPaxFee.toLocaleString()} × {nights}n)</span>
                    <span>+PHP {pricing.extraPaxTotal.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-dashed border-border/60 pt-1.5 font-semibold">
                  <span className="text-foreground">Total Cost</span>
                  <span>PHP {totalCost.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70">Amount Due Now</span>
                  <span className="font-semibold text-primary">&#8369;{amountDue.toLocaleString()} <span className="text-foreground/50 font-normal ml-1">({paymentType})</span></span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70">Method</span>
                  <span className="font-medium">{paymentMethod}</span>
                </div>
              </div>
              {specialRequests && (
                <div className="border-t border-border pt-3">
                  <p className="text-xs text-foreground/50 uppercase tracking-wide mb-1">Special Requests</p>
                  <p className="text-sm text-foreground/80">{specialRequests}</p>
                </div>
              )}
              <div className="rounded-lg border border-border/40 bg-muted/10 p-3 text-xs text-foreground/60">
                <Clock className="inline h-3.5 w-3.5 mr-1 align-middle" />
                A confirmation email will be sent once your booking is approved by Front Office staff. Submitting this form does not guarantee immediate approval.
              </div>
            </div>
          </div>
        </div>
      )}
      {/* STEP 3 — Confirmation + Payment Proof Upload */}
      {/* Phase 13: immediate post-booking prompt, inline (no Dialog). Phase 11: upload widget. */}
      {step === 3 && bookingId && createdBookingData && (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-4">
            <div className="rounded-xl border border-success/30 bg-success/10 p-5 space-y-3">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-semibold text-base">Booking Created!</span>
              </div>
              <p className="text-sm font-medium text-success">
                Thank you for your reservation.
              </p>
              <p className="text-sm text-foreground/80">
                {(() => {
                  const requiresProof = PROOF_REQUIRED_METHODS.includes(paymentMethod);
                  
                  if (requiresProof) {
                    return <>Your booking is now <strong>Awaiting Payment</strong>. Please upload your payment proof below to complete the reservation.</>;
                  }
                  
                  // OTC/Card - distinguish Full vs Partial
                  if (paymentType === "Full") {
                    return <>Your full payment will be verified and recorded by Front Office. Your booking is pending FO review.</>;
                  }
                  
                  // Partial + OTC/Card
                  return <>Pay the remaining balance at the front desk upon arrival. Your booking is pending FO review.</>;
                })()}
              </p>
              <div className="text-sm">
                <span className="text-foreground/60">Booking ID: </span>
                <span className="font-mono font-semibold">{bookingId}</span>
              </div>
            </div>
            
            {/* Phase 17.3: Only show upload widget for GCash and Bank Transfer */}
            {PROOF_REQUIRED_METHODS.includes(paymentMethod) ? (
              <div className="rounded-xl border border-border bg-background p-5 space-y-4">
                <div className="text-base font-semibold">Upload Payment Proof</div>
                {renderPaymentInstructions(paymentMethod, amountDue)}
                <div className="flex items-center gap-2 text-sm text-foreground/70">
                  <span>Payment type:</span>
                  <span className="font-semibold text-foreground">{paymentType} &mdash; &#8369;{amountDue.toLocaleString()}</span>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Proof Image</Label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setPaymentFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-foreground/70 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                    disabled={uploadingProof}
                  />
                  {paymentFile && (
                    <p className="text-xs text-foreground/60">Selected: {paymentFile.name}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button type="button" variant="default" onClick={handleUploadProof} disabled={uploadingProof || !paymentFile}>
                    <Upload className="mr-2 h-4 w-4" />
                    {uploadingProof ? "Uploading\u2026" : "Upload Payment Proof"}
                  </Button>
                  {/* Phase 13: Upload Later — booking held until payment deadline */}
                  <Button type="button" variant="outline" onClick={handleSkipUpload} disabled={uploadingProof}>
                    Skip for Now
                  </Button>
                </div>
                <p className="text-xs text-foreground/50">
                  You can also upload your proof later from{" "}
                  <button type="button" className="underline hover:text-foreground/80 transition-colors" onClick={() => navigate("/my-bookings")}>
                    My Bookings
                  </button>
                  . Your booking will be held until the payment deadline.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-background p-5 space-y-4">
                <div className="text-base font-semibold">Payment Information</div>
                {renderPaymentInstructions(paymentMethod, amountDue)}
                <div className="flex items-center gap-2 text-sm text-foreground/70">
                  <span>Payment type:</span>
                  <span className="font-semibold text-foreground">{paymentType} &mdash; &#8369;{amountDue.toLocaleString()}</span>
                </div>
                <div className="rounded-lg border border-border/40 bg-muted/10 p-3 text-xs text-foreground/60">
                  <Clock className="inline h-3.5 w-3.5 mr-1 align-middle" />
                  {paymentType === "Full" 
                    ? "Your full payment will be verified and recorded by Front Office. Your booking is pending FO review."
                    : "Pay the remaining balance at the front desk upon arrival. Your booking is pending FO review."
                  }
                </div>
                <p className="text-xs text-foreground/50">
                  You can view your booking details and payment status from{" "}
                  <button type="button" className="underline hover:text-foreground/80 transition-colors" onClick={() => navigate("/my-bookings")}>
                    My Bookings
                  </button>
                  .
                </p>
              </div>
            )}
          </div>
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-border bg-background p-5 space-y-4 sticky top-6">
              <div className="text-base font-semibold">Booking Summary</div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70">Room</span>
                  <span className="font-medium text-right">{createdBookingData.roomName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70">Check-in</span>
                  <span className="font-medium">{checkIn}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70">Check-out</span>
                  <span className="font-medium">{checkOut}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70">Nights</span>
                  <span className="font-medium">{nights}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70">Guests (pax)</span>
                  <span className="font-medium">{paxCount}</span>
                </div>
              </div>
              <div className="border-t border-border pt-3 space-y-2 text-sm">
                <p className="text-xs text-foreground/50 uppercase tracking-wide mb-1">Guest Info</p>
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70">Name</span>
                  <span className="font-medium text-right">{createdBookingData.leadGuestName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70">Email</span>
                  <span className="font-medium text-right">{createdBookingData.leadGuestEmail}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70">Phone</span>
                  <span className="font-medium text-right">{createdBookingData.leadGuestPhone}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70">Arrival</span>
                  <span className="font-medium text-right">{createdBookingData.arrivalTime}</span>
                </div>
              </div>
              <div className="border-t border-border pt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70">Total Cost</span>
                  <span className="font-semibold">PHP {createdBookingData.totalCost.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70">Amount Due</span>
                  <span className="font-semibold text-primary">&#8369;{amountDue.toLocaleString()} <span className="text-foreground/50 font-normal ml-1">({paymentType})</span></span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70">Method</span>
                  <span className="font-medium">{paymentMethod}</span>
                </div>
              </div>
              <div className="rounded-lg border border-border/40 bg-muted/10 p-3 text-xs text-foreground/60">
                <Clock className="inline h-3.5 w-3.5 mr-1 align-middle" />
                A confirmation email will be sent once your booking is approved by Front Office staff &mdash; not at this stage.
              </div>
              <Button variant="default" size="sm" className="w-full" onClick={() => navigate("/my-bookings")}>
                Go to My Bookings
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}