import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookingsTab } from "@/components/BookingsTab";
import { ControlPanelTab } from "@/components/ControlPanelTab";
import { CalendarTab } from "@/components/CalendarTab";
import { HistoryTab } from "@/components/HistoryTab";
import { RentalsTab } from "@/components/RentalsTab";
import { HomeTab } from "@/components/HomeTab";
import { UsersTab } from "@/components/UsersTab";
import { EmailsTab } from "@/components/EmailsTab";
import { LoginDialog } from "@/components/LoginDialog";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { Trees, History, BookMarked, LogOut, LogIn, Users, Home, Shield, KeyRound, Wrench, Mail } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGetMyPendingConfirmations, getGetMyPendingConfirmationsQueryKey } from "@workspace/api-client-react";

export default function Dashboard() {
  const { isLoggedIn, isAdmin, isMod, user, logout } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const { data: pendingConfirmations } = useGetMyPendingConfirmations({
    query: { queryKey: getGetMyPendingConfirmationsQueryKey(), enabled: isLoggedIn },
  });
  const showRentalAlert = isLoggedIn && (
    (pendingConfirmations?.rentalIds.length ?? 0) > 0 ||
    (pendingConfirmations?.urgentRentalIds.length ?? 0) > 0
  );

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col">
      <header className="border-b border-border/40 bg-card sticky top-0 z-20">
        <div className="container max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0">
              <Trees className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold text-foreground leading-tight">Cottage Pricing</h1>
              <p className="text-xs sm:text-sm text-muted-foreground font-medium">Dynamic Rate Manager</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isLoggedIn ? (
              <>
                <div className="hidden sm:flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{user?.name || user?.email}</span>
                  {isAdmin && <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs hover:bg-purple-100"><Shield className="w-2.5 h-2.5 mr-1" />Admin</Badge>}
                  {isMod && <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs hover:bg-orange-100"><Wrench className="w-2.5 h-2.5 mr-1" />Mod</Badge>}
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowChangePassword(true)} className="hidden sm:flex" title="Change password">
                  <KeyRound className="w-3.5 h-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Password</span>
                </Button>
                <Button variant="outline" size="sm" onClick={logout}>
                  <LogOut className="w-3.5 h-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Sign Out</span>
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => setShowLogin(true)}>
                <LogIn className="w-3.5 h-3.5 mr-1.5" /> Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 container max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-8">
        <Tabs defaultValue="home" className="w-full">
          <div className="mb-4 sm:mb-8 overflow-x-auto pb-1 -mx-2 px-2">
            <TabsList className="bg-card border border-border/40 p-1 h-auto inline-flex w-max min-w-full sm:min-w-0">
              <TabsTrigger value="home" className="px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap flex items-center gap-1.5">
                <Home className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span className="hidden xs:inline">Home</span>
              </TabsTrigger>
              <TabsTrigger value="bookings" className="px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                Bookings
              </TabsTrigger>
              {isLoggedIn && (
                <>
                  <TabsTrigger value="control-panel" className="px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                    Control Panel
                  </TabsTrigger>
                  <TabsTrigger value="calendar" className="px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                    Calendar
                  </TabsTrigger>
                  <TabsTrigger value="rentals" className="px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap flex items-center gap-1.5 relative">
                    <BookMarked className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    Rentals
                    {showRentalAlert && (
                      <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="history" className="px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap flex items-center gap-1.5">
                    <History className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    History
                  </TabsTrigger>
                  {isAdmin && (
                    <>
                      <TabsTrigger value="users" className="px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap flex items-center gap-1.5">
                        <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        Users
                      </TabsTrigger>
                      <TabsTrigger value="emails" className="px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap flex items-center gap-1.5">
                        <Mail className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        Emails
                      </TabsTrigger>
                    </>
                  )}
                </>
              )}
            </TabsList>
          </div>

          <TabsContent value="home" className="mt-0 outline-none"><HomeTab /></TabsContent>
          <TabsContent value="bookings" className="mt-0 outline-none"><BookingsTab /></TabsContent>
          <TabsContent value="control-panel" className="mt-0 outline-none"><ControlPanelTab /></TabsContent>
          <TabsContent value="calendar" className="mt-0 outline-none"><CalendarTab /></TabsContent>
          <TabsContent value="rentals" className="mt-0 outline-none"><RentalsTab /></TabsContent>
          <TabsContent value="history" className="mt-0 outline-none"><HistoryTab /></TabsContent>
          {isAdmin && <TabsContent value="users" className="mt-0 outline-none"><UsersTab /></TabsContent>}
          {isAdmin && <TabsContent value="emails" className="mt-0 outline-none"><EmailsTab /></TabsContent>}
        </Tabs>
      </main>

      <LoginDialog open={showLogin} onClose={() => setShowLogin(false)} />
      <ChangePasswordDialog open={showChangePassword} onClose={() => setShowChangePassword(false)} />
    </div>
  );
}
