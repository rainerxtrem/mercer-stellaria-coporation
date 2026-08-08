import { Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Save, Trash2, Shield, Building2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  createEnterprise,
  deleteEnterpriseGrade,
  getEnterpriseAdminDetail,
  listEnterpriseModuleCatalog,
  listEnterprisesAdmin,
  listUserLookup,
  setEnterpriseGradeModules,
  setEnterpriseGradePermissions,
  setEnterpriseMemberGrades,
  updateEnterpriseModules,
  upsertEnterpriseGrade,
  upsertEnterpriseMembership,
} from "@/lib/enterprise.functions";

export const Route = createFileRoute("/_authenticated/admin/enterprises")({
  head: () => ({ meta: [{ title: "Entreprises modulaires - Administration" }] }),
  component: EnterprisesAdminPage,
});

function EnterprisesAdminPage() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isDetailRoute = pathname.startsWith("/admin/enterprises/");

  const qc = useQueryClient();
  const listFn = useServerFn(listEnterprisesAdmin);
  const catalogFn = useServerFn(listEnterpriseModuleCatalog);
  const detailFn = useServerFn(getEnterpriseAdminDetail);
  const createFn = useServerFn(createEnterprise);
  const updateModulesFn = useServerFn(updateEnterpriseModules);
  const upsertGradeFn = useServerFn(upsertEnterpriseGrade);
  const deleteGradeFn = useServerFn(deleteEnterpriseGrade);
  const setGradeModulesFn = useServerFn(setEnterpriseGradeModules);
  const setGradePermissionsFn = useServerFn(setEnterpriseGradePermissions);
  const userLookupFn = useServerFn(listUserLookup);
  const upsertMembershipFn = useServerFn(upsertEnterpriseMembership);
  const setMemberGradesFn = useServerFn(setEnterpriseMemberGrades);

  const enterprisesQ = useQuery({ queryKey: ["admin", "enterprises"], queryFn: () => listFn() });
  const catalogQ = useQuery({ queryKey: ["admin", "enterprise-module-catalog"], queryFn: () => catalogFn() });

  const [selectedFirmId, setSelectedFirmId] = useState<string>("");
  const [newEnterpriseOpen, setNewEnterpriseOpen] = useState(false);
  const [newEnterprise, setNewEnterprise] = useState({
    number: "ENT-",
    name: "",
    address: "",
    manager: "",
    logo_url: "",
    brand_primary_color: "#153E75",
    brand_secondary_color: "#0E2C56",
    brand_accent_color: "#C8A44D",
  });

  const selectedFirm = useMemo(() => {
    const list = enterprisesQ.data ?? [];
    if (list.length === 0) return null;
    if (selectedFirmId) return list.find((f: any) => f.id === selectedFirmId) ?? list[0];
    return list[0];
  }, [enterprisesQ.data, selectedFirmId]);

  const detailQ = useQuery({
    queryKey: ["admin", "enterprise-detail", selectedFirm?.id],
    enabled: Boolean(selectedFirm?.id),
    queryFn: () => detailFn({ data: { firm_id: selectedFirm!.id } }),
  });

  const createEnterpriseMut = useMutation({
    mutationFn: async (enabledModules: string[]) =>
      createFn({
        data: {
          ...newEnterprise,
          address: newEnterprise.address || null,
          manager: newEnterprise.manager || null,
          logo_url: newEnterprise.logo_url || null,
          enabled_module_slugs: enabledModules,
        },
      }),
    onSuccess: async () => {
      toast.success("Entreprise creee");
      setNewEnterpriseOpen(false);
      await qc.invalidateQueries({ queryKey: ["admin", "enterprises"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateModulesMut = useMutation({
    mutationFn: (enabled: string[]) =>
      updateModulesFn({ data: { firm_id: selectedFirm!.id, enabled_module_slugs: enabled } }),
    onSuccess: async () => {
      toast.success("Modules mis a jour");
      await qc.invalidateQueries({ queryKey: ["admin", "enterprise-detail", selectedFirm?.id] });
      await qc.invalidateQueries({ queryKey: ["enterprise", "context"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [gradeDraft, setGradeDraft] = useState({ code: "", name: "", description: "" });
  const [gradeDialogOpen, setGradeDialogOpen] = useState(false);

  const createGradeMut = useMutation({
    mutationFn: () =>
      upsertGradeFn({
        data: {
          firm_id: selectedFirm!.id,
          code: gradeDraft.code,
          name: gradeDraft.name,
          description: gradeDraft.description || null,
        },
      }),
    onSuccess: async () => {
      toast.success("Grade cree");
      setGradeDialogOpen(false);
      setGradeDraft({ code: "", name: "", description: "" });
      await qc.invalidateQueries({ queryKey: ["admin", "enterprise-detail", selectedFirm?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteGradeMut = useMutation({
    mutationFn: (gradeId: string) => deleteGradeFn({ data: { id: gradeId, firm_id: selectedFirm!.id } }),
    onSuccess: async () => {
      toast.success("Grade supprime");
      await qc.invalidateQueries({ queryKey: ["admin", "enterprise-detail", selectedFirm?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setGradeModulesMut = useMutation({
    mutationFn: ({ gradeId, slugs }: { gradeId: string; slugs: string[] }) =>
      setGradeModulesFn({ data: { firm_id: selectedFirm!.id, grade_id: gradeId, allowed_module_slugs: slugs } }),
    onSuccess: async () => {
      toast.success("Acces modules mis a jour");
      await qc.invalidateQueries({ queryKey: ["admin", "enterprise-detail", selectedFirm?.id] });
      await qc.invalidateQueries({ queryKey: ["enterprise", "context"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setGradePermissionsMut = useMutation({
    mutationFn: ({ gradeId, keys }: { gradeId: string; keys: string[] }) =>
      setGradePermissionsFn({ data: { firm_id: selectedFirm!.id, grade_id: gradeId, permission_keys: keys } }),
    onSuccess: async () => {
      toast.success("Permissions mises a jour");
      await qc.invalidateQueries({ queryKey: ["admin", "enterprise-detail", selectedFirm?.id] });
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
          firm_id: selectedFirm!.id,
          user_id: selectedUserId,
          status: "active",
        },
      });
      await setMemberGradesFn({
        data: {
          firm_id: selectedFirm!.id,
          membership_id: membership.membership_id,
          grade_ids: selectedGradeIds,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Membre affecte a l'entreprise");
      setSelectedUserId("");
      setSelectedGradeIds([]);
      await qc.invalidateQueries({ queryKey: ["admin", "enterprise-detail", selectedFirm?.id] });
      await qc.invalidateQueries({ queryKey: ["enterprise", "context"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const detail = detailQ.data as any;
  const modules = detail?.modules ?? [];
  const grades = detail?.grades ?? [];
  const members = detail?.members ?? [];
  const permissionCatalog = detail?.permissions ?? [];

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

  if (isDetailRoute) {
    return <Outlet />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-deep">Entreprises modulaires</h1>
          <p className="text-sm text-muted-foreground">
            Architecture multi-entreprises : modules, grades, permissions et membres independants.
          </p>
        </div>

        <Dialog open={newEnterpriseOpen} onOpenChange={setNewEnterpriseOpen}>
          <DialogTrigger asChild>
            <Button className="bg-navy text-white hover:bg-navy-deep">
              <Plus className="mr-2 h-4 w-4" />+ Nouvelle entreprise
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Nouvelle entreprise</DialogTitle>
            </DialogHeader>
            <CreateEnterpriseForm
              value={newEnterprise}
              onChange={setNewEnterprise}
              modules={(catalogQ.data ?? []) as any[]}
              saving={createEnterpriseMut.isPending}
              onSubmit={(enabled) => createEnterpriseMut.mutate(enabled)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-navy-deep">Entreprises</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(enterprisesQ.data ?? []).map((enterprise: any) => (
              <button
                key={enterprise.id}
                type="button"
                className={`block w-full rounded-xl border p-4 text-left transition ${selectedFirm?.id === enterprise.id ? "border-gold bg-gold/10" : "border-border hover:border-navy/40"}`}
                onClick={() => {
                  setSelectedFirmId(enterprise.id);
                  navigate({ to: "/admin/enterprises/$firmId", params: { firmId: enterprise.id } });
                }}
              >
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-navy" />
                  <p className="truncate font-semibold text-navy-deep">{enterprise.name}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{enterprise.number}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Modules {enterprise.modules_enabled}/{enterprise.modules_total} · Grades {enterprise.grades_total}
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedFirm && detail && (
        <Tabs defaultValue="modules">
          <TabsList>
            <TabsTrigger value="modules">Modules</TabsTrigger>
            <TabsTrigger value="grades">Grades & permissions</TabsTrigger>
            <TabsTrigger value="members">Utilisateurs</TabsTrigger>
          </TabsList>

          <TabsContent value="modules" className="mt-4">
            <ModuleMatrix
              modules={modules}
              onSave={(enabled) => updateModulesMut.mutate(enabled)}
              saving={updateModulesMut.isPending}
            />
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
                    onSaveModules={(slugs) => setGradeModulesMut.mutate({ gradeId: grade.id, slugs })}
                    onSavePermissions={(keys) => setGradePermissionsMut.mutate({ gradeId: grade.id, keys })}
                    onDelete={() => deleteGradeMut.mutate(grade.id)}
                    saving={setGradeModulesMut.isPending || setGradePermissionsMut.isPending || deleteGradeMut.isPending}
                  />
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="members" className="mt-4">
            <Card className="shadow-[var(--shadow-card)]">
              <CardHeader>
                <CardTitle className="text-navy-deep">Affectation utilisateurs / grades</CardTitle>
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

                <div className="space-y-2">
                  <h3 className="font-medium text-navy-deep">Membres actuels</h3>
                  {(members as any[]).length === 0 && <p className="text-sm text-muted-foreground">Aucun membre affecte.</p>}
                  {(members as any[]).map((member: any) => {
                    const assignedGradeNames = (memberGradeMap.get(member.id) ?? [])
                      .map((gradeId) => grades.find((grade: any) => grade.id === gradeId)?.name)
                      .filter(Boolean)
                      .join(", ");
                    return (
                      <div key={member.id} className="rounded-lg border border-border bg-secondary/20 px-3 py-2 text-sm">
                        <p className="font-medium text-navy-deep">{member.profiles?.full_name ?? member.user_id}</p>
                        <p className="text-xs text-muted-foreground">{assignedGradeNames || "Aucun grade"}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function CreateEnterpriseForm({
  value,
  onChange,
  modules,
  saving,
  onSubmit,
}: {
  value: any;
  onChange: (next: any) => void;
  modules: any[];
  saving: boolean;
  onSubmit: (enabledModules: string[]) => void;
}) {
  const [enabled, setEnabled] = useState<string[]>(modules.map((m) => m.slug));

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Numero</Label>
          <Input value={value.number} onChange={(e) => onChange({ ...value, number: e.target.value })} />
        </div>
        <div>
          <Label>Nom</Label>
          <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
        </div>
        <div>
          <Label>Manager</Label>
          <Input value={value.manager} onChange={(e) => onChange({ ...value, manager: e.target.value })} />
        </div>
        <div>
          <Label>Logo URL</Label>
          <Input value={value.logo_url} onChange={(e) => onChange({ ...value, logo_url: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <Label>Adresse</Label>
          <Input value={value.address} onChange={(e) => onChange({ ...value, address: e.target.value })} />
        </div>
        <div>
          <Label>Couleur primaire</Label>
          <Input value={value.brand_primary_color} onChange={(e) => onChange({ ...value, brand_primary_color: e.target.value })} />
        </div>
        <div>
          <Label>Couleur secondaire</Label>
          <Input value={value.brand_secondary_color} onChange={(e) => onChange({ ...value, brand_secondary_color: e.target.value })} />
        </div>
        <div>
          <Label>Couleur accent</Label>
          <Input value={value.brand_accent_color} onChange={(e) => onChange({ ...value, brand_accent_color: e.target.value })} />
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border p-3">
        <p className="mb-2 text-sm font-medium">Modules actives</p>
        <div className="grid gap-2 md:grid-cols-2">
          {modules.map((module: any) => (
            <label key={module.slug} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabled.includes(module.slug)}
                onChange={(e) => {
                  setEnabled((prev) =>
                    e.target.checked ? [...new Set([...prev, module.slug])] : prev.filter((slug) => slug !== module.slug),
                  );
                }}
              />
              <span>{module.label}</span>
            </label>
          ))}
        </div>
      </div>

      <DialogFooter className="mt-4">
        <Button variant="outline">Annuler</Button>
        <Button
          onClick={() => onSubmit(enabled)}
          disabled={saving || !value.name.trim() || !value.number.trim()}
          className="bg-navy text-white hover:bg-navy-deep"
        >
          <Save className="mr-2 h-4 w-4" />Creer l'entreprise
        </Button>
      </DialogFooter>
    </>
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
        <CardTitle className="text-navy-deep">Activation des modules</CardTitle>
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
  onSaveModules: (slugs: string[]) => void;
  onSavePermissions: (keys: string[]) => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const [moduleSlugs, setModuleSlugs] = useState<string[]>(currentModules);
  const [permissionKeys, setPermissionKeys] = useState<string[]>(currentPermissions);

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
      <CardContent className="grid gap-4 lg:grid-cols-2">
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
      </CardContent>
    </Card>
  );
}
