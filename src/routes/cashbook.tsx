import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/cashbook")({
  head: () => ({ meta: [{ title: "Cashbook — SomaFin" }] }),
  component: () => (
    <ComingSoon
      eyebrow="Statutory record"
      title="Cashbook"
      sub="Monthly RV/PV with b/f, c/f and BOM signature lines"
      phase="Phase 3 — Accounting depth"
    />
  ),
});