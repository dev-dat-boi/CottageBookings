import React from "react";
import { useGetCalendar, getGetCalendarQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export function CalendarTab() {
  const { data: calendar, isLoading } = useGetCalendar({
    query: { queryKey: getGetCalendarQueryKey() }
  });

  if (isLoading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;
  }

  if (!calendar) return null;

  return (
    <Card className="border-border/40 shadow-sm overflow-hidden">
      <CardHeader className="bg-muted/30 border-b border-border/40">
        <CardTitle>Full Year Pricing Calendar</CardTitle>
        <CardDescription>A comprehensive view of nightly rates across the entire year.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-[70vh] overflow-auto">
          <Table>
            <TableHeader className="bg-card sticky top-0 z-10 shadow-[0_1px_0_hsl(var(--border))]">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Day</TableHead>
                <TableHead>Season</TableHead>
                <TableHead>Modifiers Applied</TableHead>
                <TableHead className="text-right">Final %</TableHead>
                <TableHead className="text-right font-bold text-foreground">Nightly Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calendar.map((entry) => (
                <TableRow key={entry.date} className="hover:bg-muted/30">
                  <TableCell className="font-medium whitespace-nowrap">{entry.date}</TableCell>
                  <TableCell>{entry.dayOfWeek}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-muted/50 font-normal border-border/50">
                      {entry.season}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="font-normal text-xs">
                        Season: {entry.seasonMult}x
                      </Badge>
                      {entry.dayMult !== 1 && (
                        <Badge variant="secondary" className="font-normal text-xs bg-secondary/10 text-secondary-foreground border-secondary/20">
                          Day: {entry.dayMult}x
                        </Badge>
                      )}
                      {entry.holiday && (
                        <Badge className="font-normal text-xs bg-accent text-accent-foreground">
                          {entry.holiday}: {entry.holidayBoost}x
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">
                    {(entry.finalPct * 100).toFixed(0)}%
                  </TableCell>
                  <TableCell className="text-right font-bold text-primary tabular-nums">
                    ${entry.price.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
