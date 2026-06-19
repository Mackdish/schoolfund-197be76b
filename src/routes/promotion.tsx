import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/promotion")({
  head: () => ({ meta: [{ title: "Promotion — SomaFin" }] }),
  component: () => (
    <ComingSoon
      eyebrow="End-of-term"
      title="Promotion"
      sub="Carry forward per-fund balances, lock closed term, BOM sign-off"
      phase="Phase 4 — Period operations"
    />
  ),
});