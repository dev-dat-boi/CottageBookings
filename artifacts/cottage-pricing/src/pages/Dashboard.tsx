import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookingsTab } from "@/components/BookingsTab";
import { ControlPanelTab } from "@/components/ControlPanelTab";
import { CalendarTab } from "@/components/CalendarTab";
import { Trees } from "lucide-react";

export default function Dashboard() {
  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col">
      <header className="border-b border-border/40 bg-card">
        <div className="container max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <Trees className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Cottage Pricing</h1>
            <p className="text-sm text-muted-foreground font-medium">Dynamic Rate Manager</p>
          </div>
        </div>
      </header>

      <main className="flex-1 container max-w-7xl mx-auto px-4 py-8">
        <Tabs defaultValue="bookings" className="w-full">
          <div className="flex items-center justify-between mb-8">
            <TabsList className="bg-card border border-border/40 p-1 h-auto">
              <TabsTrigger value="bookings" className="px-6 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Bookings
              </TabsTrigger>
              <TabsTrigger value="control-panel" className="px-6 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Control Panel
              </TabsTrigger>
              <TabsTrigger value="calendar" className="px-6 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Calendar
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="bookings" className="mt-0 outline-none">
            <BookingsTab />
          </TabsContent>
          <TabsContent value="control-panel" className="mt-0 outline-none">
            <ControlPanelTab />
          </TabsContent>
          <TabsContent value="calendar" className="mt-0 outline-none">
            <CalendarTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
