import { useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
  getGetCalendarQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const seasonSchema = z.object({
  name: z.string().min(1, "Name required"),
  multiplier: z.coerce.number().min(0),
});

const holidaySchema = z.object({
  name: z.string().min(1, "Name required"),
  boost: z.coerce.number().min(0),
});

const settingsSchema = z.object({
  basePrice: z.coerce.number().min(0),
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
});

type FormValues = z.infer<typeof settingsSchema>;

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export function ControlPanelTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });

  const updateMutation = useUpdateSettings();

  const form = useForm<FormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      basePrice: 300,
      seasons: [],
      dayMultipliers: { Monday: 0.95, Tuesday: 0.95, Wednesday: 0.95, Thursday: 0.95, Friday: 1.1, Saturday: 1.25, Sunday: 1.05 },
      holidays: [],
    },
  });

  const {
    fields: seasonFields,
    append: appendSeason,
    remove: removeSeason,
  } = useFieldArray({ control: form.control, name: "seasons" });

  const {
    fields: holidayFields,
    append: appendHoliday,
    remove: removeHoliday,
  } = useFieldArray({ control: form.control, name: "holidays" });

  useEffect(() => {
    if (settings) {
      form.reset({
        basePrice: settings.basePrice,
        seasons: settings.seasons ?? [],
        dayMultipliers: settings.dayMultipliers,
        holidays: settings.holidays ?? [],
      });
    }
  }, [settings, form]);

  const onSubmit = (data: FormValues) => {
    updateMutation.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Settings saved", description: "Pricing rules updated successfully." });
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetCalendarQueryKey() });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
      },
    });
  };

  if (isLoading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="flex justify-between items-center bg-card p-4 rounded-xl border border-border/40 shadow-sm">
          <div>
            <h2 className="text-lg font-bold text-foreground">Pricing Controls</h2>
            <p className="text-sm text-muted-foreground">Adjust your base rates and multipliers.</p>
          </div>
          <Button type="submit" disabled={updateMutation.isPending} className="min-w-[120px]">
            {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Base Price */}
          <Card className="border-border/40 shadow-sm md:col-span-2">
            <CardHeader className="bg-muted/30 border-b border-border/40">
              <CardTitle>Base Configuration</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <FormField
                control={form.control}
                name="basePrice"
                render={({ field }) => (
                  <FormItem className="max-w-sm">
                    <FormLabel>Base Nightly Rate ($)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} className="text-lg font-medium" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Seasons */}
          <Card className="border-border/40 shadow-sm">
            <CardHeader className="bg-muted/30 border-b border-border/40 flex flex-row items-center justify-between">
              <div>
                <CardTitle>Seasons</CardTitle>
                <CardDescription>Name and rate multiplier per season</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendSeason({ name: "", multiplier: 1 })}
              >
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            </CardHeader>
            <CardContent className="p-6 space-y-3">
              {seasonFields.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No seasons defined. Add one above.</p>
              )}
              {seasonFields.map((field, index) => (
                <div key={field.id} className="flex gap-2 items-start">
                  <FormField
                    control={form.control}
                    name={`seasons.${index}.name`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        {index === 0 && <FormLabel className="text-xs text-muted-foreground">Name</FormLabel>}
                        <FormControl>
                          <Input placeholder="e.g. Winter" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`seasons.${index}.multiplier`}
                    render={({ field }) => (
                      <FormItem className="w-28">
                        {index === 0 && <FormLabel className="text-xs text-muted-foreground">Multiplier</FormLabel>}
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="1.00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className={index === 0 ? "mt-6" : ""}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSeason(index)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Day Multipliers */}
          <Card className="border-border/40 shadow-sm">
            <CardHeader className="bg-muted/30 border-b border-border/40">
              <CardTitle>Day of Week Multipliers</CardTitle>
              <CardDescription>Weekend premium or weekday discount</CardDescription>
            </CardHeader>
            <CardContent className="p-6 grid grid-cols-2 gap-4">
              {DAY_NAMES.map(day => (
                <FormField
                  key={day}
                  control={form.control}
                  name={`dayMultipliers.${day}`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{day}</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </CardContent>
          </Card>

          {/* Holidays */}
          <Card className="border-border/40 shadow-sm md:col-span-2">
            <CardHeader className="bg-muted/30 border-b border-border/40 flex flex-row items-center justify-between">
              <div>
                <CardTitle>Holidays</CardTitle>
                <CardDescription>Extra boost added on top of the base rate on holiday dates</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendHoliday({ name: "", boost: 0 })}
              >
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            </CardHeader>
            <CardContent className="p-6">
              {holidayFields.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No holidays defined. Add one above.</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {holidayFields.map((field, index) => (
                  <div key={field.id} className="flex gap-2 items-start">
                    <FormField
                      control={form.control}
                      name={`holidays.${index}.name`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          {index === 0 && <FormLabel className="text-xs text-muted-foreground">Holiday Name</FormLabel>}
                          <FormControl>
                            <Input placeholder="e.g. New Year" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`holidays.${index}.boost`}
                      render={({ field }) => (
                        <FormItem className="w-28">
                          {index === 0 && <FormLabel className="text-xs text-muted-foreground">Boost</FormLabel>}
                          <FormControl>
                            <Input type="number" step="0.01" placeholder="0.25" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className={index === 0 ? "mt-6" : ""}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeHoliday(index)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </Form>
  );
}
