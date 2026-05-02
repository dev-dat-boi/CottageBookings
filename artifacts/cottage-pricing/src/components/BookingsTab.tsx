import { useState } from "react";
import { DayPicker, DateRange } from "react-day-picker";
import { format } from "date-fns";
import "react-day-picker/dist/style.css";
import { useCalculateBooking, useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calculator } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type RateType = "standard" | "family";

export function BookingsTab() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [rateType, setRateType] = useState<RateType>("standard");
  const [includeMultipliers, setIncludeMultipliers] = useState(false);
  const [showRateDialog, setShowRateDialog] = useState(false);

  const calculateMutation = useCalculateBooking();
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });

  const handleCalculateClick = () => {
    if (!dateRange?.from || !dateRange?.to) return;
    setShowRateDialog(true);
  };

  const handleConfirmRate = (chosenRate: RateType, withMultipliers: boolean) => {
    setRateType(chosenRate);
    setIncludeMultipliers(withMultipliers);
    setShowRateDialog(false);
    calculateMutation.mutate({
      data: {
        startDate: format(dateRange!.from!, "yyyy-MM-dd"),
        endDate: format(dateRange!.to!, "yyyy-MM-dd"),
        rateType: chosenRate,
        includeMultipliers: withMultipliers,
      },
    });
  };

  const result = calculateMutation.data;

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
              {calculateMutation.isPending ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Calculating...</>
              ) : (
                <><Calculator className="w-5 h-5 mr-2" /> Calculate Rate</>
              )}
            </Button>
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
                {/* Rate type badge */}
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

                {/* Summary cards */}
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

                {/* Nightly breakdown */}
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

      {/* Rate type dialog */}
      <RateDialog
        open={showRateDialog}
        onClose={() => setShowRateDialog(false)}
        onConfirm={handleConfirmRate}
        standardRate={settings?.basePrice ?? 300}
        familyRate={settings?.familyRate ?? 200}
      />
    </div>
  );
}

interface RateDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (rateType: RateType, includeMultipliers: boolean) => void;
  standardRate: number;
  familyRate: number;
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
          {/* Standard rate option */}
          <button
            type="button"
            onClick={() => setSelected("standard")}
            className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${
              selected === "standard"
                ? "border-primary bg-primary/5"
                : "border-border/40 hover:border-border"
            }`}
          >
            <div className="font-semibold text-foreground">Standard Rate</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              ${standardRate}/night base — all season, day, and holiday multipliers applied
            </div>
          </button>

          {/* Family rate option */}
          <button
            type="button"
            onClick={() => setSelected("family")}
            className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${
              selected === "family"
                ? "border-primary bg-primary/5"
                : "border-border/40 hover:border-border"
            }`}
          >
            <div className="font-semibold text-foreground">Family Rate</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              ${familyRate}/night base rate
            </div>
          </button>

          {/* Multiplier toggle — only shown for family */}
          {selected === "family" && (
            <div className="ml-2 mt-1 space-y-2 pl-3 border-l-2 border-primary/30">
              <p className="text-sm font-medium text-foreground">Apply multipliers?</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setWithMult(false)}
                  className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-colors ${
                    !withMult ? "bg-primary text-primary-foreground border-primary" : "border-border/40 hover:bg-muted/50"
                  }`}
                >
                  Exclude — flat ${familyRate}/night
                </button>
                <button
                  type="button"
                  onClick={() => setWithMult(true)}
                  className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-colors ${
                    withMult ? "bg-primary text-primary-foreground border-primary" : "border-border/40 hover:bg-muted/50"
                  }`}
                >
                  Include multipliers
                </button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onConfirm(selected, selected === "family" ? withMult : true)}>
            Calculate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
