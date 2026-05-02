import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
  getGetCalendarQueryKey,
} from "@workspace/api-client-react";
import type { Holiday } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Save, Plus, Trash2, Lock, LockOpen, Shield, Eye, EyeOff, CalendarDays } from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAdminLock } from "@/contexts/AdminLockContext";

const MD_REGEX = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const holidaySchema = z.object({
  name: z.string().min(1, "Name required"),
  boost: z.coerce.number().min(0),
  startDate: z.string().refine(v => !v || MD_REGEX.test(v), { message: "Use MM-DD" }).nullable().optional(),
  endDate: z.string().refine(v => !v || MD_REGEX.test(v), { message: "Use MM-DD" }).nullable().optional(),
});

const seasonSchema = z.object({
  name: z.string().min(1, "Name required"),
  multiplier: z.coerce.number().min(0),
  startDate: z.string().refine(v => !v || MD_REGEX.test(v), { message: "Use MM-DD" }).nullable().optional(),
  endDate: z.string().refine(v => !v || MD_REGEX.test(v), { message: "Use MM-DD" }).nullable().optional(),
});

const ownerSchema = z.object({
  name: z.string().min(1, "Name required"),
  email: z.string().email("Valid email required"),
});

const settingsSchema = z.object({
  basePrice: z.coerce.number().min(0),
  familyRate: z.coerce.number().min(0),
  seasons: z.array(seasonSchema),
  dayMultipliers: z.object({
    Monday: z.coerce.number(),
    Tuesday: z.coerce.number(),
    Wednesday: z.coerce.number(),
    Thursday: z.coerce.number(),
    Friday: z.coerce.number(),
    Saturday: z.coerce.number(),
    Sunday: z.coerce.number(),
  }),
  holidays: z.array(holidaySchema),
  holidaysByYear: z.record(z.string(), z.array(holidaySchema)),
  owners: z.array(ownerSchema),
});

type FormValues = z.infer<typeof settingsSchema>;

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

function DateRangeInputs({ prefix, control, index, disabled }: { prefix: string; control: any; index: number; disabled?: boolean }) {
  return (
    <div className="flex gap-1.5 mt-1">
      <FormField control={control} name={`${prefix}.${index}.startDate`}
        render={({ field }) => (
          <FormItem className="flex-1 min-w-0">
            <FormLabel className="text-xs text-muted-foreground">From (MM-DD)</FormLabel>
            <FormControl>
              <Input placeholder="06-01" maxLength={5} disabled={disabled} {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value || null)} className="text-xs h-8" />
            </FormControl>
            <FormMessage className="text-xs" />
          </FormItem>
        )}
      />
      <FormField control={control} name={`${prefix}.${index}.endDate`}
        render={({ field }) => (
          <FormItem className="flex-1 min-w-0">
            <FormLabel className="text-xs text-muted-foreground">To (MM-DD)</FormLabel>
            <FormControl>
              <Input placeholder="08-31" maxLength={5} disabled={disabled} {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value || null)} className="text-xs h-8" />
            </FormControl>
            <FormMessage className="text-xs" />
          </FormItem>
        )}
      />
    </div>
  );
}

