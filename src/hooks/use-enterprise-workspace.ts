import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getMyEnterpriseContext, setMyActiveEnterprise } from "@/lib/enterprise.functions";
import { readActiveFirmId, writeActiveFirmId } from "@/lib/enterprise";

export function useEnterpriseWorkspace() {
  const qc = useQueryClient();
  const contextFn = useServerFn(getMyEnterpriseContext);
  const setActiveFn = useServerFn(setMyActiveEnterprise);

  const contextQ = useQuery({
    queryKey: ["enterprise", "context"],
    queryFn: () => contextFn(),
  });

  const activeMutation = useMutation({
    mutationFn: (firmId: string) => setActiveFn({ data: { firm_id: firmId } }),
    onSuccess: async (_result, firmId) => {
      writeActiveFirmId(firmId);
      await qc.invalidateQueries({ queryKey: ["enterprise", "context"] });
    },
  });

  const data = contextQ.data;
  const enterprises = Array.isArray(data?.enterprises) ? data.enterprises : [];

  const activeFirmId = useMemo(() => {
    const preferred = readActiveFirmId();
    if (preferred && enterprises.some((e: any) => e?.firm_id === preferred)) {
      return preferred;
    }
    return data?.active_firm_id ?? null;
  }, [data?.active_firm_id, enterprises]);

  const activeEnterprise = useMemo(
    () => enterprises.find((enterprise: any) => enterprise?.firm_id === activeFirmId) ?? null,
    [enterprises, activeFirmId],
  );

  useEffect(() => {
    if (!activeFirmId) return;
    writeActiveFirmId(activeFirmId);
  }, [activeFirmId]);

  const navModules = useMemo(() => {
    const allowedModules = Array.isArray(activeEnterprise?.modules) ? activeEnterprise.modules : [];
    const sourceModules = Array.isArray(data?.nav_modules) ? data.nav_modules : [];
    const allowed = new Set(allowedModules);
    return sourceModules
      .filter((module: any) => allowed.has(module.slug))
      .sort((a: any, b: any) => Number(a.sort_order) - Number(b.sort_order));
  }, [data?.nav_modules, activeEnterprise?.modules]);

  function setActiveEnterprise(firmId: string) {
    if (!firmId) return;
    activeMutation.mutate(firmId);
  }

  return {
    isLoading: contextQ.isLoading,
    isPendingSwitch: activeMutation.isPending,
    context: data,
    enterprises,
    activeFirmId,
    activeEnterprise,
    navModules,
    setActiveEnterprise,
  };
}
