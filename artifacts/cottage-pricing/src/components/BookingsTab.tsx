import React, { useState } from "react";
import { DayPicker, DateRange } from "react-day-picker";
import { format } from "date-fns";
import "react-day-picker/dist/style.css";
import { useCalculateBooking } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calculator } from "lucide-react";

export function BookingsTab() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const calculateMutation = useCalculateBooking();

  const handleCalculate = () => {
    if (!dateRange?.from || !dateRange?.to) return;
    calculateMutation.mutate({
      data: {
        startDate: format(dateRange.from, "yyyy-MM-dd"),
        endDate: format(dateRange.to, "yyyy-MM-dd"),
      }
    });
  };

  const result = calculateMutation.data;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-8">
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
              onClick={handleCalculate}
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
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-card border border-border/40 p-6 rounded-xl text-center shadow-sm">
                    <p className="text-sm text-muted-foreground font-medium mb-1">Total Nights</p>
                    <p className="text-3xl font-bold text-foreground">{result.nights}</p>
                  </div>
                  <div className="bg-card border border-border/40 p-6 rounded-xl text-center shadow-sm">
                    <p className="text-sm text-muted-foreground font-medium mb-1">Total Price</p>
                    <p className="text-3xl font-bold text-primary">${result.totalPrice.toFixed(2)}</p>
                  </div>
                  <div className="bg-card border border-border/40 p-6 rounded-xl text-center shadow-sm">
                    <p className="text-sm text-muted-foreground font-medium mb-1">Avg Daily Rate</p>
                    <p className="text-3xl font-bold text-foreground">${result.avgDailyRate.toFixed(2)}</p>
                  </div>
                </div>

                <div className="border border-border/40 rounded-xl overflow-hidden shadow-sm">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Day</TableHead>
                        <TableHead>Season</TableHead>
                        <TableHead>Modifiers</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.breakdown.map((entry) => (
                        <TableRow key={entry.date}>
                          <TableCell className="font-medium">{entry.date}</TableCell>
                          <TableCell>{entry.dayOfWeek}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-muted/50 font-normal border-border/50">
                              {entry.season} ({(entry.seasonMult * 100).toFixed(0)}%)
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              {entry.dayMult !== 1 && (
                                <Badge variant="secondary" className="font-normal">
                                  Day: {((entry.dayMult - 1) * 100).toFixed(0)}%
                                </Badge>
                              )}
                              {entry.holiday && (
                                <Badge className="bg-accent text-accent-foreground font-normal hover:bg-accent">
                                  {entry.holiday}: {((entry.holidayBoost - 1) * 100).toFixed(0)}%
                                </Badge>
                              )}
                              {entry.dayMult === 1 && !entry.holiday && (
                                <span className="text-sm text-muted-foreground">-</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-bold">${entry.price.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
