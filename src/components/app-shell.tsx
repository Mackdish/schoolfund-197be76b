import { Link, useRouterState, useNavigate, Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  LayoutDashboard, Users, CreditCard, Wallet, BookOpen, BookText,
  Receipt, ArrowRight, HandCoins, FileBarChart, Plus, Building2,
  Settings as SettingsIcon, UserCog, LogOut, Landmark, FileSignature,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { OnboardingWizard } from "@/components/onboarding";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { InstallPrompt } from "@/components/install-prompt";

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
  { to: "/promotion", label: "Promotion", icon: ArrowRight },
  { to: "/bursary", label: "Bursaries · capitation", icon: HandCoins },
  { to: "/reports", label: "Statutory reports", icon: FileBarChart },
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
  const initials = (profile?.full_name || profile?.email || "?")
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]?.toUpperCase()).join("");

  const { data: activeTerm } = useQuery({
    queryKey: ["active-term", school.id],
    queryFn: async () => {
      const { data } = await supabase.from("terms").select("year, term").eq("school_id", school.id).eq("is_active", true).maybeSingle();
      return data;
    },
  });

  return (
    <div className="grid min-h-screen grid-cols-[236px_1fr] bg-paper">
      <aside className="sf-no-print relative flex flex-col bg-ink text-[#D9DFD9]">
        <div className="flex items-center gap-3 px-6 pt-7 pb-5">
          <div className="sf-seal flex h-9 w-9 flex-none items-center justify-center">
            <span className="font-serif text-sm font-semibold text-brass">SF</span>
          </div>
          <div>
            <h1 className="text-[19px] text-white">SomaFin</h1>
            <p className="mt-0.5 text-[10.5px] uppercase tracking-[0.09em] text-[#7E8E85]">Treasury for schools</p>
          </div>
        </div>

        <nav className="mt-1.5 flex flex-col gap-px px-3.5">
          {navItems.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to}
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
            <Link key={item.label} to={item.to}
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
              <Link key={item.label} to={item.to}
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
      </aside>

      <main className="min-w-0">
        <header className="sf-no-print flex h-[68px] items-center justify-between border-b border-line bg-surface px-8">
          <div>
            <div className="font-serif text-base">{school.name}</div>
            <div className="mt-0.5 text-[11.5px] text-ink-soft">
              Bursar console{activeTerm ? ` · Term ${activeTerm.term}, ${activeTerm.year}` : " · No active term"}
            </div>
          </div>
          <div className="flex items-center gap-3.5">
            <Link to="/fees" className="rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px] font-medium hover:bg-paper">
              Generate invoice
            </Link>
            <Link to="/receipting" className="rounded-md border border-forest bg-forest px-3 py-2 text-[13px] font-medium text-white hover:bg-[#163F31]">
              Record payment
            </Link>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-forest-light font-serif text-xs font-semibold text-forest">
                {initials || "?"}
              </div>
              <button onClick={signOut} title="Sign out" className="text-ink-soft hover:text-ink">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <div className="sf-print-area sf-fade max-w-[1180px] px-8 pt-7 pb-16">
          {children}
        </div>
      </main>
      <InstallPrompt />
    </div>
  );
}
