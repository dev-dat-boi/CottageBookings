import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCalendar,
  useGetSettings,
  useSetDayOverride,
  useRemoveDayOverride,
  getGetCalendarQueryKey,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { CalendarEntry } from "@workspace/api-client-react/src/generated/api.schemas";

const DAY_OPTIONS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface DropdownCellProps {
  value: string;
  options: string[];
  onSelect: (val: string | null) => void;
  isOverridden?: boolean;
  canReset?: boolean;
  placeholder?: string;
}

function DropdownCell({ value, options, onSelect, isOverridden, canReset, placeholder }: DropdownCellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm transition-colors cursor-pointer
          ${isOverridden
            ? "bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700"
            : "hover:bg-muted/60 border border-transparent hover:border-border/40"
          }`}
      >
        <span>{value || placeholder || "—"}</span>
        <ChevronDown className="w-3 h-3 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 min-w-[140px] bg-popover border border-border rounded-md shadow-lg overflow-hidden">
          {canReset && (
            <button
              type="button"
              onClick={() => { onSelect(null); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 border-b border-border"
            >
              <RotateCcw className="w-3 h-3" /> Reset to default
            </button>
          )}
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => { onSelect(opt); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors
                ${opt === value ? "font-semibold text-primary" : ""}`}
            >
              {opt || "None"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CalendarTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: calendar, isLoading: calLoading } = useGetCalendar({
    query: { queryKey: getGetCalendarQueryKey() },
  });
  const { data: settings, isLoading: setLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });

  const setOverrideMutation = useSetDayOverride();
  const removeOverrideMutation = useRemoveDayOverride();

  const isLoading = calLoading || setLoading;

  const seasonOptions = settings?.seasons?.map(s => s.name) ?? [];
  const holidayOptions = ["", ...(settings?.holidays?.map(h => h.name) ?? [])];

  function handleSeasonChange(entry: CalendarEntry, newSeason: string | null) {
    if (newSeason === null) {
      removeOverrideMutation.mutate({ date: entry.date }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCalendarQueryKey() }),
        onError: () => toast({ title: "Error", description: "Failed to update.", variant: "destructive" }),
      });
    } else {
      setOverrideMutation.mutate(
        { date: entry.date, data: { seasonOverride: newSeason, holidayOverride: entry.isOverridden ? entry.holiday || null : undefined, dayOverride: entry.isOverridden ? entry.dayOfWeek : undefined } },
        {
          onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCalendarQueryKey() }),
          onError: () => toast({ title: "Error", description: "Failed to update.", variant: "destructive" }),
        }
      );
    }
  }

  function handleHolidayChange(entry: CalendarEntry, newHoliday: string | null) {
    const holiday = newHoliday === "" ? null : newHoliday;
    setOverrideMutation.mutate(
      { date: entry.date, data: { seasonOverride: entry.isOverridden ? entry.season : undefined, holidayOverride: holiday, dayOverride: entry.isOverridden ? entry.dayOfWeek : undefined } },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCalendarQueryKey() }),
        onError: () => toast({ title: "Error", description: "Failed to update.", variant: "destructive" }),
      }
    );
  }

  function handleDayChange(entry: CalendarEntry, newDay: string | null) {
    if (newDay === null) {
      removeOverrideMutation.mutate({ date: entry.date }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCalendarQueryKey() }),
        onError: () => toast({ title: "Error", description: "Failed to update.", variant: "destructive" }),
      });
    } else {
      setOverrideMutation.mutate(
        { date: entry.date, data: { seasonOverride: entry.isOverridden ? entry.season : undefined, holidayOverride: entry.isOverridden ? entry.holiday || null : undefined, dayOverride: newDay } },
        {
          onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCalendarQueryKey() }),
          onError: () => toast({ title: "Error", description: "Failed to update.", variant: "destructive" }),
        }
      );
    }
  }

  if (isLoading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;
  }

  if (!calendar) return null;

  // Group by year-month for visual separators
  let lastMonth = "";

  return (
    <Card className="border-border/40 shadow-sm overflow-hidden">
      <CardHeader className="bg-muted/30 border-b border-border/40">
        <CardTitle>Full Pricing Calendar</CardTitle>
        <CardDescription>
          Click any Day, Season, or Holiday cell to override it for that date. Highlighted cells have been customized.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-[70vh] overflow-auto">
          <Table>
            <TableHeader className="bg-card sticky top-0 z-10 shadow-[0_1px_0_hsl(var(--border))]">
              <TableRow>
                <TableHead className="w-28">Date</TableHead>
                <TableHead className="w-32">Day</TableHead>
                <TableHead className="w-32">Season</TableHead>
                <TableHead>Holiday</TableHead>
                <TableHead className="text-right w-20">Final %</TableHead>
                <TableHead className="text-right font-bold text-foreground w-28">Nightly Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calendar.map((entry) => {
                const monthKey = entry.date.slice(0, 7);
                const showMonthHeader = monthKey !== lastMonth;
                lastMonth = monthKey;

                return [
                  showMonthHeader && (
                    <TableRow key={`header-${monthKey}`} className="bg-muted/40 border-y border-border/40 hover:bg-muted/40">
                      <TableCell colSpan={6} className="py-2 px-4 font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                        {new Date(entry.date + "T12:00:00").toLocaleDateString("en-CA", { month: "long", year: "numeric" })}
                      </TableCell>
                    </TableRow>
                  ),
                  <TableRow
                    key={entry.date}
                    className={`hover:bg-muted/30 ${entry.isOverridden ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}`}
                  >
                    <TableCell className="font-medium whitespace-nowrap text-sm">{entry.date}</TableCell>

                    <TableCell>
                      <DropdownCell
                        value={entry.dayOfWeek}
                        options={DAY_OPTIONS}
                        onSelect={(val) => handleDayChange(entry, val)}
                        isOverridden={entry.isOverridden}
                        canReset={entry.isOverridden}
                      />
                    </TableCell>

                    <TableCell>
                      <DropdownCell
                        value={entry.season}
                        options={seasonOptions}
                        onSelect={(val) => handleSeasonChange(entry, val)}
                        isOverridden={entry.isOverridden}
                        canReset={entry.isOverridden}
                      />
                    </TableCell>

                    <TableCell>
                      <DropdownCell
                        value={entry.holiday || ""}
                        options={holidayOptions}
                        onSelect={(val) => handleHolidayChange(entry, val)}
                        isOverridden={entry.isOverridden && !!entry.holiday}
                        canReset={false}
                        placeholder="None"
                      />
                    </TableCell>

                    <TableCell className="text-right text-muted-foreground text-sm tabular-nums">
                      {(entry.finalPct * 100).toFixed(0)}%
                    </TableCell>
                    <TableCell className="text-right font-bold text-primary tabular-nums">
                      ${entry.price.toFixed(2)}
                    </TableCell>
                  </TableRow>,
                ].filter(Boolean);
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
