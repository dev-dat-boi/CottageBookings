import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCalendar,
  useGetSettings,
  useSetDayOverride,
  useRemoveDayOverride,
  useSetBulkDays,
  getGetCalendarQueryKey,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import type { CalendarEntry } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronDown, RotateCcw, AlertTriangle, GitBranch, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAdminLock } from "@/contexts/AdminLockContext";

const DAY_OPTIONS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface PendingOverride {
  entry: CalendarEntry;
  field: "season" | "holiday" | "day";
  value: string | null;
  syncedName: string;
}

interface DropdownCellProps {
  value: string;
  options: string[];
  onSelect: (val: string | null) => void;
  isSynced?: boolean;
  isOverridden?: boolean;
  canReset?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

function DropdownCell({ value, options, onSelect, isSynced, isOverridden, canReset, placeholder, disabled }: DropdownCellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const colorClass = disabled
    ? "opacity-50 cursor-not-allowed border border-transparent"
    : isOverridden
    ? "bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700"
    : isSynced
    ? "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700"
    : "hover:bg-muted/60 border border-transparent hover:border-border/40";

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm transition-colors ${disabled ? "cursor-not-allowed" : "cursor-pointer"} ${colorClass}`}
        title={isSynced ? "Auto-assigned by date range rule" : undefined}
      >
        <span>{value || placeholder || "—"}</span>
        {!disabled && <ChevronDown className="w-3 h-3 opacity-50" />}
      </button>

      {open && !disabled && (
        <div className="absolute z-50 top-full left-0 mt-1 min-w-[160px] bg-popover border border-border rounded-md shadow-lg overflow-hidden">
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
              key={opt === "" ? "none" : opt}
              type="button"
              onClick={() => { onSelect(opt === "" ? null : opt); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${opt === value ? "font-semibold text-primary" : ""}`}
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
  const { isLocked } = useAdminLock();

  const curYear = new Date().getFullYear();
  const [fromYear, setFromYear] = useState(curYear);
  const [toYear, setToYear] = useState(curYear + 1);

  const [pendingOverride, setPendingOverride] = useState<PendingOverride | null>(null);
  const [pendingCascade, setPendingCascade] = useState<{ entry: CalendarEntry; day: string } | null>(null);

  const calQueryKey = getGetCalendarQueryKey({ fromYear, toYear });

