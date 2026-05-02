import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { DayPicker, DateRange } from "react-day-picker";
import { format, eachDayOfInterval, parseISO } from "date-fns";
import "react-day-picker/dist/style.css";
import {
  useCalculateBooking, useGetSettings, getGetSettingsQueryKey,
  useCreateRental, getGetRentalsQueryKey, useGetRentals,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calculator, BookCheck, Home, CalendarOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type RateType = "standard" | "family";

export function BookingsTab() {
  const { toast } = useToast();
  const { isLoggedIn, user } = useAuth();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [showRateDialog, setShowRateDialog] = useState(false);
  const [showBookDialog, setShowBookDialog] = useState(false);
  const [chosenRate, setChosenRate] = useState<{ rateType: RateType; includeMultipliers: boolean } | null>(null);

  const calculateMutation = useCalculateBooking();
  const createRentalMutation = useCreateRental();
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });

  // Always load rentals so guests also see booked dates blocked on the calendar
  const { data: existingRentals } = useGetRentals({ query: { queryKey: getGetRentalsQueryKey() } });

  // Build set of booked dates from confirmed/submitted/pending rentals
  const bookedDates = useMemo(() => {
    if (!existingRentals) return new Set<string>();
    const dates = new Set<string>();
    for (const r of existingRentals) {
      if (r.status === "cancelled") continue;
      try {
        const days = eachDayOfInterval({ start: parseISO(r.startDate), end: parseISO(r.endDate) });
        for (const d of days) dates.add(format(d, "yyyy-MM-dd"));
      } catch {}
    }
    return dates;
  }, [existingRentals]);

  const disabledDays = useMemo(() => {
    const past = { before: new Date() };
    const booked = [...bookedDates].map(d => parseISO(d));
    return [past, ...booked];
  }, [bookedDates]);

  const result = calculateMutation.data;

  const handleCalculateClick = () => {
    if (!dateRange?.from || !dateRange?.to) return;
    setShowRateDialog(true);
  };

  const handleConfirmRate = (rateType: RateType, includeMultipliers: boolean) => {
    setChosenRate({ rateType, includeMultipliers });
    setShowRateDialog(false);
    calculateMutation.mutate({
      data: {
        startDate: format(dateRange!.from!, "yyyy-MM-dd"),
        endDate: format(dateRange!.to!, "yyyy-MM-dd"),
        rateType, includeMultipliers,
      },
    });
  };

  const handleBook = (renterName: string, phone: string, email: string, details: string) => {
    if (!result || !dateRange?.from || !dateRange?.to) return;
    createRentalMutation.mutate(
      {
        data: {
          renterName, phone, email,
          startDate: format(dateRange.from, "yyyy-MM-dd"),
          endDate: format(dateRange.to, "yyyy-MM-dd"),
          nights: result.nights,
          totalPrice: result.totalPrice,
          rateType: result.rateType,
          bookingType: "standard",
          extraDetails: details,
        },
      },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getGetRentalsQueryKey() });
          setShowBookDialog(false);
          if (data.confirmationToken) {
            navigate(`/booking/${data.confirmationToken}`);
          } else {
            toast({
              title: "Booking request submitted!",
              description: "An owner will review and confirm your booking soon.",
            });
          }
        },
        onError: () => toast({ title: "Error", description: "Failed to submit booking.", variant: "destructive" }),
      }
    );
  };

  const handlePersonalBook = (renterName: string, details: string) => {
    if (!dateRange?.from || !dateRange?.to) return;
    const start = format(dateRange.from, "yyyy-MM-dd");
    const end = format(dateRange.to, "yyyy-MM-dd");
    const nights = Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24));
    createRentalMutation.mutate(
      {
        data: {
          renterName,
          phone: "",
          email: user?.email || "",
          startDate: start,
          endDate: end,
          nights,
          totalPrice: 0,
          rateType: "personal",
          bookingType: "personal",
          extraDetails: details,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetRentalsQueryKey() });
          setShowBookDialog(false);
          setDateRange(undefined);
          calculateMutation.reset();
          toast({ title: "Personal use reserved!", description: "Dates blocked off on the calendar." });
        },
        onError: () => toast({ title: "Error", description: "Failed to reserve dates.", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-8">
      <div className="space-y-6">
        <Card className="border-border/40 shadow-sm">
          <CardHeader>
            <CardTitle>Select Dates</CardTitle>
            <CardDescription>
              Choose check-in and check-out dates.
              {bookedDates.size > 0 && (
                <span className="flex items-center gap-1 mt-1 text-xs text-muted-foreground/80">
                  <CalendarOff className="w-3 h-3" /> Crossed-out dates are already booked
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <DayPicker
              mode="range"
              selected={dateRange}
              onSelect={setDateRange}
              disabled={disabledDays}
              className="border border-border/40 p-4 rounded-xl bg-card shadow-sm"
              classNames={{
                day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                day_today: "font-bold text-accent",
                day_disabled: "line-through opacity-40 cursor-not-allowed",
              }}
            />
            <Button
              className="w-full mt-6 py-6 text-base"
              disabled={!dateRange?.from || !dateRange?.to || calculateMutation.isPending}
              onClick={handleCalculateClick}
            >
              {calculateMutation.isPending
                ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Calculating...</>
                : <><Calculator className="w-5 h-5 mr-2" /> Calculate Rate</>}
            </Button>
            {result && (
              <Button
                variant="default"
                className="w-full mt-3 py-6 text-base bg-green-600 hover:bg-green-700 text-white"
                onClick={() => setShowBookDialog(true)}
              >
                <BookCheck className="w-5 h-5 mr-2" /> Request Booking
              </Button>
            )}
            {isLoggedIn && dateRange?.from && dateRange?.to && (
              <Button
                variant="outline"
                className="w-full mt-2 py-5 text-sm"
                onClick={() => setShowBookDialog(true)}
              >
                <Home className="w-4 h-4 mr-2" /> Reserve for Personal Use
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <Card className="border-border/40 shadow-sm h-full">
          <CardHeader>
            <CardTitle>Booking Estimate</CardTitle>
            <CardDescription>Rate breakdown based on current settings.</CardDescription>
          </CardHeader>
          <CardContent>
            {!result ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-muted-foreground border-2 border-dashed border-border/40 rounded-xl">
                <Calculator className="w-8 h-8 opacity-30" />
                <p className="text-sm">Select dates and click Calculate to see the estimate</p>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant="outline" className="text-sm px-3 py-1 border-primary/40 text-primary">
                    {result.rateType === "family" ? "Family Rate" : "Standard Rate"}
                  </Badge>
                  {result.rateType === "family" && (
                    <Badge variant="secondary" className="text-sm px-3 py-1">
                      {result.includeMultipliers ? "Multipliers applied" : "Flat rate — no multipliers"}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                  <SummaryCard label="Nights" value={String(result.nights)} />
                  <SummaryCard label="Total" value={`$${result.totalPrice.toFixed(2)}`} accent />
                  <SummaryCard label="Avg/Night" value={`$${result.avgDailyRate.toFixed(2)}`} />
                </div>
                <div className="border border-border/40 rounded-xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow>
                          <TableHead className="whitespace-nowrap">Date</TableHead>
                          <TableHead className="whitespace-nowrap">Day</TableHead>
                          <TableHead className="whitespace-nowrap">Season</TableHead>
                          <TableHead className="whitespace-nowrap">Modifiers</TableHead>
                          <TableHead className="text-right whitespace-nowrap">Price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.breakdown.map((entry) => (
                          <TableRow key={entry.date}>
                            <TableCell className="font-medium whitespace-nowrap">{entry.date}</TableCell>
                            <TableCell className="whitespace-nowrap">{entry.dayOfWeek}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-muted/50 font-normal border-border/50 whitespace-nowrap">
                                {entry.season} ({(entry.seasonMult * 100).toFixed(0)}%)
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1.5">
                                {result.includeMultipliers && entry.dayMult !== 1 && (
                                  <Badge variant="secondary" className="font-normal whitespace-nowrap">
                                    Day: {((entry.dayMult - 1) * 100).toFixed(0)}%
                                  </Badge>
                                )}
                                {result.includeMultipliers && entry.holiday && (
                                  <Badge className="bg-accent text-accent-foreground font-normal hover:bg-accent whitespace-nowrap">
                                    {entry.holiday}: +{(entry.holidayBoost * 100).toFixed(0)}%
                                  </Badge>
                                )}
                                {(!result.includeMultipliers || (entry.dayMult === 1 && !entry.holiday)) && (
                                  <span className="text-sm text-muted-foreground">—</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-bold whitespace-nowrap">
                              ${entry.price.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <RateDialog
        open={showRateDialog}
        onClose={() => setShowRateDialog(false)}
        onConfirm={handleConfirmRate}
        standardRate={settings?.basePrice ?? 300}
        familyRate={settings?.familyRate ?? 200}
        familyRateCode={(settings as any)?.familyRateCode ?? ""}
        isLoggedIn={isLoggedIn}
      />

      {showBookDialog && dateRange?.from && dateRange?.to && (
        <BookDialog
          open={showBookDialog}
          onClose={() => setShowBookDialog(false)}
          onBook={handleBook}
          onPersonalBook={handlePersonalBook}
          isPending={createRentalMutation.isPending}
          hasCalculation={!!result}
          canPersonalBook={isLoggedIn}
          startDate={format(dateRange.from, "yyyy-MM-dd")}
          endDate={format(dateRange.to, "yyyy-MM-dd")}
          nights={result?.nights ?? Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24))}
          totalPrice={result?.totalPrice ?? 0}
          rateType={result?.rateType ?? "standard"}
          defaultName={user?.name || ""}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-card border border-border/40 p-3 sm:p-6 rounded-xl text-center shadow-sm">
      <p className="text-xs sm:text-sm text-muted-foreground font-medium mb-1">{label}</p>
      <p className={`text-lg sm:text-3xl font-bold ${accent ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

interface BookDialogProps {
  open: boolean;
  onClose: () => void;
  onBook: (name: string, phone: string, email: string, details: string) => void;
  onPersonalBook: (name: string, details: string) => void;
  isPending: boolean;
  hasCalculation: boolean;
  canPersonalBook: boolean;
  startDate: string;
  endDate: string;
  nights: number;
  totalPrice: number;
  rateType: string;
  defaultName: string;
}

function BookDialog({
  open, onClose, onBook, onPersonalBook, isPending, hasCalculation, canPersonalBook,
  startDate, endDate, nights, totalPrice, rateType, defaultName,
}: BookDialogProps) {
  const [mode, setMode] = useState<"standard" | "personal">(hasCalculation ? "standard" : "personal");
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [details, setDetails] = useState("");

  const isStandard = mode === "standard";
  const canSubmit = name.trim() && (isStandard ? phone.trim() : true);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isStandard ? "Request a Booking" : "Reserve for Personal Use"}
          </DialogTitle>
          <DialogDescription>
            {startDate} → {endDate} · {nights} night{nights !== 1 ? "s" : ""}
            {isStandard && ` · Estimated $${totalPrice.toFixed(2)} (${rateType === "family" ? "Family" : "Standard"})`}
          </DialogDescription>
        </DialogHeader>

        {/* Mode toggle — only show if logged in and has a calculation */}
        {canPersonalBook && hasCalculation && (
          <div className="flex gap-2">
            <Button
              variant={isStandard ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setMode("standard")}
            >
              <BookCheck className="w-3.5 h-3.5 mr-1" /> Rental Booking
            </Button>
            <Button
              variant={!isStandard ? "default" : "outline"}
              size="sm"
              className={`flex-1 ${!isStandard ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}`}
              onClick={() => setMode("personal")}
            >
              <Home className="w-3.5 h-3.5 mr-1" /> Personal Use
            </Button>
          </div>
        )}

        <div className="space-y-3 py-1">
          <div>
            <label className="text-sm font-medium">{isStandard ? "Your Name" : "Name"} *</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Full name"
              className="mt-1"
              autoFocus
            />
          </div>
          {isStandard && (
            <>
              <div>
                <label className="text-sm font-medium">Phone Number *</label>
                <Input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  type="tel"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  type="email"
                  className="mt-1"
                />
              </div>
            </>
          )}
          <div>
            <label className="text-sm font-medium">Notes</label>
            <Textarea
              value={details}
              onChange={e => setDetails(e.target.value)}
              placeholder={isStandard ? "Number of guests, special requests..." : "Who's staying, notes..."}
              rows={3}
              className="mt-1"
            />
          </div>
          {isStandard && (
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
              Your request will be reviewed by an owner before it's confirmed. You'll be contacted directly.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!canSubmit || isPending}
            onClick={() => {
              if (isStandard) {
                onBook(name.trim(), phone.trim(), email.trim(), details.trim());
              } else {
                onPersonalBook(name.trim(), details.trim());
              }
            }}
            className={isStandard
              ? "bg-green-600 hover:bg-green-700 text-white"
              : "bg-blue-600 hover:bg-blue-700 text-white"}
          >
            {isPending
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…</>
              : isStandard
                ? <><BookCheck className="w-4 h-4 mr-2" /> Submit Request</>
                : <><Home className="w-4 h-4 mr-2" /> Reserve</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RateDialog({ open, onClose, onConfirm, standardRate, familyRate, familyRateCode, isLoggedIn }: {
  open: boolean;
  onClose: () => void;
  onConfirm: (rateType: RateType, includeMultipliers: boolean) => void;
  standardRate: number;
  familyRate: number;
  familyRateCode: string;
  isLoggedIn: boolean;
}) {
  const [selected, setSelected] = useState<RateType>("standard");
  const [withMult, setWithMult] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [codeUnlocked, setCodeUnlocked] = useState(false);

  // Owners (logged-in users) bypass the code entirely
  const requiresCode = !isLoggedIn && familyRateCode.trim() !== "";
  const familyVisible = isLoggedIn || codeUnlocked || !requiresCode;

  function handleCodeCheck() {
    if (codeInput.trim() === familyRateCode.trim()) {
      setCodeUnlocked(true);
      setCodeError(false);
    } else {
      setCodeError(true);
    }
  }

  function handleClose() {
    setCodeInput("");
    setCodeError(false);
    setCodeUnlocked(false);
    setSelected("standard");
    setWithMult(false);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Select Rate Type</DialogTitle>
          <DialogDescription>Choose which rate to apply to this booking estimate.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <button
            type="button"
            onClick={() => setSelected("standard")}
            className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${selected === "standard" ? "border-primary bg-primary/5" : "border-border/40 hover:border-border"}`}
          >
            <div className="font-semibold text-foreground">Standard Rate</div>
            <div className="text-sm text-muted-foreground mt-0.5">${standardRate}/night base — all multipliers applied</div>
          </button>

          {/* Family rate — hidden behind code for guests */}
          {requiresCode && !codeUnlocked ? (
            <div className="border-2 border-border/40 rounded-xl p-4 space-y-3">
              <div className="font-semibold text-foreground text-sm">Family Rate</div>
              <p className="text-xs text-muted-foreground">Enter the family rate access code to unlock this option.</p>
              <div className="flex gap-2">
                <Input
                  value={codeInput}
                  onChange={e => { setCodeInput(e.target.value); setCodeError(false); }}
                  placeholder="Access code"
                  className={`font-mono flex-1 ${codeError ? "border-destructive" : ""}`}
                  onKeyDown={e => e.key === "Enter" && handleCodeCheck()}
                />
                <Button type="button" size="sm" variant="outline" onClick={handleCodeCheck}>Unlock</Button>
              </div>
              {codeError && <p className="text-xs text-destructive">Incorrect code. Please try again.</p>}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSelected("family")}
              className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${selected === "family" ? "border-primary bg-primary/5" : "border-border/40 hover:border-border"}`}
            >
              <div className="font-semibold text-foreground">Family Rate</div>
              <div className="text-sm text-muted-foreground mt-0.5">${familyRate}/night base rate</div>
            </button>
          )}

          {selected === "family" && familyVisible && (
            <div className="ml-2 pl-3 border-l-2 border-primary/30 space-y-2">
              <p className="text-sm font-medium text-foreground">Apply multipliers?</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setWithMult(false)}
                  className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-colors ${!withMult ? "bg-primary text-primary-foreground border-primary" : "border-border/40 hover:bg-muted/50"}`}
                >
                  Exclude — flat ${familyRate}/night
                </button>
                <button
                  type="button"
                  onClick={() => setWithMult(true)}
                  className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-colors ${withMult ? "bg-primary text-primary-foreground border-primary" : "border-border/40 hover:bg-muted/50"}`}
                >
                  Include multipliers
                </button>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={() => onConfirm(selected, selected === "family" ? withMult : true)}>
            Calculate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
