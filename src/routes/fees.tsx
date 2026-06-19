import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/fees")({
  head: () => ({ meta: [{ title: "Fee collection — SomaFin" }] }),
  component: () => (
    <ComingSoon
      eyebrow="Per-student billing"
      title="Fee collection"
      sub="Build an invoice by vote head, then record payment against it"
      phase="Phase 2 — Core money flow"
    />
  ),
});