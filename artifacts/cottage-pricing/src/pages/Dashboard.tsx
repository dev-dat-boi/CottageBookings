import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookingsTab } from "@/components/BookingsTab";
import { ControlPanelTab } from "@/components/ControlPanelTab";
import { CalendarTab } from "@/components/CalendarTab";
import { HistoryTab } from "@/components/HistoryTab";
import { RentalsTab } from "@/components/RentalsTab";
import { Trees, History, BookMarked } from "lucide-react";
import { useAdminLock } from "@/contexts/AdminLockContext";

export default function Dashboard() {
  const { isLockEnabled } = useAdminLock();

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col">
      <header className="border-b border-border/40 bg-card sticky top-0 z-20">
        <div className="container max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0">
            <Trees className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-bold text-foreground leading-tight">Cottage Pricing</h1>
            <p className="text-xs sm:text-sm text-muted-foreground font-medium">Dynamic Rate Manager</p>
          </div>
        </div>
      </header>

      <main className="flex-1 container max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-8">
        <Tabs defaultValue="bookings" className="w-full">
          <div className="mb-4 sm:mb-8 overflow-x-auto pb-1 -mx-2 px-2">
            <TabsList className="bg-card border border-border/40 p-1 h-auto inline-flex w-max min-w-full sm:min-w-0">
              <TabsTrigger value="bookings" className="px-3 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                Bookings
              </TabsTrigger>
              <TabsTrigger value="control-panel" className="px-3 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                Control Panel
              </TabsTrigger>
              <TabsTrigger value="calendar" className="px-3 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                Calendar
              </TabsTrigger>
              {isLockEnabled && (
                <>
                  <TabsTrigger value="rentals" className="px-3 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap flex items-center gap-1.5">
                    <BookMarked className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    Rentals
                  </TabsTrigger>
                  <TabsTrigger value="history" className="px-3 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap flex items-center gap-1.5">
                    <History className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    History
                  </TabsTrigger>
                </>
              )}
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
          <TabsContent value="rentals" className="mt-0 outline-none">
            <RentalsTab />
          </TabsContent>
          <TabsContent value="history" className="mt-0 outline-none">
            <HistoryTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
