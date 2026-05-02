import { useState } from "react";
import { DayPicker, DateRange } from "react-day-picker";
import { format } from "date-fns";
import "react-day-picker/dist/style.css";
import {
  useCalculateBooking, useGetSettings, getGetSettingsQueryKey,
  useCreateRental, getGetRentalsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calculator, BookCheck } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type RateType = "standard" | "family";

export function BookingsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [showRateDialog, setShowRateDialog] = useState(false);
  const [showBookDialog, setShowBookDialog] = useState(false);
  const [chosenRate, setChosenRate] = useState<{ rateType: RateType; includeMultipliers: boolean } | null>(null);

  const calculateMutation = useCalculateBooking();
  const createRentalMutation = useCreateRental();
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });

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
        rateType,
        includeMultipliers,
      },
    });
  };

  const handleBook = (renterName: string, phone: string, email: string, extraDetails: string) => {
    if (!result || !dateRange?.from || !dateRange?.to) return;
    createRentalMutation.mutate(
      {
        data: {
          renterName,
          phone,
          email,
          startDate: format(dateRange.from, "yyyy-MM-dd"),
          endDate: format(dateRange.to, "yyyy-MM-dd"),
          nights: result.nights,
          totalPrice: result.totalPrice,
          rateType: result.rateType,
          extraDetails,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetRentalsQueryKey() });
          setShowBookDialog(false);
          setDateRange(undefined);
          calculateMutation.reset();
          setChosenRate(null);
          toast({ title: "Booking submitted!", description: "Rental has been added to the Rentals tab." });
        },
        onError: () => toast({ title: "Error", description: "Failed to submit booking.", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-8">
      {/* Date picker panel */}
      <div className="space-y-6">
        <Card className="border-border/40 shadow-sm">
          <CardHeader>
            <CardTitle>Select Dates</CardTitle>
            <CardDescription>Choose check-in and check-out dates.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <DayPicker
              mode="range"
              selected={dateRange}
              onSelect={setDateRange}
              className="border border-border/40 p-4 rounded-xl bg-card shadow-sm"
              classNames={{
                day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                day_today: "font-bold text-accent",
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
                <BookCheck className="w-5 h-5 mr-2" /> Book
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Results panel */}
      <div>
        <Card className="border-border/40 shadow-sm h-full">
          <CardHeader>
            <CardTitle>Booking Estimate</CardTitle>
            <CardDescription>Rate breakdown based on current settings.</CardDescription>
          </CardHeader>
          <CardContent>
            {!result ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground border-2 border-dashed border-border/40 rounded-xl">
                Select dates and calculate to see the estimate
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
                  <div className="bg-card border border-border/40 p-2 sm:p-6 rounded-xl text-center shadow-sm min-w-0">
                    <p className="text-[10px] sm:text-sm text-muted-foreground font-medium mb-0.5 leading-tight">Nights</p>
                    <p className="text-base sm:text-3xl font-bold text-foreground">{result.nights}</p>
                  </div>
                  <div className="bg-card border border-border/40 p-2 sm:p-6 rounded-xl text-center shadow-sm min-w-0">
                    <p className="text-[10px] sm:text-sm text-muted-foreground font-medium mb-0.5 leading-tight">Total</p>
                    <p className="text-sm sm:text-3xl font-bold text-primary leading-tight">${result.totalPrice.toFixed(0)}</p>
                    <p className="text-[9px] sm:hidden text-muted-foreground">.{String(Math.round((result.totalPrice % 1) * 100)).padStart(2, "0")}</p>
                  </div>
                  <div className="bg-card border border-border/40 p-2 sm:p-6 rounded-xl text-center shadow-sm min-w-0">
                    <p className="text-[10px] sm:text-sm text-muted-foreground font-medium mb-0.5 leading-tight">Avg/Night</p>
                    <p className="text-sm sm:text-3xl font-bold text-foreground leading-tight">${result.avgDailyRate.toFixed(0)}</p>
                    <p className="text-[9px] sm:hidden text-muted-foreground">.{String(Math.round((result.avgDailyRate % 1) * 100)).padStart(2, "0")}</p>
                  </div>
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
                            <TableCell className="text-right font-bold whitespace-nowrap">${entry.price.toFixed(2)}</TableCell>
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
      />

      {showBookDialog && result && dateRange?.from && dateRange?.to && (
        <BookDialog
          open={showBookDialog}
          onClose={() => setShowBookDialog(false)}
          onBook={handleBook}
          isPending={createRentalMutation.isPending}
          startDate={format(dateRange.from, "yyyy-MM-dd")}
          endDate={format(dateRange.to, "yyyy-MM-dd")}
          nights={result.nights}
          totalPrice={result.totalPrice}
          rateType={result.rateType}
        />
      )}
    </div>
  );
}

interface BookDialogProps {
  open: boolean; onClose: () => void;
  onBook: (name: string, phone: string, email: string, details: string) => void;
  isPending: boolean;
  startDate: string; endDate: string; nights: number; totalPrice: number; rateType: string;
}

function BookDialog({ open, onClose, onBook, isPending, startDate, endDate, nights, totalPrice, rateType }: BookDialogProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [details, setDetails] = useState("");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Book this Rental</DialogTitle>
          <DialogDescription>
            {startDate} → {endDate} · {nights} night{nights !== 1 ? "s" : ""} · ${totalPrice.toFixed(2)} ({rateType === "family" ? "Family" : "Standard"})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div>
            <label className="text-sm font-medium text-foreground">Renter Name *</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Phone Number *</label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" type="tel" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Email</label>
            <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="renter@email.com" type="email" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Extra Details</label>
            <Textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="Number of guests, special requests, notes…" rows={3} className="mt-1" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!name.trim() || !phone.trim() || isPending}
            onClick={() => onBook(name.trim(), phone.trim(), email.trim(), details.trim())}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…</> : <><BookCheck className="w-4 h-4 mr-2" /> Confirm Booking</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RateDialogProps {
  open: boolean; onClose: () => void;
  onConfirm: (rateType: RateType, includeMultipliers: boolean) => void;
  standardRate: number; familyRate: number;
}

function RateDialog({ open, onClose, onConfirm, standardRate, familyRate }: RateDialogProps) {
  const [selected, setSelected] = useState<RateType>("standard");
  const [withMult, setWithMult] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Select Rate Type</DialogTitle>
          <DialogDescription>Choose which rate to apply to this booking.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <button type="button" onClick={() => setSelected("standard")}
            className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${selected === "standard" ? "border-primary bg-primary/5" : "border-border/40 hover:border-border"}`}>
            <div className="font-semibold text-foreground">Standard Rate</div>
            <div className="text-sm text-muted-foreground mt-0.5">${standardRate}/night base — all multipliers applied</div>
          </button>
          <button type="button" onClick={() => setSelected("family")}
            className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${selected === "family" ? "border-primary bg-primary/5" : "border-border/40 hover:border-border"}`}>
            <div className="font-semibold text-foreground">Family Rate</div>
            <div className="text-sm text-muted-foreground mt-0.5">${familyRate}/night base rate</div>
          </button>
          {selected === "family" && (
            <div className="ml-2 mt-1 space-y-2 pl-3 border-l-2 border-primary/30">
              <p className="text-sm font-medium text-foreground">Apply multipliers?</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setWithMult(false)}
                  className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-colors ${!withMult ? "bg-primary text-primary-foreground border-primary" : "border-border/40 hover:bg-muted/50"}`}>
                  Exclude — flat ${familyRate}/night
                </button>
                <button type="button" onClick={() => setWithMult(true)}
                  className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-colors ${withMult ? "bg-primary text-primary-foreground border-primary" : "border-border/40 hover:bg-muted/50"}`}>
                  Include multipliers
                </button>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onConfirm(selected, selected === "family" ? withMult : true)}>Calculate</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
