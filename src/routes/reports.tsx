import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Statutory reports — SomaFin" }] }),
  component: () => (
    <ComingSoon
      eyebrow="IPSAS cash basis"
      title="Statutory reports"
      sub="Receipts & payments, budget vs actual, reconciliation, audit"
      phase="Phase 5 — Reporting & polish"
    />
  ),
});