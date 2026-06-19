import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/receipting")({
  head: () => ({ meta: [{ title: "Receipting · KCB — SomaFin" }] }),
  component: () => (
    <ComingSoon
      eyebrow="KCB Buni inbox"
      title="Receipting · KCB"
      sub="Auto-match deposits to admission numbers, post & notify"
      phase="Phase 2 — Core money flow"
    />
  ),
});