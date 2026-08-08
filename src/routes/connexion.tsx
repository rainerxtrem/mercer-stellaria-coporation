import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/connexion")({
  beforeLoad: ({ search }) => {
    const service = typeof (search as any)?.service === "string" ? (search as any).service : undefined;
    throw redirect({
      to: "/auth",
      search: service ? ({ service } as any) : undefined,
    });
  },
  component: () => null,
});
