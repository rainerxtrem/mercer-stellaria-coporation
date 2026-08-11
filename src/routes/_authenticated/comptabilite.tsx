import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  Building2,
  Calculator,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  deleteAccountingCompany,
  forceRefreshAccountingLast7Days,
  listAccountingAnomalies,
  listAccountingCompanies,
  listAccountingDashboard,
  listAccountingOperations,
  setAccountingCompanyStatus,
  updateAccountingOperation,
  upsertAccountingCompany,
} from "@/lib/accounting.functions";

export const Route = createFileRoute("/_authenticated/comptabilite")({
  head: () => ({ meta: [{ title: "Comptabilité - Entreprise" }] }),
  component: ComptabilitePage,
});

type CompanyForm = {
  id?: string;
  name: string;
  legal_name: string;
  company_type: string;
  internal_identifier: string;
  discord_server_id: string;
  discord_channel_id: string;
  discord_channel_url: string;
  status: "active" | "inactive";
};

const EMPTY_COMPANY: CompanyForm = {
  name: "",
  legal_name: "",
  company_type: "",
  internal_identifier: "",
  discord_server_id: "",
  discord_channel_id: "",
  discord_channel_url: "",
  status: "active",
};

function money(amount: unknown, currency = "EUR") {
  const value = Number(amount ?? 0);
  return `${value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function dateFormat(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("fr-FR");
}

function getWeekStartSunday20(value: string | null | undefined): Date {
  const now = new Date();
  const source = value ? new Date(value) : now;
  const d = Number.isNaN(source.getTime()) ? now : source;

  const weekStart = new Date(d);
  weekStart.setHours(20, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  if (d.getTime() < weekStart.getTime()) {
    weekStart.setDate(weekStart.getDate() - 7);
  }
  return weekStart;
}

function weekLabelForRow(row: any): string {
  const start = getWeekStartSunday20(row.operation_date ?? row.created_at ?? null);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return `${start.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} 20:00 -> ${end.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} 20:00`;
}

function sortRowsByWeek(rows: any[]): any[] {
  return [...rows].sort((a, b) => {
    const aStart = getWeekStartSunday20(a.operation_date ?? a.created_at ?? null).getTime();
    const bStart = getWeekStartSunday20(b.operation_date ?? b.created_at ?? null).getTime();
    if (aStart !== bStart) return bStart - aStart;
    const aDate = new Date(a.operation_date ?? a.created_at ?? 0).getTime();
    const bDate = new Date(b.operation_date ?? b.created_at ?? 0).getTime();
    return bDate - aDate;
  });
}

function exportRowsCsv(rows: any[]) {
  const headers = [
    "Date",
    "Societe",
    "Type",
    "Facture",
    "ClientFournisseur",
    "Montant",
    "Devise",
    "Statut",
    "Source",
  ];

  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((row) => [
    row.operation_date ?? row.created_at ?? "",
    row.company_name ?? "",
    row.entry_side ?? "",
    row.invoice_number ?? "",
    row.counterparty ?? "",
    row.amount ?? "",
    row.currency ?? "",
    row.status ?? "",
    row.source ?? "",
  ].map(escape).join(","));

  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `journal-comptable-${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function ComptabilitePage() {
  const qc = useQueryClient();

  const listCompaniesFn = useServerFn(listAccountingCompanies);
  const upsertCompanyFn = useServerFn(upsertAccountingCompany);
  const deleteCompanyFn = useServerFn(deleteAccountingCompany);
  const setCompanyStatusFn = useServerFn(setAccountingCompanyStatus);
  const listOperationsFn = useServerFn(listAccountingOperations);
  const listDashboardFn = useServerFn(listAccountingDashboard);
  const updateOperationFn = useServerFn(updateAccountingOperation);
  const listAnomaliesFn = useServerFn(listAccountingAnomalies);
  const forceRefreshFn = useServerFn(forceRefreshAccountingLast7Days);

  const [activeTab, setActiveTab] = useState("dashboard");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [periodDays, setPeriodDays] = useState("30");
  const [sideFilter, setSideFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [companyDraft, setCompanyDraft] = useState<CompanyForm>(EMPTY_COMPANY);
  const [operationDialogOpen, setOperationDialogOpen] = useState(false);
  const [operationDraft, setOperationDraft] = useState<any>(null);

  const companiesQ = useQuery({
    queryKey: ["accounting", "companies"],
    queryFn: () => listCompaniesFn(),
  });

  const operationsQ = useQuery({
    queryKey: [
      "accounting",
      "operations",
      companyFilter,
      periodDays,
      sideFilter,
      statusFilter,
      search,
    ],
    queryFn: () =>
      listOperationsFn({
        data: {
          company_id: companyFilter === "all" ? null : companyFilter,
          period_days: Number(periodDays),
          side: sideFilter as any,
          status: statusFilter,
          search: search || null,
        },
      }),
  });

  const dashboardQ = useQuery({
    queryKey: ["accounting", "dashboard", companyFilter, periodDays, sideFilter, statusFilter],
    queryFn: () =>
      listDashboardFn({
        data: {
          company_id: companyFilter === "all" ? null : companyFilter,
          period_days: Number(periodDays),
          side: sideFilter as any,
          status: statusFilter,
        },
      }),
  });

  const anomaliesQ = useQuery({
    queryKey: ["accounting", "anomalies"],
    queryFn: () => listAnomaliesFn(),
  });

  const upsertCompanyMut = useMutation({
    mutationFn: () =>
      upsertCompanyFn({
        data: {
          ...companyDraft,
          legal_name: companyDraft.legal_name || null,
          company_type: companyDraft.company_type || null,
          internal_identifier: companyDraft.internal_identifier || null,
          discord_server_id: companyDraft.discord_server_id || null,
          discord_channel_id: companyDraft.discord_channel_id || null,
          discord_channel_url: companyDraft.discord_channel_url || null,
        },
      }),
    onSuccess: async () => {
      toast.success("Société enregistrée");
      setCompanyDialogOpen(false);
      setCompanyDraft(EMPTY_COMPANY);
      await qc.invalidateQueries({ queryKey: ["accounting", "companies"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteCompanyMut = useMutation({
    mutationFn: (id: string) => deleteCompanyFn({ data: { id } }),
    onSuccess: async () => {
      toast.success("Société supprimée");
      await qc.invalidateQueries({ queryKey: ["accounting", "companies"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setCompanyStatusMut = useMutation({
    mutationFn: (payload: { id: string; status: "active" | "inactive" }) => setCompanyStatusFn({ data: payload }),
    onSuccess: async () => {
      toast.success("Statut mis à jour");
      await qc.invalidateQueries({ queryKey: ["accounting", "companies"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateOperationMut = useMutation({
    mutationFn: () => updateOperationFn({ data: operationDraft }),
    onSuccess: async () => {
      toast.success("Opération mise à jour");
      setOperationDialogOpen(false);
      setOperationDraft(null);
      await qc.invalidateQueries({ queryKey: ["accounting", "operations"] });
      await qc.invalidateQueries({ queryKey: ["accounting", "dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const forceRefreshMut = useMutation({
    mutationFn: () => forceRefreshFn({ data: {} as any }),
    onSuccess: async (result: any) => {
      const extra = result.discord_backfill_enabled
        ? ` | Discord lu: ${result.fetched_from_discord ?? 0} messages`
        : " | Discord non lu (token bot absent)";
      toast.success(`Mise a jour forcee terminee: ${result.upserted} operations regenerees, ${result.anomalies} anomalies.${extra}`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["accounting", "operations"] }),
        qc.invalidateQueries({ queryKey: ["accounting", "dashboard"] }),
        qc.invalidateQueries({ queryKey: ["accounting", "anomalies"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const operations = (operationsQ.data ?? []) as any[];
  const operationsByWeek = useMemo(() => sortRowsByWeek(operations), [operations]);

  const toClassifyRows = useMemo(
    () => operationsByWeek.filter((row) => row.needs_classification),
    [operationsByWeek],
  );
  const revenueRows = useMemo(() => operationsByWeek.filter((row) => row.entry_side === "revenue"), [operationsByWeek]);
  const expenseRows = useMemo(() => operationsByWeek.filter((row) => row.entry_side === "expense"), [operationsByWeek]);
  const invoiceRows = useMemo(() => operationsByWeek.filter((row) => row.invoice_number), [operationsByWeek]);

  const stats = dashboardQ.data ?? {
    revenue: 0,
    expense: 0,
    result: 0,
    paid_invoices: 0,
    pending_invoices: 0,
    overdue_invoices: 0,
    to_classify: 0,
    operations_total: 0,
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-deep">Comptabilité</h1>
          <p className="text-sm text-muted-foreground">
            Gestion comptable multi-sociétés avec ingestion Discord, classification et journal auditables.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => forceRefreshMut.mutate()} disabled={forceRefreshMut.isPending}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Mise a jour forcee
          </Button>
          <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-800">
            Module entreprise
          </Badge>
        </div>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-1">
            <Label>Société</Label>
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les sociétés</SelectItem>
                {(companiesQ.data ?? []).map((company: any) => (
                  <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Période</Label>
            <Select value={periodDays} onValueChange={setPeriodDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 jours</SelectItem>
                <SelectItem value="30">30 jours</SelectItem>
                <SelectItem value="90">90 jours</SelectItem>
                <SelectItem value="365">12 mois</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={sideFilter} onValueChange={setSideFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="revenue">Revenus</SelectItem>
                <SelectItem value="expense">Dépenses</SelectItem>
                <SelectItem value="unclassified">À classifier</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Statut</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="to_classify">À classifier</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="paid">Payé</SelectItem>
                <SelectItem value="overdue">En retard</SelectItem>
                <SelectItem value="recorded">Enregistré</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Recherche</Label>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Facture, client, fournisseur..."
            />
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="dashboard">Tableau de bord</TabsTrigger>
          <TabsTrigger value="to_classify">À classifier</TabsTrigger>
          <TabsTrigger value="revenues">Revenus</TabsTrigger>
          <TabsTrigger value="expenses">Dépenses</TabsTrigger>
          <TabsTrigger value="invoices">Factures</TabsTrigger>
          <TabsTrigger value="companies">Sociétés</TabsTrigger>
          <TabsTrigger value="anomalies">Anomalies</TabsTrigger>
          <TabsTrigger value="history">Historique</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard title="Revenus" value={money(stats.revenue)} tone="positive" />
            <StatCard title="Dépenses" value={money(stats.expense)} tone="negative" />
            <StatCard title="Résultat" value={money(stats.result)} tone={Number(stats.result) >= 0 ? "positive" : "negative"} />
            <StatCard title="Factures payées" value={String(stats.paid_invoices)} tone="default" />
            <StatCard title="Factures en attente" value={String(stats.pending_invoices)} tone="default" />
            <StatCard title="Factures en retard" value={String(stats.overdue_invoices)} tone="warning" />
          </div>

          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-base text-navy-deep">Aperçu du journal comptable</CardTitle>
            </CardHeader>
            <CardContent>
              <OperationsTable
                rows={operationsByWeek.slice(0, 12)}
                onEdit={(row) => {
                  setOperationDraft({ ...row });
                  setOperationDialogOpen(true);
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="to_classify" className="mt-4">
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-base text-navy-deep">Opérations à classifier ({toClassifyRows.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <OperationsTable rows={toClassifyRows} onEdit={(row) => { setOperationDraft({ ...row }); setOperationDialogOpen(true); }} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenues" className="mt-4">
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader><CardTitle className="text-base text-navy-deep">Revenus ({revenueRows.length})</CardTitle></CardHeader>
            <CardContent>
              <OperationsTable rows={revenueRows} onEdit={(row) => { setOperationDraft({ ...row }); setOperationDialogOpen(true); }} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="mt-4">
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader><CardTitle className="text-base text-navy-deep">Dépenses ({expenseRows.length})</CardTitle></CardHeader>
            <CardContent>
              <OperationsTable rows={expenseRows} onEdit={(row) => { setOperationDraft({ ...row }); setOperationDialogOpen(true); }} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader><CardTitle className="text-base text-navy-deep">Factures ({invoiceRows.length})</CardTitle></CardHeader>
            <CardContent>
              <OperationsTable rows={invoiceRows} onEdit={(row) => { setOperationDraft({ ...row }); setOperationDialogOpen(true); }} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="companies" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button
              className="bg-navy text-white hover:bg-navy-deep"
              onClick={() => {
                setCompanyDraft(EMPTY_COMPANY);
                setCompanyDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />Ajouter une société
            </Button>
          </div>
          <Card className="shadow-[var(--shadow-card)]">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-secondary">
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Nom légal</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Identifiant</TableHead>
                    <TableHead>Discord</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Date d'ajout</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(companiesQ.data ?? []).map((company: any) => (
                    <TableRow key={company.id}>
                      <TableCell className="font-medium">{company.name}</TableCell>
                      <TableCell>{company.legal_name ?? "-"}</TableCell>
                      <TableCell>{company.company_type ?? "-"}</TableCell>
                      <TableCell>{company.internal_identifier ?? "-"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {company.discord_server_id && company.discord_channel_id
                          ? `${company.discord_server_id} / ${company.discord_channel_id}`
                          : "Non configuré"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={company.status === "active" ? "default" : "secondary"}>
                          {company.status === "active" ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>{dateFormat(company.added_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => {
                            setCompanyDraft({
                              id: company.id,
                              name: company.name ?? "",
                              legal_name: company.legal_name ?? "",
                              company_type: company.company_type ?? "",
                              internal_identifier: company.internal_identifier ?? "",
                              discord_server_id: company.discord_server_id ?? "",
                              discord_channel_id: company.discord_channel_id ?? "",
                              discord_channel_url: company.discord_channel_url ?? "",
                              status: company.status,
                            });
                            setCompanyDialogOpen(true);
                          }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setCompanyStatusMut.mutate({
                              id: company.id,
                              status: company.status === "active" ? "inactive" : "active",
                            })}
                          >
                            <Calculator className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => {
                            if (confirm(`Supprimer la société ${company.name} ?`)) {
                              deleteCompanyMut.mutate(company.id);
                            }
                          }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(companiesQ.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        Aucune société enregistrée.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="anomalies" className="mt-4">
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-navy-deep">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Anomalies / À classifier
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Server / Channel</TableHead>
                    <TableHead>Message ID</TableHead>
                    <TableHead>Auteur</TableHead>
                    <TableHead>Motif</TableHead>
                    <TableHead>Contenu</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(anomaliesQ.data ?? []).map((row: any) => (
                    <TableRow key={row.id}>
                      <TableCell>{dateFormat(row.occurred_at ?? row.created_at)}</TableCell>
                      <TableCell className="text-xs">{row.discord_server_id ?? "-"} / {row.discord_channel_id ?? "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{row.discord_message_id ?? "-"}</TableCell>
                      <TableCell>{row.author_name ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.anomaly_reason ?? row.processing_status}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[450px] truncate text-xs text-muted-foreground">{row.content ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                  {(anomaliesQ.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        Aucune anomalie détectée.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base text-navy-deep">Historique complet ({operationsByWeek.length})</CardTitle>
                <Button variant="outline" onClick={() => exportRowsCsv(operationsByWeek)} disabled={operationsByWeek.length === 0}>
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <OperationsTable rows={operationsByWeek} onEdit={(row) => { setOperationDraft({ ...row }); setOperationDialogOpen(true); }} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{companyDraft.id ? "Modifier la société" : "Nouvelle société"}</DialogTitle>
            <DialogDescription>
              Les informations Discord sont facultatives pour enregistrer aussi les sociétés sans intégration Discord.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <Label>Nom</Label>
              <Input value={companyDraft.name} onChange={(event) => setCompanyDraft((prev) => ({ ...prev, name: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Nom légal</Label>
              <Input value={companyDraft.legal_name} onChange={(event) => setCompanyDraft((prev) => ({ ...prev, legal_name: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Type de société</Label>
              <Input value={companyDraft.company_type} onChange={(event) => setCompanyDraft((prev) => ({ ...prev, company_type: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Identifiant interne</Label>
              <Input value={companyDraft.internal_identifier} onChange={(event) => setCompanyDraft((prev) => ({ ...prev, internal_identifier: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Statut</Label>
              <Select value={companyDraft.status} onValueChange={(value: "active" | "inactive") => setCompanyDraft((prev) => ({ ...prev, status: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Discord Server ID</Label>
              <Input value={companyDraft.discord_server_id} onChange={(event) => setCompanyDraft((prev) => ({ ...prev, discord_server_id: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Discord Channel ID</Label>
              <Input value={companyDraft.discord_channel_id} onChange={(event) => setCompanyDraft((prev) => ({ ...prev, discord_channel_id: event.target.value }))} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Discord Channel URL</Label>
              <Input value={companyDraft.discord_channel_url} onChange={(event) => setCompanyDraft((prev) => ({ ...prev, discord_channel_url: event.target.value }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCompanyDialogOpen(false)}>Annuler</Button>
            <Button className="bg-navy text-white hover:bg-navy-deep" onClick={() => upsertCompanyMut.mutate()} disabled={upsertCompanyMut.isPending || !companyDraft.name.trim()}>
              <Save className="mr-2 h-4 w-4" />Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={operationDialogOpen} onOpenChange={setOperationDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Modifier l'opération</DialogTitle>
            <DialogDescription>
              Ajustez la classification comptable sans inventer de données ambiguës.
            </DialogDescription>
          </DialogHeader>

          {operationDraft && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Société</Label>
                <Select value={operationDraft.company_id ?? "none"} onValueChange={(value) => setOperationDraft((prev: any) => ({ ...prev, company_id: value === "none" ? null : value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Non renseignée</SelectItem>
                    {(companiesQ.data ?? []).map((company: any) => (
                      <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={operationDraft.entry_side ?? "unclassified"} onValueChange={(value) => setOperationDraft((prev: any) => ({ ...prev, entry_side: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="revenue">Revenu</SelectItem>
                    <SelectItem value="expense">Dépense</SelectItem>
                    <SelectItem value="unclassified">À classifier</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Numéro facture</Label>
                <Input value={operationDraft.invoice_number ?? ""} onChange={(event) => setOperationDraft((prev: any) => ({ ...prev, invoice_number: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Client / Fournisseur</Label>
                <Input value={operationDraft.counterparty ?? ""} onChange={(event) => setOperationDraft((prev: any) => ({ ...prev, counterparty: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Montant</Label>
                <Input type="number" value={operationDraft.amount ?? ""} onChange={(event) => setOperationDraft((prev: any) => ({ ...prev, amount: event.target.value ? Number(event.target.value) : null }))} />
              </div>
              <div className="space-y-1">
                <Label>Devise</Label>
                <Input value={operationDraft.currency ?? "EUR"} onChange={(event) => setOperationDraft((prev: any) => ({ ...prev, currency: event.target.value }))} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Description</Label>
                <Input value={operationDraft.description ?? ""} onChange={(event) => setOperationDraft((prev: any) => ({ ...prev, description: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Statut</Label>
                <Input value={operationDraft.status ?? ""} onChange={(event) => setOperationDraft((prev: any) => ({ ...prev, status: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Classification requise</Label>
                <Select value={operationDraft.needs_classification ? "yes" : "no"} onValueChange={(value) => setOperationDraft((prev: any) => ({ ...prev, needs_classification: value === "yes" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Oui</SelectItem>
                    <SelectItem value="no">Non</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOperationDialogOpen(false)}>Annuler</Button>
            <Button className="bg-navy text-white hover:bg-navy-deep" onClick={() => updateOperationMut.mutate()} disabled={updateOperationMut.isPending || !operationDraft?.id}>
              <Save className="mr-2 h-4 w-4" />Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function StatCard({ title, value, tone }: { title: string; value: string; tone: "positive" | "negative" | "warning" | "default" }) {
  const toneClass = tone === "positive"
    ? "text-emerald-700"
    : tone === "negative"
      ? "text-red-700"
      : tone === "warning"
        ? "text-amber-700"
        : "text-navy-deep";

  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-navy text-gold">
          <Building2 className="h-4 w-4" />
        </div>
        <div>
          <div className={`font-display text-2xl font-bold ${toneClass}`}>{value}</div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function OperationsTable({ rows, onEdit }: { rows: any[]; onEdit: (row: any) => void }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Semaine</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Société</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Facture</TableHead>
          <TableHead>Client/Fournisseur</TableHead>
          <TableHead className="text-right">Montant</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead>Source</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="text-xs text-muted-foreground">{weekLabelForRow(row)}</TableCell>
            <TableCell>{dateFormat(row.operation_date ?? row.created_at)}</TableCell>
            <TableCell>{row.company_name ?? "-"}</TableCell>
            <TableCell>
              <Badge variant="outline">
                {row.entry_side === "revenue" ? "Revenu" : row.entry_side === "expense" ? "Dépense" : "À classifier"}
              </Badge>
            </TableCell>
            <TableCell className="font-mono text-xs">{row.invoice_number ?? "-"}</TableCell>
            <TableCell>{row.counterparty ?? "-"}</TableCell>
            <TableCell className="text-right font-medium">{money(row.amount, row.currency ?? "EUR")}</TableCell>
            <TableCell>{row.status ?? "-"}</TableCell>
            <TableCell>{row.source ?? "manual"}</TableCell>
            <TableCell className="text-right">
              <Button size="sm" variant="outline" onClick={() => onEdit(row)}>
                <Pencil className="mr-1 h-3.5 w-3.5" />Modifier
              </Button>
            </TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
              Aucune opération trouvée pour ces filtres.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
