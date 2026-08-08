import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/messagerie-professionnelle")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/_authenticated/messagerie-professionnelle"!</div>;
}