  const { data: calendar, isLoading: calLoading } = useGetCalendar(
    { fromYear, toYear },
    { query: { queryKey: calQueryKey } }
  );
  const { data: settings, isLoading: setLoading } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });

  const setOverrideMutation = useSetDayOverride();
  const removeOverrideMutation = useRemoveDayOverride();
  const setBulkDaysMutation = useSetBulkDays();

  const isLoading = calLoading || setLoading;
  const seasonOptions = settings?.seasons?.map(s => s.name) ?? [];
  const holidayOptions = ["", ...(settings?.holidays?.map(h => h.name) ?? [])];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: calQueryKey });
  const mutOpts = {
    onSuccess: invalidate,
    onError: () => toast({ title: "Error", description: "Failed to update.", variant: "destructive" }),
  };

  function applyOverride(entry: CalendarEntry, field: "season" | "holiday" | "day", value: string | null) {
    const keepSeason = entry.seasonIsOverridden ? entry.season : null;
    const keepHoliday = entry.holidayIsOverridden ? (entry.holiday === "" ? "" : entry.holiday || null) : null;
    const keepDay = entry.dayIsOverridden ? entry.dayOfWeek : null;

    if (field === "day") {
      if (value === null) {
        if (entry.dayIsOverridden && !entry.seasonIsOverridden && !entry.holidayIsOverridden) {
          removeOverrideMutation.mutate({ date: entry.date }, mutOpts);
        } else {
          setOverrideMutation.mutate({ date: entry.date, data: { dayOverride: null, seasonOverride: keepSeason, holidayOverride: keepHoliday } }, mutOpts);
        }
      } else {
        setOverrideMutation.mutate({ date: entry.date, data: { dayOverride: value, seasonOverride: keepSeason, holidayOverride: keepHoliday } }, mutOpts);
      }
    } else if (field === "season") {
      if (value === null) {
        if (entry.seasonIsOverridden && !entry.dayIsOverridden && !entry.holidayIsOverridden) {
          removeOverrideMutation.mutate({ date: entry.date }, mutOpts);
        } else {
          setOverrideMutation.mutate({ date: entry.date, data: { seasonOverride: null, dayOverride: keepDay, holidayOverride: keepHoliday } }, mutOpts);
        }
      } else {
        setOverrideMutation.mutate({ date: entry.date, data: { seasonOverride: value, dayOverride: keepDay, holidayOverride: keepHoliday } }, mutOpts);
      }
    } else if (field === "holiday") {
      const isNone = value === null || value === "";

      if (isNone) {
        // Already suppressed — no-op
        if (entry.holidayIsOverridden && entry.holiday === "") return;

        if (entry.holidayIsOverridden && entry.holiday !== "") {
          // Remove a real holiday override
          if (!entry.seasonIsOverridden && !entry.dayIsOverridden) {
            removeOverrideMutation.mutate({ date: entry.date }, mutOpts);
          } else {
            setOverrideMutation.mutate({ date: entry.date, data: { holidayOverride: null, seasonOverride: keepSeason, dayOverride: keepDay } }, mutOpts);
          }
        } else if (!entry.holidayIsOverridden && entry.holiday !== "") {
          // Suppress natural/synced holiday with "" sentinel (no amber highlight)
          setOverrideMutation.mutate({ date: entry.date, data: { holidayOverride: "", seasonOverride: keepSeason, dayOverride: keepDay } }, mutOpts);
        }
        // else: not overridden, no holiday → do nothing
      } else {
        setOverrideMutation.mutate({ date: entry.date, data: { holidayOverride: value, seasonOverride: keepSeason, dayOverride: keepDay } }, mutOpts);
      }
    }
  }

  function tryOverride(entry: CalendarEntry, field: "season" | "holiday" | "day", value: string | null) {
    // Check for cascade: if this is the first calendar entry and changing day-of-week
    if (field === "day" && value !== null && calendar && entry.date === calendar[0].date) {
      setPendingCascade({ entry, day: value });
      return;
    }

    const synced = field === "season" ? entry.syncedSeason : field === "holiday" ? entry.syncedHoliday : null;
    if (synced && !entry.isOverridden && !(value === null || value === "")) {
      setPendingOverride({ entry, field, value, syncedName: synced });
    } else {
      applyOverride(entry, field, value);
    }
  }

  function confirmCascade(cascadeAll: boolean) {
    if (!pendingCascade) return;
    const { entry, day } = pendingCascade;
    setPendingCascade(null);

    if (cascadeAll) {
      setBulkDaysMutation.mutate(
        { data: { startDay: day, fromYear, toYear } },
        {
          onSuccess: invalidate,
          onError: () => toast({ title: "Error", description: "Failed to apply cascade.", variant: "destructive" }),
        }
      );
    } else {
      applyOverride(entry, "day", day);
    }
  }

  if (isLoading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;
  }

  if (!calendar) return null;

  let lastMonth = "";

  return (
    <>
      <Card className="border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/30 border-b border-border/40">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                Full Pricing Calendar
                {isLocked && <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground border border-border rounded-full px-2 py-0.5"><Lock className="w-3 h-3" /> Read-only</span>}
              </CardTitle>
              <CardDescription className="mt-1">
                {!isLocked && "Click Day, Season, or Holiday to override."}
                <span className="inline-flex items-center gap-1 ml-0 mt-1 text-xs text-blue-600 dark:text-blue-400">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-300" /> Auto-assigned
                </span>
                <span className="inline-flex items-center gap-1 ml-3 text-xs text-amber-600 dark:text-amber-400">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-300" /> Overridden
                </span>
              </CardDescription>
            </div>

            {/* Year range selector */}
            <div className="flex items-center gap-3 bg-card border border-border/40 rounded-xl px-4 py-2 shadow-sm">
              <span className="text-sm text-muted-foreground font-medium">Years:</span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFromYear(y => Math.max(2020, y - 1))}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-semibold w-12 text-center">{fromYear}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFromYear(y => Math.min(toYear, y + 1))}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <span className="text-muted-foreground">→</span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setToYear(y => Math.max(fromYear, y - 1))}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-semibold w-12 text-center">{toYear}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setToYear(y => Math.min(2040, y + 1))}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[70vh] overflow-auto">
            <Table>
              <TableHeader className="bg-card sticky top-0 z-10 shadow-[0_1px_0_hsl(var(--border))]">
                <TableRow>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead className="w-32">Day</TableHead>
                  <TableHead className="w-36">Season</TableHead>
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
                          onSelect={(val) => tryOverride(entry, "day", val)}
                          isOverridden={entry.dayIsOverridden}
                          canReset={entry.dayIsOverridden}
                          disabled={isLocked}
                        />
                      </TableCell>

                      <TableCell>
                        <DropdownCell
                          value={entry.season}
                          options={seasonOptions}
                          onSelect={(val) => tryOverride(entry, "season", val)}
                          isSynced={!!entry.syncedSeason && !entry.seasonIsOverridden}
                          isOverridden={entry.seasonIsOverridden}
                          canReset={entry.seasonIsOverridden}
                          disabled={isLocked}
                        />
                      </TableCell>

                      <TableCell>
                        <DropdownCell
                          value={entry.holiday || ""}
                          options={holidayOptions}
                          onSelect={(val) => tryOverride(entry, "holiday", val)}
                          isSynced={!!entry.syncedHoliday && !entry.holidayIsOverridden}
                          isOverridden={entry.holidayIsOverridden && !!entry.holiday && entry.holiday !== ""}
                          canReset={false}
                          placeholder="None"
                          disabled={isLocked}
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

      {/* Synced warning dialog */}
      <Dialog open={!!pendingOverride} onOpenChange={() => setPendingOverride(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Auto-assigned date
            </DialogTitle>
            <DialogDescription className="pt-1">
              <strong>{pendingOverride?.entry.date}</strong> is automatically assigned to{" "}
              <strong>{pendingOverride?.syncedName}</strong> via a date range rule in the Control Panel.
              <br /><br />
              Overriding it will disconnect it from that rule. You can reset it at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPendingOverride(null)}>Cancel</Button>
            <Button onClick={() => {
              if (pendingOverride) { applyOverride(pendingOverride.entry, pendingOverride.field, pendingOverride.value); setPendingOverride(null); }
            }}>Override anyway</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cascade day popup */}
      <Dialog open={!!pendingCascade} onOpenChange={() => setPendingCascade(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-primary" />
              Apply to all days?
            </DialogTitle>
            <DialogDescription className="pt-1">
              You're setting <strong>{pendingCascade?.entry.date}</strong> to{" "}
              <strong>{pendingCascade?.day}</strong>.<br /><br />
              Do you want all subsequent days to follow in order from <strong>{pendingCascade?.day}</strong>?
              ({pendingCascade ? buildSequencePreview(pendingCascade.day) : ""})
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setPendingCascade(null)}>Cancel</Button>
            <Button variant="outline" onClick={() => confirmCascade(false)}>Just this date</Button>
            <Button onClick={() => confirmCascade(true)}>Cascade all days</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function buildSequencePreview(startDay: string): string {
  const idx = DAY_OPTIONS.indexOf(startDay);
  if (idx === -1) return "";
  const seq = [];
  for (let i = 0; i < 4; i++) seq.push(DAY_OPTIONS[(idx + i) % 7].slice(0, 3));
  return seq.join(", ") + "...";
}
