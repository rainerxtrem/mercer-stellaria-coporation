import { Outlet } from "@tanstack/react-router";
import { AdminGuard } from "./AdminGuard";

export function AdminShell() {
  return (
    <AdminGuard>
      <div className="min-w-0">
        <Outlet />
      </div>
    </AdminGuard>
  );
}
