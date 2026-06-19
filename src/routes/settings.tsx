import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — SomaFin" }] }),
  component: () => (
    <ComingSoon
      eyebrow="Configuration"
      title="Settings"
      sub="School setup, vote heads, instalment plans, users & roles"
      phase="Phase 5 — Reporting & polish"
    />
  ),
});