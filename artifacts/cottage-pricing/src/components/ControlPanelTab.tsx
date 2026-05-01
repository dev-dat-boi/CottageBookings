import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetSettings, 
  useUpdateSettings, 
  getGetSettingsQueryKey,
  getGetCalendarQueryKey 
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Settings } from "@workspace/api-client-react/src/generated/api.schemas";

const settingsSchema = z.object({
  basePrice: z.coerce.number().min(0),
  seasonMultipliers: z.object({
    Winter: z.coerce.number(),
    Low: z.coerce.number(),
    Spring: z.coerce.number(),
    Summer: z.coerce.number(),
    Fall: z.coerce.number(),
  }),
  dayMultipliers: z.object({
    Monday: z.coerce.number(),
    Tuesday: z.coerce.number(),
    Wednesday: z.coerce.number(),
    Thursday: z.coerce.number(),
    Friday: z.coerce.number(),
    Saturday: z.coerce.number(),
    Sunday: z.coerce.number(),
  }),
  holidayBoosts: z.object({
    "New Year": z.coerce.number(),
    "St-Jean": z.coerce.number(),
    "Canada Day": z.coerce.number(),
    "Construction Holiday": z.coerce.number(),
    "Labor Day": z.coerce.number(),
    Thanksgiving: z.coerce.number(),
    Christmas: z.coerce.number(),
  }),
});

export function ControlPanelTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings({ 
    query: { queryKey: getGetSettingsQueryKey() } 
  });
  
  const updateMutation = useUpdateSettings();

  const form = useForm<Settings>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      basePrice: 0,
      seasonMultipliers: { Winter: 1, Low: 1, Spring: 1, Summer: 1, Fall: 1 },
      dayMultipliers: { Monday: 1, Tuesday: 1, Wednesday: 1, Thursday: 1, Friday: 1, Saturday: 1, Sunday: 1 },
      holidayBoosts: { "New Year": 1, "St-Jean": 1, "Canada Day": 1, "Construction Holiday": 1, "Labor Day": 1, Thanksgiving: 1, Christmas: 1 },
    }
  });

  useEffect(() => {
    if (settings) {
      form.reset(settings);
    }
  }, [settings, form]);

  const onSubmit = (data: Settings) => {
    updateMutation.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Settings saved", description: "Pricing rules have been updated successfully." });
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetCalendarQueryKey() });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
      }
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

          <Card className="border-border/40 shadow-sm">
            <CardHeader className="bg-muted/30 border-b border-border/40">
              <CardTitle>Season Multipliers</CardTitle>
              <CardDescription>e.g. 1.2 = 20% increase</CardDescription>
            </CardHeader>
            <CardContent className="p-6 grid grid-cols-2 gap-4">
              {(["Winter", "Low", "Spring", "Summer", "Fall"] as const).map(season => (
                <FormField
                  key={season}
                  control={form.control}
                  name={`seasonMultipliers.${season}`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{season}</FormLabel>
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

          <Card className="border-border/40 shadow-sm">
            <CardHeader className="bg-muted/30 border-b border-border/40">
              <CardTitle>Day of Week Multipliers</CardTitle>
              <CardDescription>Weekend premium or weekday discount</CardDescription>
            </CardHeader>
            <CardContent className="p-6 grid grid-cols-2 gap-4">
              {(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const).map(day => (
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

          <Card className="border-border/40 shadow-sm md:col-span-2">
            <CardHeader className="bg-muted/30 border-b border-border/40">
              <CardTitle>Holiday Boosts</CardTitle>
              <CardDescription>Extra multiplier applied on specific holidays</CardDescription>
            </CardHeader>
            <CardContent className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              {(["New Year", "St-Jean", "Canada Day", "Construction Holiday", "Labor Day", "Thanksgiving", "Christmas"] as const).map(holiday => (
                <FormField
                  key={holiday}
                  control={form.control}
                  name={`holidayBoosts.${holiday}`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{holiday}</FormLabel>
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
        </div>
      </form>
    </Form>
  );
}
