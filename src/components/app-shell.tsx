import { Link, useRouterState, useNavigate, Navigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard, Users, CreditCard, Wallet, BookOpen, BookText,
  Receipt, ArrowRight, HandCoins, FileBarChart, Plus, Building2,
  Settings as SettingsIcon, UserCog, LogOut, Landmark, FileSignature,
  ScrollText, Truck, Briefcase, Upload, Menu,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { OnboardingWizard } from "@/components/onboarding";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { InstallPrompt } from "@/components/install-prompt";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/students", label: "Students", icon: Users },
  { to: "/fees", label: "Fee collection", icon: CreditCard },
  { to: "/funds", label: "Fund accounts", icon: Wallet },
  { to: "/ledger", label: "General ledger", icon: BookOpen },
  { to: "/cashbook", label: "Cashbook", icon: BookText },
  { to: "/bank-rec", label: "Bank reconciliation", icon: Landmark },
  { to: "/receipting", label: "Receipting", icon: Receipt },
  { to: "/vouchers", label: "Payment vouchers", icon: FileSignature },
  { to: "/suppliers", label: "Suppliers", icon: Truck },
  { to: "/staff", label: "Staff", icon: Briefcase },
  { to: "/payroll", label: "Payroll", icon: HandCoins },
  { to: "/promotion", label: "Promotion", icon: ArrowRight },
  { to: "/bursary", label: "Bursaries · capitation", icon: HandCoins },
  { to: "/ipsas", label: "IPSAS reports", icon: ScrollText },
  { to: "/reports", label: "Statutory reports", icon: FileBarChart },
  { to: "/import", label: "Bulk import", icon: Upload },
] as const;

const quickActions = [
  { to: "/students", label: "Add student" },
  { to: "/fees", label: "New invoice" },
  { to: "/receipting", label: "Record payment" },
  { to: "/reports", label: "Generate report" },
] as const;

const settingsItems = [
  { to: "/settings", label: "School setup", icon: Building2 },
  { to: "/settings", label: "Fee configuration", icon: SettingsIcon },
  { to: "/settings", label: "Users & roles", icon: UserCog },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { loading, user, school, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="text-[12.5px] text-ink-soft">Loading…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!school) return <OnboardingWizard />;

  return <Shell pathname={pathname} school={school} profile={profile} signOut={async () => { await signOut(); navigate({ to: "/auth", replace: true }); }}>{children}</Shell>;
}

function Shell({ pathname, school, profile, signOut, children }: any) {
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = (profile?.full_name || profile?.email || "?")
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]?.toUpperCase()).join("");

  const { data: activeTerm } = useQuery({
    queryKey: ["active-term", school.id],
    queryFn: async () => {
      const { data } = await supabase.from("terms").select("year, term").eq("school_id", school.id).eq("is_active", true).maybeSingle();
      return data;
    },
  });

  const navigation = (
      <div className="flex min-h-full flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-3 px-6 pt-7 pb-5">
          <div className="sf-seal flex h-9 w-9 flex-none items-center justify-center">
            <span className="font-serif text-sm font-semibold text-brass">ET</span>
          </div>
          <div>
            <h1 className="text-[19px] text-white">EduTech</h1>
            <p className="mt-0.5 text-[10.5px] uppercase tracking-[0.09em] text-[#7E8E85]">Treasury for schools</p>
          </div>
        </div>

        <nav className="mt-1.5 flex flex-col gap-px px-3.5">
          {navItems.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to} onClick={() => setMenuOpen(false)} aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[13.6px] transition-colors ${active ? "bg-[rgba(184,146,79,0.13)] text-white" : "text-[#B7C1B9] hover:bg-white/5 hover:text-[#EDF1EC]"}`}>
                {active && <span className="absolute -left-3.5 top-2 bottom-2 w-[3px] rounded-r bg-brass" />}
                <Icon className="h-[17px] w-[17px] flex-none opacity-85" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pt-4 pb-1.5 text-[10px] uppercase tracking-[0.1em] text-[#6E7E73]">Quick actions</div>
        <nav className="flex flex-col gap-px px-3.5">
          {quickActions.map((item) => (
            <Link key={item.label} to={item.to} onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-[12.8px] text-[#B7C1B9] hover:bg-white/5 hover:text-[#EDF1EC]">
              <Plus className="h-3.5 w-3.5 flex-none opacity-85" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="px-3 pt-4 pb-1.5 text-[10px] uppercase tracking-[0.1em] text-[#6E7E73]">Settings</div>
        <nav className="flex flex-col gap-px px-3.5">
          {settingsItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.label} to={item.to} onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-[13.6px] text-[#B7C1B9] hover:bg-white/5 hover:text-[#EDF1EC]">
                <Icon className="h-[17px] w-[17px] flex-none opacity-85" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-white/10 px-6 pt-4 pb-5 text-[11.5px] text-[#74847B]">
          {school.name}
          {school.code && <><br />Registration {school.code}</>}
          <div className="mt-1.5 flex items-center gap-1.5 text-[#9CB0A2]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#5FAE8A]" />
            IPSAS cash basis · audit log active
          </div>
        </div>
      </div>
  );

  return (
    <div className="sf-app-shell grid min-h-dvh grid-cols-[minmax(0,1fr)] bg-paper lg:grid-cols-[236px_minmax(0,1fr)]">
      <aside className="sf-no-print hidden bg-sidebar lg:block">{navigation}</aside>

      <main className="min-w-0">
        <header className="sf-no-print grid min-h-[68px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-line bg-surface px-3 py-2 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open navigation" className="h-11 w-11 shrink-0 lg:hidden"><Menu /></Button>
              </SheetTrigger>
              <SheetContent side="left" className="sf-mobile-nav w-[min(320px,88vw)] overflow-y-auto border-sidebar-border bg-sidebar p-0 text-sidebar-foreground" aria-describedby={undefined}>
                <SheetTitle className="sr-only">EduTech navigation</SheetTitle>
                {navigation}
              </SheetContent>
            </Sheet>
            <div className="min-w-0">
            <div className="truncate font-serif text-sm sm:text-base" title={school.name}>{school.name}</div>
            <div className="mt-0.5 text-[11.5px] text-ink-soft">
              Bursar console{activeTerm ? ` · Term ${activeTerm.term}, ${activeTerm.year}` : " · No active term"}
            </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3.5">
            <Button asChild variant="outline" className="hidden lg:inline-flex">
            <Link to="/fees">
              Generate invoice
            </Link>
            </Button>
            <Button asChild className="h-11 px-2 text-xs sm:px-3 sm:text-[13px]">
            <Link to="/receipting" aria-label="Record payment">
              <Receipt className="shrink-0" /><span className="hidden sm:inline">Record payment</span><span className="sm:hidden">Pay</span>
            </Link>
            </Button>
            <div className="flex items-center gap-2">
              <div className="hidden h-8 w-8 items-center justify-center rounded-full bg-forest-light font-serif text-xs font-semibold text-forest sm:flex">
                {initials || "?"}
              </div>
              <Button variant="ghost" size="icon" onClick={signOut} title="Sign out" aria-label="Sign out" className="h-11 w-11 text-ink-soft hover:text-ink">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        <div className="sf-content sf-print-area sf-fade min-w-0 max-w-[1180px] px-3 pt-5 pb-16 sm:px-6 lg:px-8 lg:pt-7">
          {children}
        </div>
      </main>
      <InstallPrompt />
    </div>
  );
}
