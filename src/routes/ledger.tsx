import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/ledger")({
  head: () => ({ meta: [{ title: "General ledger — SomaFin" }] }),
  component: () => (
    <ComingSoon
      eyebrow="Double-entry"
      title="General ledger"
      sub="Journal entries, trial balance, no cross-fund postings"
      phase="Phase 3 — Accounting depth"
    />
  ),
});