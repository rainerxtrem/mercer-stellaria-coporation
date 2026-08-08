import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Plus, Save, Shield, Trash2, UserMinus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  deleteEnterpriseGrade,
  getEnterpriseAdminDetail,
  listUserLookup,
  removeEnterpriseMembership,
  setEnterpriseGradeModules,
  setEnterpriseGradePermissions,
  setEnterpriseMemberGrades,
  updateEnterpriseModules,
  updateEnterpriseSettings,
  upsertEnterpriseGrade,
  upsertEnterpriseMembership,
} from "@/lib/enterprise.functions";

export const Route = createFileRoute("/_authenticated/admin/enterprises/$firmId")({
  head: () => ({ meta: [{ title: "Entreprise - Administration" }] }),
  component: EnterpriseDetailPage,
});

function EnterpriseDetailPage() {
  const { firmId } = Route.useParams();
  const qc = useQueryClient();

  const detailFn = useServerFn(getEnterpriseAdminDetail);
  const updateModulesFn = useServerFn(updateEnterpriseModules);
  const updateSettingsFn = useServerFn(updateEnterpriseSettings);
  const upsertGradeFn = useServerFn(upsertEnterpriseGrade);
  const deleteGradeFn = useServerFn(deleteEnterpriseGrade);
  const setGradeModulesFn = useServerFn(setEnterpriseGradeModules);
  const setGradePermissionsFn = useServerFn(setEnterpriseGradePermissions);
  const userLookupFn = useServerFn(listUserLookup);
  const upsertMembershipFn = useServerFn(upsertEnterpriseMembership);
  const setMemberGradesFn = useServerFn(setEnterpriseMemberGrades);
  const removeMembershipFn = useServerFn(removeEnterpriseMembership);

  const detailQ = useQuery({
    queryKey: ["admin", "enterprise-detail", firmId],
    queryFn: () => detailFn({ data: { firm_id: firmId } }),
  });

  const detail = detailQ.data as any;
  const firm = detail?.firm ?? null;
  const modules = detail?.modules ?? [];
  const grades = detail?.grades ?? [];
  const members = detail?.members ?? [];
  const permissionCatalog = detail?.permissions ?? [];
  const memberEffective = detail?.member_effective_access ?? [];

  const gradeModuleMap = new Map<string, string[]>();
  for (const row of detail?.grade_modules ?? []) {
    const list = gradeModuleMap.get(row.grade_id) ?? [];
    if (row.allowed) list.push(row.module_slug);
    gradeModuleMap.set(row.grade_id, list);
  }

  const gradePermissionMap = new Map<string, string[]>();
  for (const row of detail?.grade_permissions ?? []) {
    const list = gradePermissionMap.get(row.grade_id) ?? [];
    list.push(row.permission_key);
    gradePermissionMap.set(row.grade_id, list);
  }

  const memberGradeMap = new Map<string, string[]>();
  for (const row of detail?.member_grades ?? []) {
    const list = memberGradeMap.get(row.membership_id) ?? [];
    list.push(row.grade_id);
    memberGradeMap.set(row.membership_id, list);
  }

  const effectiveByMembership = new Map<string, any>();
  for (const row of memberEffective) {
    effectiveByMembership.set(row.membership_id, row);
  }

  const updateModulesMut = useMutation({
    mutationFn: (enabled: string[]) =>
      updateModulesFn({ data: { firm_id: firmId, enabled_module_slugs: enabled } }),
    onSuccess: async () => {
      toast.success("Modules mis a jour");
      await qc.invalidateQueries({ queryKey: ["admin", "enterprise-detail", firmId] });
      await qc.invalidateQueries({ queryKey: ["enterprise", "context"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [settingsDraft, setSettingsDraft] = useState<any>(null);
  const currentSettings = useMemo(() => {
    if (!firm) return null;
    return {
      name: firm.name ?? "",
      number: firm.number ?? "",
      status: firm.status ?? "active",
      address: firm.address ?? "",
      manager: firm.manager ?? "",
      logo_url: firm.logo_url ?? "",
      brand_primary_color: firm.brand_primary_color ?? "#153E75",
      brand_secondary_color: firm.brand_secondary_color ?? "#0E2C56",
      brand_accent_color: firm.brand_accent_color ?? "#C8A44D",
    };
  }, [firm]);

  useEffect(() => {
    if (currentSettings) {
      setSettingsDraft(currentSettings);
    }
  }, [currentSettings?.name, currentSettings?.number, currentSettings?.status, currentSettings?.address, currentSettings?.manager, currentSettings?.logo_url, currentSettings?.brand_primary_color, currentSettings?.brand_secondary_color, currentSettings?.brand_accent_color]);

  const updateSettingsMut = useMutation({
    mutationFn: () =>
      updateSettingsFn({
        data: {
          firm_id: firmId,
          ...settingsDraft,
          address: settingsDraft?.address || null,
          manager: settingsDraft?.manager || null,
          logo_url: settingsDraft?.logo_url || null,
          visual_identity: firm?.visual_identity ?? {},
          settings: firm?.settings ?? {},
        },
      }),
    onSuccess: async () => {
      toast.success("Parametres entreprise mis a jour");
      await qc.invalidateQueries({ queryKey: ["admin", "enterprise-detail", firmId] });
      await qc.invalidateQueries({ queryKey: ["admin", "enterprises"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [gradeDraft, setGradeDraft] = useState({ code: "", name: "", description: "" });
  const [gradeDialogOpen, setGradeDialogOpen] = useState(false);

  const createGradeMut = useMutation({
    mutationFn: () =>
      upsertGradeFn({
        data: {
          firm_id: firmId,
          code: gradeDraft.code,
          name: gradeDraft.name,
          description: gradeDraft.description || null,
        },
      }),
    onSuccess: async () => {
      toast.success("Grade cree");
      setGradeDialogOpen(false);
      setGradeDraft({ code: "", name: "", description: "" });
      await qc.invalidateQueries({ queryKey: ["admin", "enterprise-detail", firmId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteGradeMut = useMutation({
    mutationFn: (gradeId: string) => deleteGradeFn({ data: { id: gradeId, firm_id: firmId } }),
    onSuccess: async () => {
      toast.success("Grade supprime");
      await qc.invalidateQueries({ queryKey: ["admin", "enterprise-detail", firmId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setGradeModulesMut = useMutation({
    mutationFn: ({ gradeId, slugs }: { gradeId: string; slugs: string[] }) =>
      setGradeModulesFn({ data: { firm_id: firmId, grade_id: gradeId, allowed_module_slugs: slugs } }),
    onSuccess: async () => {
      toast.success("Acces modules mis a jour");
      await qc.invalidateQueries({ queryKey: ["admin", "enterprise-detail", firmId] });
      await qc.invalidateQueries({ queryKey: ["enterprise", "context"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setGradePermissionsMut = useMutation({
    mutationFn: ({ gradeId, keys }: { gradeId: string; keys: string[] }) =>
      setGradePermissionsFn({ data: { firm_id: firmId, grade_id: gradeId, permission_keys: keys } }),
    onSuccess: async () => {
      toast.success("Permissions mises a jour");
      await qc.invalidateQueries({ queryKey: ["admin", "enterprise-detail", firmId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [userQuery, setUserQuery] = useState("");
  const userLookupQ = useQuery({
    queryKey: ["admin", "user-lookup", userQuery],
    queryFn: () => userLookupFn({ data: { q: userQuery || null } }),
  });

  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedGradeIds, setSelectedGradeIds] = useState<string[]>([]);

  const assignMemberMut = useMutation({
    mutationFn: async () => {
      const membership = await upsertMembershipFn({
        data: {
          firm_id: firmId,
          user_id: selectedUserId,
          status: "active",
        },
      });
      await setMemberGradesFn({
        data: {
          firm_id: firmId,
          membership_id: membership.membership_id,
          grade_ids: selectedGradeIds,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Utilisateur affecte");
      setSelectedUserId("");
      setSelectedGradeIds([]);
      await qc.invalidateQueries({ queryKey: ["admin", "enterprise-detail", firmId] });
      await qc.invalidateQueries({ queryKey: ["enterprise", "context"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveMemberGradesMut = useMutation({
    mutationFn: ({ membershipId, gradeIds }: { membershipId: string; gradeIds: string[] }) =>
      setMemberGradesFn({ data: { firm_id: firmId, membership_id: membershipId, grade_ids: gradeIds } }),
    onSuccess: async () => {
      toast.success("Grades utilisateur mis a jour");
      await qc.invalidateQueries({ queryKey: ["admin", "enterprise-detail", firmId] });
      await qc.invalidateQueries({ queryKey: ["enterprise", "context"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMemberMut = useMutation({
    mutationFn: (membershipId: string) =>
      removeMembershipFn({ data: { firm_id: firmId, membership_id: membershipId } }),
    onSuccess: async () => {
      toast.success("Utilisateur retire de l'entreprise");
      await qc.invalidateQueries({ queryKey: ["admin", "enterprise-detail", firmId] });
      await qc.invalidateQueries({ queryKey: ["enterprise", "context"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (detailQ.isLoading) {
    return <div className="py-8 text-sm text-muted-foreground">Chargement de l'entreprise...</div>;
  }

  if (!firm) {
    return <div className="py-8 text-sm text-muted-foreground">Entreprise introuvable ou inaccessible.</div>;
  }

  const enabledModules = modules.filter((m: any) => m.enabled);

  return (
    <div className="space-y-6">
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-navy-deep">
            <Building2 className="h-5 w-5" />
            {firm.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Numero" value={firm.number} />
          <Metric label="Statut" value={firm.status} />
          <Metric label="Modules actifs" value={`${enabledModules.length}/${modules.length}`} />
          <Metric label="Utilisateurs" value={String(members.length)} />
          <Metric label="Manager" value={firm.manager || "-"} />
          <Metric label="Adresse" value={firm.address || "-"} />
          <Metric label="Logo" value={firm.logo_url || "-"} />
          <Metric label="Grades" value={String(grades.length)} />
        </CardContent>
      </Card>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Utilisateurs</TabsTrigger>
          <TabsTrigger value="grades">Grades</TabsTrigger>
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="settings">Parametres</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-navy-deep">Gestion des utilisateurs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <Label>Recherche utilisateur</Label>
                  <Input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="email ou nom" />
                  <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-border bg-secondary/30">
                    {(userLookupQ.data ?? []).map((user: any) => (
                      <button
                        key={user.id}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-secondary ${selectedUserId === user.id ? "bg-secondary" : ""}`}
                        onClick={() => setSelectedUserId(user.id)}
                      >
                        <span className="truncate">{user.full_name ?? user.email}</span>
                        <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Grades a attribuer</Label>
                  <div className="mt-2 space-y-2 rounded-lg border border-border bg-secondary/20 p-3">
                    {grades.map((grade: any) => (
                      <label key={grade.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedGradeIds.includes(grade.id)}
                          onChange={(e) => {
                            setSelectedGradeIds((prev) =>
                              e.target.checked ? [...new Set([...prev, grade.id])] : prev.filter((id) => id !== grade.id),
                            );
                          }}
                        />
                        <span>{grade.name}</span>
                      </label>
                    ))}
                  </div>
                  <Button
                    className="mt-3 w-full bg-navy text-white hover:bg-navy-deep"
                    onClick={() => assignMemberMut.mutate()}
                    disabled={!selectedUserId || selectedGradeIds.length === 0 || assignMemberMut.isPending}
                  >
                    <Shield className="mr-2 h-4 w-4" />Affecter l'utilisateur
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-medium text-navy-deep">Utilisateurs ayant acces</h3>
                {(members as any[]).length === 0 && <p className="text-sm text-muted-foreground">Aucun utilisateur.</p>}
                {(members as any[]).map((member: any) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    grades={grades}
                    currentGradeIds={memberGradeMap.get(member.id) ?? []}
                    effective={effectiveByMembership.get(member.id)}
                    onSave={(gradeIds) => saveMemberGradesMut.mutate({ membershipId: member.id, gradeIds })}
                    onRemove={() => removeMemberMut.mutate(member.id)}
                    saving={saveMemberGradesMut.isPending || removeMemberMut.isPending}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grades" className="mt-4">
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-navy-deep">Grades de l'entreprise</CardTitle>
              <Dialog open={gradeDialogOpen} onOpenChange={setGradeDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Plus className="mr-1.5 h-4 w-4" />Nouveau grade
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Creer un grade</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-3">
                    <div>
                      <Label>Code</Label>
                      <Input value={gradeDraft.code} onChange={(e) => setGradeDraft({ ...gradeDraft, code: e.target.value })} placeholder="ex: legal_analyst" />
                    </div>
                    <div>
                      <Label>Nom</Label>
                      <Input value={gradeDraft.name} onChange={(e) => setGradeDraft({ ...gradeDraft, name: e.target.value })} placeholder="Analyste juridique" />
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Input value={gradeDraft.description} onChange={(e) => setGradeDraft({ ...gradeDraft, description: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setGradeDialogOpen(false)}>Annuler</Button>
                    <Button onClick={() => createGradeMut.mutate()} disabled={createGradeMut.isPending || !gradeDraft.code || !gradeDraft.name}>
                      Creer
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="space-y-4">
              {grades.map((grade: any) => (
                <GradeCard
                  key={grade.id}
                  grade={grade}
                  modules={modules}
                  permissionCatalog={permissionCatalog}
                  currentModules={gradeModuleMap.get(grade.id) ?? []}
                  currentPermissions={gradePermissionMap.get(grade.id) ?? []}
                  onSaveMeta={(draft) =>
                    upsertGradeFn({
                      data: {
                        id: grade.id,
                        firm_id: firmId,
                        code: draft.code,
                        name: draft.name,
                        description: draft.description || null,
                      },
                    }).then(
                      async () => {
                        toast.success("Grade mis a jour");
                        await qc.invalidateQueries({ queryKey: ["admin", "enterprise-detail", firmId] });
                      },
                      (error: Error) => toast.error(error.message),
                    )
                  }
                  onSaveModules={(slugs) => setGradeModulesMut.mutate({ gradeId: grade.id, slugs })}
                  onSavePermissions={(keys) => setGradePermissionsMut.mutate({ gradeId: grade.id, keys })}
                  onDelete={() => deleteGradeMut.mutate(grade.id)}
                  saving={setGradeModulesMut.isPending || setGradePermissionsMut.isPending || deleteGradeMut.isPending}
                />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="modules" className="mt-4">
          <ModuleMatrix
            modules={modules}
            onSave={(enabled) => updateModulesMut.mutate(enabled)}
            saving={updateModulesMut.isPending}
          />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-navy-deep">Parametres de l'entreprise</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Nom</Label>
                  <Input value={settingsDraft?.name ?? ""} onChange={(e) => setSettingsDraft({ ...settingsDraft, name: e.target.value })} />
                </div>
                <div>
                  <Label>Numero</Label>
                  <Input value={settingsDraft?.number ?? ""} onChange={(e) => setSettingsDraft({ ...settingsDraft, number: e.target.value })} />
                </div>
                <div>
                  <Label>Statut</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={settingsDraft?.status ?? "active"}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, status: e.target.value })}
                  >
                    <option value="active">active</option>
                    <option value="suspended">suspended</option>
                    <option value="revoked">revoked</option>
                  </select>
                </div>
                <div>
                  <Label>Manager</Label>
                  <Input value={settingsDraft?.manager ?? ""} onChange={(e) => setSettingsDraft({ ...settingsDraft, manager: e.target.value })} />
                </div>
                <div>
                  <Label>Logo URL</Label>
                  <Input value={settingsDraft?.logo_url ?? ""} onChange={(e) => setSettingsDraft({ ...settingsDraft, logo_url: e.target.value })} />
                </div>
                <div>
                  <Label>Adresse</Label>
                  <Input value={settingsDraft?.address ?? ""} onChange={(e) => setSettingsDraft({ ...settingsDraft, address: e.target.value })} />
                </div>
                <div>
                  <Label>Couleur primaire</Label>
                  <Input value={settingsDraft?.brand_primary_color ?? ""} onChange={(e) => setSettingsDraft({ ...settingsDraft, brand_primary_color: e.target.value })} />
                </div>
                <div>
                  <Label>Couleur secondaire</Label>
                  <Input value={settingsDraft?.brand_secondary_color ?? ""} onChange={(e) => setSettingsDraft({ ...settingsDraft, brand_secondary_color: e.target.value })} />
                </div>
                <div>
                  <Label>Couleur accent</Label>
                  <Input value={settingsDraft?.brand_accent_color ?? ""} onChange={(e) => setSettingsDraft({ ...settingsDraft, brand_accent_color: e.target.value })} />
                </div>
              </div>

              <Button
                className="bg-navy text-white hover:bg-navy-deep"
                onClick={() => updateSettingsMut.mutate()}
                disabled={updateSettingsMut.isPending || !settingsDraft?.name || !settingsDraft?.number}
              >
                <Save className="mr-2 h-4 w-4" />Enregistrer les parametres
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-navy-deep">{value}</p>
    </div>
  );
}

function MemberRow({
  member,
  grades,
  currentGradeIds,
  effective,
  onSave,
  onRemove,
  saving,
}: {
  member: any;
  grades: any[];
  currentGradeIds: string[];
  effective: any;
  onSave: (gradeIds: string[]) => void;
  onRemove: () => void;
  saving: boolean;
}) {
  const [gradeIds, setGradeIds] = useState<string[]>(currentGradeIds);

  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-navy-deep">{member.profiles?.full_name ?? member.user_id}</p>
          <p className="text-xs text-muted-foreground">{member.email ?? member.user_id}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onSave(gradeIds)} disabled={saving}>
            <Save className="mr-1 h-3.5 w-3.5" />Sauver grades
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove} disabled={saving}>
            <UserMinus className="mr-1 h-3.5 w-3.5 text-destructive" />Retirer
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Grades</p>
          <div className="space-y-1">
            {grades.map((grade: any) => (
              <label key={grade.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={gradeIds.includes(grade.id)}
                  onChange={(e) => {
                    setGradeIds((prev) =>
                      e.target.checked ? [...new Set([...prev, grade.id])] : prev.filter((id) => id !== grade.id),
                    );
                  }}
                />
                <span>{grade.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Permissions effectives</p>
          <div className="flex flex-wrap gap-1">
            {(effective?.effective_permissions ?? []).length === 0 && (
              <span className="text-xs text-muted-foreground">Aucune permission</span>
            )}
            {(effective?.effective_permissions ?? []).map((key: string) => (
              <Badge key={key} variant="secondary" className="text-[10px]">
                {key}
              </Badge>
            ))}
          </div>
          <p className="mt-2 mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Modules effectifs</p>
          <div className="flex flex-wrap gap-1">
            {(effective?.effective_modules ?? []).length === 0 && (
              <span className="text-xs text-muted-foreground">Aucun module</span>
            )}
            {(effective?.effective_modules ?? []).map((slug: string) => (
              <Badge key={slug} variant="outline" className="text-[10px]">
                {slug}
              </Badge>
            ))}
          </div>
          {effective?.has_lawyer_grade && (
            <p className="mt-2 text-xs font-medium text-emerald-700">Grade Avocat actif</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ModuleMatrix({
  modules,
  saving,
  onSave,
}: {
  modules: any[];
  saving: boolean;
  onSave: (enabledSlugs: string[]) => void;
}) {
  const initialEnabled = modules.filter((m) => m.enabled).map((m) => m.module_slug);
  const [enabled, setEnabled] = useState<string[]>(initialEnabled);

  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader>
        <CardTitle className="text-navy-deep">Modules actives</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((module: any) => {
            const catalog = module.enterprise_module_catalog;
            const checked = enabled.includes(module.module_slug);
            return (
              <label key={module.module_slug} className="rounded-lg border border-border bg-secondary/20 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      setEnabled((prev) =>
                        e.target.checked
                          ? [...new Set([...prev, module.module_slug])]
                          : prev.filter((slug) => slug !== module.module_slug),
                      );
                    }}
                  />
                  <span className="font-medium">{catalog?.label ?? module.module_slug}</span>
                </div>
                {catalog?.description && <p className="mt-1 text-xs text-muted-foreground">{catalog.description}</p>}
              </label>
            );
          })}
        </div>
        <Button onClick={() => onSave(enabled)} disabled={saving} className="bg-navy text-white hover:bg-navy-deep">
          <Save className="mr-2 h-4 w-4" />Enregistrer les modules
        </Button>
      </CardContent>
    </Card>
  );
}

function GradeCard({
  grade,
  modules,
  permissionCatalog,
  currentModules,
  currentPermissions,
  onSaveMeta,
  onSaveModules,
  onSavePermissions,
  onDelete,
  saving,
}: {
  grade: any;
  modules: any[];
  permissionCatalog: any[];
  currentModules: string[];
  currentPermissions: string[];
  onSaveMeta: (draft: { code: string; name: string; description: string }) => void;
  onSaveModules: (slugs: string[]) => void;
  onSavePermissions: (keys: string[]) => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const [moduleSlugs, setModuleSlugs] = useState<string[]>(currentModules);
  const [permissionKeys, setPermissionKeys] = useState<string[]>(currentPermissions);
  const [meta, setMeta] = useState({
    code: grade.code ?? "",
    name: grade.name ?? "",
    description: grade.description ?? "",
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base text-navy-deep">{grade.name}</CardTitle>
        {!grade.is_system && (
          <Button variant="ghost" size="sm" onClick={onDelete} disabled={saving}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!grade.is_system && (
          <div className="grid gap-2 md:grid-cols-3">
            <Input value={meta.code} onChange={(e) => setMeta({ ...meta, code: e.target.value })} placeholder="Code" />
            <Input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} placeholder="Nom" />
            <Input value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} placeholder="Description" />
            <div className="md:col-span-3">
              <Button size="sm" variant="outline" onClick={() => onSaveMeta(meta)} disabled={saving || !meta.code || !meta.name}>
                <Save className="mr-1 h-3.5 w-3.5" />Enregistrer le grade
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium">Modules accessibles</p>
            <div className="space-y-2">
              {modules.map((module: any) => {
                const slug = module.module_slug;
                const label = module.enterprise_module_catalog?.label ?? slug;
                return (
                  <label key={slug} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={moduleSlugs.includes(slug)}
                      onChange={(e) => {
                        setModuleSlugs((prev) =>
                          e.target.checked ? [...new Set([...prev, slug])] : prev.filter((entry) => entry !== slug),
                        );
                      }}
                    />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>
            <Button size="sm" className="mt-3" onClick={() => onSaveModules(moduleSlugs)} disabled={saving}>
              Enregistrer modules
            </Button>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Permissions</p>
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {permissionCatalog.map((permission: any) => (
                <label key={permission.permission_key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={permissionKeys.includes(permission.permission_key)}
                    onChange={(e) => {
                      setPermissionKeys((prev) =>
                        e.target.checked
                          ? [...new Set([...prev, permission.permission_key])]
                          : prev.filter((entry) => entry !== permission.permission_key),
                      );
                    }}
                  />
                  <span>{permission.label}</span>
                </label>
              ))}
            </div>
            <Button size="sm" className="mt-3" onClick={() => onSavePermissions(permissionKeys)} disabled={saving}>
              Enregistrer permissions
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
