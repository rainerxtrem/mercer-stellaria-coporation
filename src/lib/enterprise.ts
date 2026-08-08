export const ACTIVE_FIRM_STORAGE_KEY = "msc.active.firm_id";

export type EnterpriseNavModule = {
  slug: string;
  label: string;
  route_path: string | null;
  nav_group: string;
  icon_name: string | null;
  sort_order: number;
};

export type EnterpriseSummary = {
  firm_id: string;
  number: string;
  name: string;
  logo_url: string | null;
  grade_names: string[];
  modules: string[];
};

export function readActiveFirmId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_FIRM_STORAGE_KEY);
}

export function writeActiveFirmId(firmId: string | null) {
  if (typeof window === "undefined") return;
  if (!firmId) {
    window.localStorage.removeItem(ACTIVE_FIRM_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(ACTIVE_FIRM_STORAGE_KEY, firmId);
}
