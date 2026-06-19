import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/bursary")({
  head: () => ({ meta: [{ title: "Bursaries · capitation — SomaFin" }] }),
  component: () => (
    <ComingSoon
      eyebrow="Funding register"
      title="Bursaries · capitation"
      sub="Quarterly MoE disbursements and per-student bursary pledges"
      phase="Phase 4 — Period operations"
    />
  ),
});