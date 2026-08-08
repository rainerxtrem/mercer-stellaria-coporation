import { createFileRoute } from "@tanstack/react-router";

import { ProfessionalMessaging } from "@/components/app/ProfessionalMessaging";

export const Route = createFileRoute("/_authenticated/messagerie-professionnelle")({
  head: () => ({ meta: [{ title: "Messagerie professionnelle | Mercer & Stellaria" }] }),
  component: ProfessionalMessaging,
});
