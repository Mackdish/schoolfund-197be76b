import { AppShell } from "@/components/app-shell";
import { PageHead, Panel } from "@/components/ui-bits";

export function ComingSoon({
  eyebrow,
  title,
  sub,
  phase,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  phase: string;
}) {
  return (
    <AppShell>
      <PageHead eyebrow={eyebrow} title={title} sub={sub} />
      <Panel>
        <div className="flex items-center gap-4 py-8">
          <div className="sf-seal flex h-14 w-14 flex-none items-center justify-center">
            <span className="font-serif text-base font-semibold text-brass">SF</span>
          </div>
          <div>
            <div className="font-serif text-lg">Scheduled for {phase}</div>
            <p className="mt-1 max-w-[520px] text-[13px] text-ink-soft">
              This screen is part of the SomaFin build roadmap. The Phase 1 foundation
              (design system, app shell, and treasury dashboard) is in place; this page
              will be wired against the Supabase schema in the named phase.
            </p>
          </div>
        </div>
      </Panel>
    </AppShell>
  );
}