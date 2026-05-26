import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useGetBookingByToken, getGetBookingByTokenQueryKey, useRenterConfirmBooking } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loader2, TreePine, CalendarDays, Moon, DollarSign, CheckCircle2, Clock, AlertCircle, XCircle, ArrowLeft, ExternalLink } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; message: string }> = {
  pending_approval: {
    label: "Pending Review",
    color: "bg-amber-100 text-amber-800 border-amber-200",
    icon: <Clock className="w-5 h-5 text-amber-500" />,
    message: "Your booking request has been received and is waiting for owner review. You'll be contacted directly once it's confirmed.",
  },
  submitted: {
    label: "Owner Approved",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    icon: <CheckCircle2 className="w-5 h-5 text-blue-500" />,
    message: "All owners have approved your request. Final confirmation is being processed — you'll hear back very soon.",
  },
  confirmed: {
    label: "Confirmed",
    color: "bg-green-100 text-green-800 border-green-200",
    icon: <CheckCircle2 className="w-5 h-5 text-green-600" />,
    message: "Your booking is confirmed! We look forward to hosting you. Check your email for further details.",
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-red-100 text-red-800 border-red-200",
    icon: <XCircle className="w-5 h-5 text-red-500" />,
    message: "This booking has been cancelled. Please submit a new request if you'd like different dates.",
  },
};

function buildGoogleCalendarUrl(startDate: string, endDate: string, title: string) {
  const fmt = (d: string) => d.replace(/-/g, "");
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${fmt(startDate)}/${fmt(endDate)}&details=${encodeURIComponent("Cottage rental booking")}`;
}

export default function BookingConfirmationPage() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();

  const { data: booking, isLoading, isError } = useGetBookingByToken(token!, {
    query: {
      queryKey: getGetBookingByTokenQueryKey(token!),
      enabled: !!token,
      retry: 1,
    },
  });
  const [renterConfirmedLocal, setRenterConfirmedLocal] = useState<boolean | null>(null);
  const renterConfirmMutation = useRenterConfirmBooking();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="w-10 h-10 animate-spin" />
          <p className="text-sm">Loading your booking…</p>
        </div>
      </div>
    );
  }

  if (isError || !booking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Booking Not Found</h1>
            <p className="text-muted-foreground text-sm">
              This link may be invalid or the booking may have been removed. Please check the link in your confirmation.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Cottage
          </Button>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[booking.status] ?? STATUS_CONFIG["pending_approval"];
  const isPersonal = booking.bookingType === "personal";
  const displayPrice = booking.agreedPrice != null ? booking.agreedPrice : booking.totalPrice;
  const isRenterConfirmed = renterConfirmedLocal !== null ? renterConfirmedLocal : booking.renterConfirmed;
  const gcalUrl = buildGoogleCalendarUrl(
    booking.startDate,
    booking.endDate,
    `Cottage Rental — ${booking.renterName}`
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/80 backdrop-blur px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <TreePine className="w-4 h-4 text-primary-foreground" />
        </div>
        <div>
          <p className="font-semibold text-sm text-foreground leading-none">Cottage Pricing</p>
          <p className="text-xs text-muted-foreground">Booking Confirmation</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-muted-foreground"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
        </Button>
      </header>

      <main className="max-w-xl mx-auto px-4 py-10 space-y-6">
        {/* Status card */}
        <Card className="border-border/40 shadow-sm overflow-hidden">
          <div className={`px-6 py-5 flex items-start gap-4 border-b border-border/30 ${booking.status === "confirmed" ? "bg-green-50/60" : booking.status === "cancelled" ? "bg-red-50/50" : "bg-amber-50/50"}`}>
            <div className="mt-0.5">{statusCfg.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-semibold text-foreground">
                  {isPersonal ? "Personal Use" : "Rental Booking"}
                </h1>
                <Badge className={`${statusCfg.color} border font-medium text-xs`}>
                  {statusCfg.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{statusCfg.message}</p>
            </div>
          </div>

          <CardContent className="p-6 space-y-5">
            {/* Renter */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Guest name</span>
              <span className="font-semibold text-foreground">{booking.renterName}</span>
            </div>

            {/* Dates */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <CalendarDays className="w-4 h-4 text-primary" />
                Stay Dates
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Check-in</p>
                  <p className="font-semibold">{formatDate(booking.startDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Check-out</p>
                  <p className="font-semibold">{formatDate(booking.endDate)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1 border-t border-border/30">
                <Moon className="w-3 h-3" />
                {booking.nights} night{booking.nights !== 1 ? "s" : ""}
              </div>
            </div>

            {/* Price — only for standard bookings */}
            {!isPersonal && (
              <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <DollarSign className="w-4 h-4 text-primary" />
                  Pricing
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {booking.agreedPrice != null ? "Agreed price" : "Estimated total"}
                  </span>
                  <span className="text-xl font-bold text-foreground">
                    ${displayPrice.toFixed(2)}
                  </span>
                </div>
                {booking.agreedPrice != null && booking.totalPrice !== booking.agreedPrice && (
                  <p className="text-xs text-muted-foreground">
                    Original estimate: ${booking.totalPrice.toFixed(2)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground capitalize">
                  Rate type: {booking.rateType}
                </p>
              </div>
            )}

            {/* Notes */}
            {booking.extraDetails && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Notes</p>
                <p className="text-sm text-foreground bg-muted/30 rounded-lg px-3 py-2 border border-border/30">
                  {booking.extraDetails}
                </p>
              </div>
            )}

            {/* Booking ref */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/30">
              <span>Booking reference</span>
              <code className="font-mono bg-muted/50 px-2 py-0.5 rounded text-xs">
                #{booking.id}
              </code>
            </div>
          </CardContent>
        </Card>

        {/* Renter confirmation action */}
        {booking.status === "confirmed" && !isRenterConfirmed && (
          <div className="rounded-xl border border-green-200 bg-green-50/60 p-5 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
            <div>
              <p className="font-semibold text-foreground">Confirm Your Booking</p>
              <p className="text-sm text-muted-foreground mt-1">
                Please confirm that you received your booking confirmation and agree to the details above.
              </p>
            </div>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => renterConfirmMutation.mutate(
                { data: { token: token! } },
                { onSuccess: () => setRenterConfirmedLocal(true) }
              )}
              disabled={renterConfirmMutation.isPending}
            >
              {renterConfirmMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              Confirm My Booking
            </Button>
            {renterConfirmMutation.isError && (
              <p className="text-xs text-red-500">Something went wrong. Please try again or contact the owner.</p>
            )}
          </div>
        )}

        {booking.status === "confirmed" && isRenterConfirmed && (
          <div className="rounded-xl border border-green-200 bg-green-50/60 p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            <div>
              <p className="font-semibold text-green-700 text-sm">Booking Confirmed</p>
              <p className="text-xs text-muted-foreground">You have confirmed receipt of this booking. See you at the cottage!</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Cottage
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Submitted {formatDateTime(booking.createdAt)} · Bookmark this page to check your status
        </p>
      </main>
    </div>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-CA", {
      weekday: "short", year: "numeric", month: "short", day: "numeric",
    });
  } catch { return iso; }
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-CA", {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch { return iso; }
}