// ─── Holiday editor (used for both default and per-year) ──────────────────────
function HolidayEditor({ control, prefix, disabled, append, remove, fields }: {
  control: any; prefix: string; disabled?: boolean;
  append: (val: Holiday) => void; remove: (i: number) => void; fields: any[];
}) {
  return (
    <div className="space-y-3">
      {fields.length === 0 && <p className="text-sm text-muted-foreground italic py-2">No holidays. Click Add to create one.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map((field, index) => (
          <div key={field.id} className="border border-border/30 rounded-lg p-3 bg-muted/10 space-y-2">
            <div className="flex gap-2 items-start">
              <FormField control={control} name={`${prefix}.${index}.name`}
                render={({ field }) => (<FormItem className="flex-1 min-w-0"><FormLabel className="text-xs text-muted-foreground">Name</FormLabel><FormControl><Input placeholder="e.g. Christmas" disabled={disabled} {...field} /></FormControl><FormMessage /></FormItem>)}
              />
              <FormField control={control} name={`${prefix}.${index}.boost`}
                render={({ field }) => (<FormItem className="w-20 shrink-0"><FormLabel className="text-xs text-muted-foreground">Boost</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0.25" disabled={disabled} {...field} /></FormControl><FormMessage /></FormItem>)}
              />
              <div className="mt-5 shrink-0">
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={disabled} className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <DateRangeInputs prefix={prefix} control={control} index={index} disabled={disabled} />
          </div>
        ))}
      </div>
      {!disabled && (
        <Button type="button" variant="outline" size="sm" onClick={() => append({ name: "", boost: 0, startDate: null, endDate: null })}>
          <Plus className="w-4 h-4 mr-1" /> Add Holiday
        </Button>
      )}
    </div>
  );
}

// ─── Per-year holidays section ────────────────────────────────────────────────
function HolidaysByYearSection({ control, form, disabled, defaultHolidays }: {
  control: any; form: any; disabled?: boolean; defaultHolidays: Holiday[];
}) {
  const currentYear = new Date().getFullYear();
  const holidaysByYear: Record<string, Holiday[]> = form.watch("holidaysByYear") ?? {};
  const [showAddYear, setShowAddYear] = useState(false);
  const [newYear, setNewYear] = useState(String(currentYear));

  function addYear() {
    if (!newYear || holidaysByYear[newYear]) return;
    const updated = { ...holidaysByYear, [newYear]: defaultHolidays.map(h => ({ ...h })) };
    form.setValue("holidaysByYear", updated, { shouldDirty: true });
    setShowAddYear(false);
  }

  function removeYear(yr: string) {
    const updated = { ...holidaysByYear };
    delete updated[yr];
    form.setValue("holidaysByYear", updated, { shouldDirty: true });
  }

  const allYears = Object.keys(holidaysByYear).sort();

  return (
    <Card className="border-border/40 shadow-sm md:col-span-2">
      <CardHeader className="bg-muted/30 border-b border-border/40">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4" /> Holidays
            </CardTitle>
            <CardDescription className="mt-0.5">
              Holidays are applied per year — only to dates within that calendar year.
            </CardDescription>
          </div>
          {!disabled && (
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAddYear(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add Year
            </Button>
          )}
        </div>
      </CardHeader>

      {allYears.length === 0 ? (
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          No holidays configured. Click "Add Year" to add holidays for a specific year.
        </CardContent>
      ) : (
        <CardContent className="p-0 divide-y divide-border/40">
          {allYears.map(yr => (
            <div key={yr} className="p-4 sm:p-6 space-y-4">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary" />
                <span className="font-semibold text-foreground">{yr}</span>
              </div>
              <YearHolidayEditor
                yearKey={yr}
                control={control}
                form={form}
                disabled={disabled}
              />
              {!disabled && (
                <div className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeYear(yr)}
                    className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Erase {yr}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      )}

      {/* Add Year dialog */}
      <Dialog open={showAddYear} onOpenChange={setShowAddYear}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Year</DialogTitle>
            <DialogDescription>
              Holidays will be pre-filled from your existing list. Edit them for that year's specific dates.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              type="number"
              value={newYear}
              onChange={e => setNewYear(e.target.value)}
              placeholder="e.g. 2027"
              min={2020}
              max={2040}
              onKeyDown={e => e.key === "Enter" && addYear()}
              autoFocus
            />
            {newYear && holidaysByYear[newYear] && (
              <p className="text-xs text-destructive mt-1">Year {newYear} already exists.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddYear(false)}>Cancel</Button>
            <Button onClick={addYear} disabled={!newYear || !!holidaysByYear[newYear]}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function YearHolidayEditor({ yearKey, control, form, disabled }: { yearKey: string; control: any; form: any; disabled?: boolean }) {
  const { fields, append, remove } = useFieldArray({ control, name: `holidaysByYear.${yearKey}` });
  return (
    <HolidayEditor
      control={control}
      prefix={`holidaysByYear.${yearKey}`}
      disabled={disabled}
      append={append}
      remove={remove}
      fields={fields}
    />
  );
}

// ─── Admin Lock Section ───────────────────────────────────────────────────────
type LockModalMode = "set-password" | "unlock" | "remove-lock" | "lock-confirm" | null;

function AdminLockSection() {
  const { isLockEnabled, isLocked, enableLock, lock, unlock, disableLock } = useAdminLock();
  const { toast } = useToast();
  const [modalMode, setModalMode] = useState<LockModalMode>(null);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  function closeModal() { setModalMode(null); setPassword(""); setError(""); setShowPw(false); }

  async function handleSubmit() {
    if (!password) { setError("Password is required."); return; }
    if (modalMode === "set-password") {
      await enableLock(password);
      toast({ title: "Admin lock enabled", description: "Click 'Lock Now' to restrict access." });
      closeModal();
    } else if (modalMode === "unlock") {
      const ok = await unlock(password);
      if (ok) { toast({ title: "Unlocked" }); closeModal(); } else setError("Incorrect password.");
    } else if (modalMode === "remove-lock") {
      const ok = await disableLock(password);
      if (ok) { toast({ title: "Admin lock removed" }); closeModal(); } else setError("Incorrect password.");
    }
  }

  return (
    <>
      <Card className={`border-2 shadow-sm ${isLocked ? "border-red-300 bg-red-50/40 dark:border-red-800 dark:bg-red-950/10" : isLockEnabled ? "border-green-300 bg-green-50/40 dark:border-green-800 dark:bg-green-950/10" : "border-border/40"}`}>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Shield className="w-4 h-4" />
            Admin Lock
            {isLocked && <span className="text-xs font-normal text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-full px-2 py-0.5">LOCKED — Read-only</span>}
            {isLockEnabled && !isLocked && <span className="text-xs font-normal text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-full px-2 py-0.5">Unlocked</span>}
          </CardTitle>
          <CardDescription>
            {isLocked ? "Enter the password to restore edit access." : isLockEnabled ? "Lock the UI to prevent guests from making changes." : "Enable a password lock to make the UI read-only for guests."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          {!isLockEnabled && <Button variant="outline" size="sm" onClick={() => setModalMode("set-password")}><Lock className="w-4 h-4 mr-2" /> Set Password & Enable Lock</Button>}
          {isLockEnabled && !isLocked && (<><Button size="sm" onClick={() => setModalMode("lock-confirm")}><Lock className="w-4 h-4 mr-2" /> Lock Now</Button><Button variant="outline" size="sm" onClick={() => setModalMode("remove-lock")}>Remove Lock</Button></>)}
          {isLocked && <Button size="sm" variant="outline" onClick={() => setModalMode("unlock")}><LockOpen className="w-4 h-4 mr-2" /> Unlock</Button>}
        </CardContent>
      </Card>

      <Dialog open={modalMode === "lock-confirm"} onOpenChange={closeModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Lock className="w-5 h-5" /> Lock the UI?</DialogTitle><DialogDescription>All controls become read-only. Enter your password to unlock later.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={closeModal}>Cancel</Button><Button onClick={() => { lock(); closeModal(); }}>Lock Now</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!modalMode && modalMode !== "lock-confirm"} onOpenChange={closeModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {modalMode === "set-password" ? <><Lock className="w-5 h-5" /> Set Admin Password</> : <><LockOpen className="w-5 h-5" /> {modalMode === "unlock" ? "Unlock" : "Remove Lock"}</>}
            </DialogTitle>
            <DialogDescription>
              {modalMode === "set-password" ? "Choose a password to protect the pricing settings." : modalMode === "unlock" ? "Enter your admin password to restore edit access." : "Enter your password to remove the lock entirely."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <div className="relative">
              <Input type={showPw ? "text" : "password"} placeholder="Password" value={password} onChange={e => { setPassword(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && handleSubmit()} autoFocus />
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-2 top-2 text-muted-foreground">{showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={handleSubmit}>{modalMode === "set-password" ? "Enable Lock" : modalMode === "unlock" ? "Unlock" : "Remove"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function ControlPanelTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isLocked } = useAdminLock();
  const { data: settings, isLoading } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const updateMutation = useUpdateSettings();

  const form = useForm<FormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      basePrice: 300, familyRate: 200, seasons: [], holidays: [], holidaysByYear: {}, owners: [],
      dayMultipliers: { Monday: 0.95, Tuesday: 0.95, Wednesday: 0.95, Thursday: 0.95, Friday: 1.1, Saturday: 1.25, Sunday: 1.05 },
    },
  });

  const { fields: seasonFields, append: appendSeason, remove: removeSeason } = useFieldArray({ control: form.control, name: "seasons" });
  const { fields: holidayFields, append: appendHoliday, remove: removeHoliday } = useFieldArray({ control: form.control, name: "holidays" });

  useEffect(() => {
    if (settings) {
      const defaultHols = settings.holidays ?? [];
      const byYear = (settings.holidaysByYear as Record<string, any>) ?? {};
      const initialByYear = Object.keys(byYear).length === 0
        ? { "2026": defaultHols.map((h: any) => ({ ...h })) }
        : byYear;
      form.reset({
        basePrice: settings.basePrice,
        familyRate: settings.familyRate,
        seasons: settings.seasons ?? [],
        dayMultipliers: settings.dayMultipliers,
        holidays: defaultHols,
        holidaysByYear: initialByYear,
        owners: (settings as any).owners ?? [],
      });
    }
  }, [settings, form]);

  const { fields: ownerFields, append: appendOwner, remove: removeOwner } = useFieldArray({ control: form.control, name: "owners" });

  const onSubmit = (data: FormValues) => {
    updateMutation.mutate({ data: { ...data, owners: data.owners ?? [] } as any }, {
      onSuccess: () => {
        toast({ title: "Settings saved", description: "Pricing rules updated successfully." });
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetCalendarQueryKey() });
      },
      onError: () => toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" }),
    });
  };

  if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;

  const defaultHolidays: Holiday[] = form.watch("holidays") ?? [];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

        {/* Admin Lock */}
        <AdminLockSection />

        {/* Save bar */}
        <div className="flex flex-wrap justify-between items-center bg-card p-4 rounded-xl border border-border/40 shadow-sm gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-foreground">Pricing Controls</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">Adjust base rates and multipliers.</p>
          </div>
          <Button type="submit" disabled={updateMutation.isPending || isLocked} className="min-w-[120px]">
            {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </Button>
        </div>

        <fieldset disabled={isLocked} className="space-y-6 disabled:opacity-60 disabled:pointer-events-none">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Base Configuration */}
            <Card className="border-border/40 shadow-sm md:col-span-2">
              <CardHeader className="bg-muted/30 border-b border-border/40"><CardTitle>Base Configuration</CardTitle></CardHeader>
              <CardContent className="p-4 sm:p-6 flex flex-wrap gap-6">
                <FormField control={form.control} name="basePrice"
                  render={({ field }) => (<FormItem className="w-40 sm:w-48"><FormLabel>Standard Rate ($/night)</FormLabel><FormControl><Input type="number" step="0.01" {...field} className="text-lg font-medium" /></FormControl><FormMessage /></FormItem>)}
                />
                <FormField control={form.control} name="familyRate"
                  render={({ field }) => (<FormItem className="w-40 sm:w-48"><FormLabel>Family Rate ($/night)</FormLabel><FormControl><Input type="number" step="0.01" {...field} className="text-lg font-medium" /></FormControl><FormMessage /></FormItem>)}
                />
              </CardContent>
            </Card>

            {/* Seasons */}
            <Card className="border-border/40 shadow-sm">
              <CardHeader className="bg-muted/30 border-b border-border/40">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><CardTitle>Seasons</CardTitle><CardDescription className="text-xs mt-0.5">Name, multiplier, optional date range (MM-DD)</CardDescription></div>
                  <Button type="button" variant="outline" size="sm" onClick={() => appendSeason({ name: "", multiplier: 1, startDate: null, endDate: null })}><Plus className="w-4 h-4 mr-1" /> Add</Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 space-y-3">
                {seasonFields.length === 0 && <p className="text-sm text-muted-foreground italic">No seasons. Add one above.</p>}
                {seasonFields.map((field, index) => (
                  <div key={field.id} className="border border-border/30 rounded-lg p-3 bg-muted/10 space-y-2">
                    <div className="flex gap-2 items-start">
                      <FormField control={form.control} name={`seasons.${index}.name`}
                        render={({ field }) => (<FormItem className="flex-1 min-w-0"><FormLabel className="text-xs text-muted-foreground">Name</FormLabel><FormControl><Input placeholder="e.g. Winter" {...field} /></FormControl><FormMessage /></FormItem>)}
                      />
                      <FormField control={form.control} name={`seasons.${index}.multiplier`}
                        render={({ field }) => (<FormItem className="w-24 shrink-0"><FormLabel className="text-xs text-muted-foreground">Multiplier</FormLabel><FormControl><Input type="number" step="0.01" placeholder="1.00" {...field} /></FormControl><FormMessage /></FormItem>)}
                      />
                      <div className="mt-5 shrink-0">
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeSeason(index)} className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>
                    <DateRangeInputs prefix="seasons" control={form.control} index={index} />
                    <p className="text-xs text-muted-foreground">Leave blank to use the built-in seasonal algorithm.</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Day Multipliers */}
            <Card className="border-border/40 shadow-sm">
              <CardHeader className="bg-muted/30 border-b border-border/40"><CardTitle>Day of Week Multipliers</CardTitle><CardDescription>Weekend premium or weekday discount</CardDescription></CardHeader>
              <CardContent className="p-4 sm:p-6 grid grid-cols-2 gap-3">
                {DAY_NAMES.map(day => (
                  <FormField key={day} control={form.control} name={`dayMultipliers.${day}`}
                    render={({ field }) => (<FormItem><FormLabel className="text-sm">{day}</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)}
                  />
                ))}
              </CardContent>
            </Card>

            {/* Owners */}
            <Card className="border-border/40 shadow-sm md:col-span-2">
              <CardHeader className="bg-muted/30 border-b border-border/40">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle>Owners</CardTitle>
                    <CardDescription className="text-xs mt-0.5">Owners receive email notifications when rentals are booked or confirmed.</CardDescription>
                  </div>
                  {!isLocked && (
                    <Button type="button" variant="outline" size="sm" onClick={() => appendOwner({ name: "", email: "" })}>
                      <Plus className="w-4 h-4 mr-1" /> Add Owner
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 space-y-3">
                {ownerFields.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">No owners configured. Add one to receive rental notifications.</p>
                )}
                {ownerFields.map((field, index) => (
                  <div key={field.id} className="flex gap-2 items-start border border-border/30 rounded-lg p-3 bg-muted/10">
                    <FormField control={form.control} name={`owners.${index}.name`}
                      render={({ field }) => (
                        <FormItem className="flex-1 min-w-0">
                          <FormLabel className="text-xs text-muted-foreground">Name</FormLabel>
                          <FormControl><Input placeholder="Owner name" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField control={form.control} name={`owners.${index}.email`}
                      render={({ field }) => (
                        <FormItem className="flex-1 min-w-0">
                          <FormLabel className="text-xs text-muted-foreground">Email</FormLabel>
                          <FormControl><Input type="email" placeholder="owner@example.com" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="mt-5 shrink-0">
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeOwner(index)} disabled={isLocked} className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Holidays (by year) */}
            <HolidaysByYearSection
              control={form.control}
              form={form}
              disabled={isLocked}
              defaultHolidays={defaultHolidays}
            />

          </div>
        </fieldset>
      </form>
    </Form>
  );
}
