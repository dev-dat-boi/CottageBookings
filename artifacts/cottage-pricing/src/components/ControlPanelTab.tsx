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
import { Loader2, Save, Plus, Trash2, CalendarDays, Lock } from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/contexts/AuthContext";

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

const settingsSchema = z.object({
  basePrice: z.coerce.number().min(0),
  familyRate: z.coerce.number().min(0),
  familyRateCode: z.string().optional().default(""),
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

function AdminOnlyBanner() {
  return (
    <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/10 shadow-sm">
      <CardContent className="py-5 flex items-center gap-3">
        <Lock className="w-5 h-5 text-amber-500 shrink-0" />
        <div>
          <p className="font-semibold text-foreground text-sm">Read-Only View</p>
          <p className="text-xs text-muted-foreground mt-0.5">You can view these settings but only admins can make changes.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ModBanner() {
  return (
    <Card className="border-orange-200 bg-orange-50/50 dark:border-orange-800 dark:bg-orange-950/10 shadow-sm">
      <CardContent className="py-5 flex items-center gap-3">
        <Lock className="w-5 h-5 text-orange-400 shrink-0" />
        <div>
          <p className="font-semibold text-foreground text-sm">Moderator Access</p>
          <p className="text-xs text-muted-foreground mt-0.5">You can edit day multipliers and holidays. Base rates and seasons are admin-only.</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function ControlPanelTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin, isMod } = useAuth();
  const adminLocked = !isAdmin;
  const modLocked = !isAdmin && !isMod;
  const canSave = isAdmin || isMod;
  const { data: settings, isLoading } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const updateMutation = useUpdateSettings();

  const form = useForm<FormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      basePrice: 300, familyRate: 200, seasons: [], holidays: [], holidaysByYear: {},
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
        familyRateCode: (settings as any).familyRateCode ?? "",
        seasons: settings.seasons ?? [],
        dayMultipliers: settings.dayMultipliers,
        holidays: defaultHols,
        holidaysByYear: initialByYear,
      });
    }
  }, [settings, form]);

  const onSubmit = (data: FormValues) => {
    updateMutation.mutate({ data: { ...data, familyRateCode: data.familyRateCode ?? "" } as any }, {
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

        {/* Banners */}
        {!isAdmin && !isMod && <AdminOnlyBanner />}
        {isMod && <ModBanner />}

        {/* Save bar */}
        <div className="flex flex-wrap justify-between items-center bg-card p-4 rounded-xl border border-border/40 shadow-sm gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-foreground">Pricing Controls</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">Adjust base rates and multipliers.</p>
          </div>
          <Button type="submit" disabled={updateMutation.isPending || !canSave} className="min-w-[120px]">
            {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </Button>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Base Configuration — admin only */}
            <fieldset disabled={adminLocked} className="contents disabled:opacity-60 disabled:pointer-events-none">
              <Card className="border-border/40 shadow-sm md:col-span-2">
                <CardHeader className="bg-muted/30 border-b border-border/40"><CardTitle>Base Configuration</CardTitle></CardHeader>
                <CardContent className="p-4 sm:p-6 flex flex-wrap gap-6">
                  <FormField control={form.control} name="basePrice"
                    render={({ field }) => (<FormItem className="w-40 sm:w-48"><FormLabel>Standard Rate ($/night)</FormLabel><FormControl><Input type="number" step="0.01" {...field} className="text-lg font-medium" /></FormControl><FormMessage /></FormItem>)}
                  />
                  <FormField control={form.control} name="familyRate"
                    render={({ field }) => (<FormItem className="w-40 sm:w-48"><FormLabel>Family Rate ($/night)</FormLabel><FormControl><Input type="number" step="0.01" {...field} className="text-lg font-medium" /></FormControl><FormMessage /></FormItem>)}
                  />
                  <FormField control={form.control} name="familyRateCode"
                    render={({ field }) => (
                      <FormItem className="w-48 sm:w-56">
                        <FormLabel>Family Rate Access Code</FormLabel>
                        <FormControl>
                          <Input placeholder="Leave blank for no code" {...field} value={field.value ?? ""} className="font-mono" />
                        </FormControl>
                        <p className="text-xs text-muted-foreground mt-1">Guests must enter this code to book at the family rate. Logged-in owners skip it.</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Seasons — admin only */}
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
            </fieldset>

            {/* Day Multipliers — admin + mod */}
            <fieldset disabled={modLocked} className="contents disabled:opacity-60 disabled:pointer-events-none">
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

              {/* Holidays (by year) — admin + mod */}
              <HolidaysByYearSection
                control={form.control}
                form={form}
                disabled={modLocked}
                defaultHolidays={defaultHolidays}
              />
            </fieldset>

          </div>
        </div>
      </form>
    </Form>
  );
}
