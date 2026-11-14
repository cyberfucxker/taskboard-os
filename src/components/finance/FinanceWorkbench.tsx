"use client";

import { useEffect, useState, useTransition } from "react";
import { ListToolbar, NoMatches, matchesTokens, useListFilter } from "@/components/list";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  Plus,
  FileText,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  Filter,
  X,
  ChevronDown,
  Building2,
  Calendar,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import { Card, Badge, SectionLabel, Dot } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { fmtCompact } from "@/lib/utils";
import { EntityLink } from "@/components/entity/EntityLink";
import { cn } from "@/lib/cn";

export interface InvoiceItem {
  id: string;
  number: string;
  clientId: string;
  client: { id: string; name: string; code?: string | null };
  contractId?: string | null;
  contract?: { id: string; name: string } | null;
  amountPaise: number | null;
  status: "Draft" | "Sent" | "Due" | "Paid" | "Void" | string;
  dueDate: string | null;
  issuedAt: string | null;
}

export interface ContractItem {
  id: string;
  name: string;
  clientId: string;
  client: { id: string; name: string; code?: string | null };
  valuePaise: number | null;
  billingCycle: string | null;
  startDate: string | null;
  endDate: string | null;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED" | string;
}

export interface ClientOption {
  id: string;
  name: string;
}

export function FinanceWorkbench({
  initialInvoices,
  initialContracts,
  clients,
}: {
  initialInvoices: InvoiceItem[];
  initialContracts: ContractItem[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<"invoices" | "contracts" | "cashflow">("invoices");
  const [invoices, setInvoices] = useState<InvoiceItem[]>(initialInvoices);
  const [contracts, setContracts] = useState<ContractItem[]>(initialContracts);
  // Realtime: fresh server props replace the local copies.
  useEffect(() => { setInvoices(initialInvoices); }, [initialInvoices]);
  useEffect(() => { setContracts(initialContracts); }, [initialContracts]);

  const ff = useListFilter(invoices, (i) => [i.number, i.client?.name, i.contract?.name, i.status].filter(Boolean).join(" "));
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [showCreateContract, setShowCreateContract] = useState(false);

  // Financial calculations
  const totalContractMRR = contracts
    .filter((c) => c.status === "ACTIVE")
    .reduce((sum, c) => sum + (c.valuePaise ? Number(c.valuePaise) : 0), 0);

  const totalOutstanding = invoices
    .filter((i) => i.status === "Sent" || i.status === "Due")
    .reduce((sum, i) => sum + (i.amountPaise ? Number(i.amountPaise) : 0), 0);

  const totalPaid = invoices
    .filter((i) => i.status === "Paid")
    .reduce((sum, i) => sum + (i.amountPaise ? Number(i.amountPaise) : 0), 0);

  const activeContractCount = contracts.filter((c) => c.status === "ACTIVE").length;

  // Filtered invoices (text filter + status filter)
  const filteredInvoices = ff.filtered.filter((i) => statusFilter === "ALL" || i.status === statusFilter);

  // Filtered contracts
  const filteredContracts = contracts.filter(
    (c) =>
      matchesTokens([c.name, c.client?.name, c.billingCycle, c.status].filter(Boolean).join(" "), ff.tokens) &&
      (statusFilter === "ALL" || c.status === statusFilter)
  );

  async function updateInvoiceStatus(invoiceId: string, nextStatus: string) {
    try {
      const res = await fetch("/api/finance/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: invoiceId, status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Update failed");

      toast(`Invoice marked as ${nextStatus}`, "success");
      setInvoices((prev) => prev.map((i) => (i.id === invoiceId ? { ...i, status: nextStatus } : i)));
      startTransition(() => router.refresh());
    } catch (err: any) {
      toast(err.message || "Failed to update invoice", "error");
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-5">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-edge pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[16px] font-medium text-ink">Finance & Commercial Ledger</h1>
          </div>
          </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateContract(true)}
 className="flex items-center gap-1.5 rounded-md border border-edge bg-raised h-8 px-3 text-[13px] font-medium text-ink transition"
          >
            <FileText className="h-3.5 w-3.5 text-tealhi" />
            New Contract
          </button>
          <button
            onClick={() => setShowCreateInvoice(true)}
 className="flex items-center gap-1.5 rounded-md bg-teal h-8 px-3 text-[13px] font-medium text-white hover:bg-tealhi transition"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Invoice
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="min-w-0 border-l border-line pl-3">
          <div className="text-[12px] text-muted">Active Contract MRR</div>
          <div className="mt-1.5 tnum text-[20px] font-medium text-tealhi">
            ₹{fmtCompact(totalContractMRR)}
          </div>
        </div>

        <div className="min-w-0 border-l border-line pl-3">
          <div className="text-[12px] text-muted">Outstanding / Due</div>
          <div className="mt-1.5 tnum text-[20px] font-medium text-amber">
            ₹{fmtCompact(totalOutstanding)}
          </div>
        </div>

        <div className="min-w-0 border-l border-line pl-3">
          <div className="text-[12px] text-muted">Total Realized Collections</div>
          <div className="mt-1.5 tnum text-[20px] font-medium text-emerald">
            ₹{fmtCompact(totalPaid)}
          </div>
        </div>

        <div className="min-w-0 border-l border-line pl-3">
          <div className="text-[12px] text-muted">Billing Health</div>
          <div className="mt-1.5 tnum text-[20px] font-medium text-ink">
            {invoices.length > 0
              ? `${Math.round((invoices.filter((i) => i.status === "Paid").length / invoices.length) * 100)}%`
              : "100%"}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-edge">
        <div className="flex gap-4">
          <button
            onClick={() => {
              setActiveTab("invoices");
              setStatusFilter("ALL");
            }}
            className={cn(
              "h-7 rounded-full px-3 text-[13px] font-medium transition",
              activeTab === "invoices"
                ? "bg-hover text-ink"
                : "text-muted hover:bg-hover hover:text-ink"
            )}
          >
            Invoices Ledger ({invoices.length})
          </button>
          <button
            onClick={() => {
              setActiveTab("contracts");
              setStatusFilter("ALL");
            }}
            className={cn(
              "h-7 rounded-full px-3 text-[13px] font-medium transition",
              activeTab === "contracts"
                ? "bg-hover text-ink"
                : "text-muted hover:bg-hover hover:text-ink"
            )}
          >
            Client Contracts ({contracts.length})
          </button>
          <button
            onClick={() => setActiveTab("cashflow")}
            className={cn(
              "h-7 rounded-full px-3 text-[13px] font-medium transition",
              activeTab === "cashflow"
                ? "bg-hover text-ink"
                : "text-muted hover:bg-hover hover:text-ink"
            )}
          >
            Account Breakdown & Analytics
          </button>
        </div>

      </div>

      {/* Filter bar for tabular views (sticky) */}
      {activeTab !== "cashflow" && (
        <ListToolbar
          sticky
          filter={ff}
          shown={activeTab === "invoices" ? filteredInvoices.length : filteredContracts.length}
          total={activeTab === "invoices" ? invoices.length : contracts.length}
          noun={activeTab === "invoices" ? "invoices" : "contracts"}
          placeholder={activeTab === "invoices" ? "Filter invoices…" : "Filter contracts…"}
          className="rounded-lg border border-line"
        >
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 rounded-md border border-edge bg-transparent px-2.5 tnum text-[11px] text-ink outline-none focus:border-teal"
            >
              <option value="ALL">All Statuses</option>
              {activeTab === "invoices" ? (
                <>
                  <option value="Sent">Sent</option>
                  <option value="Due">Due</option>
                  <option value="Paid">Paid</option>
                  <option value="Draft">Draft</option>
                  <option value="Void">Void</option>
                </>
              ) : (
                <>
                  <option value="ACTIVE">Active</option>
                  <option value="DRAFT">Draft</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="EXPIRED">Expired</option>
                  <option value="TERMINATED">Terminated</option>
                </>
              )}
            </select>
        </ListToolbar>
      )}

      {/* Tab 1: Invoices Ledger */}
      {activeTab === "invoices" && (
        <div>
          <div className="grid grid-cols-12 border-b border-line px-1 pb-2 text-[12px] font-medium text-muted">
            <span className="col-span-3">Invoice & client</span>
            <span className="col-span-3">Contract</span>
            <span className="col-span-2">Due date</span>
            <span className="col-span-2 text-right">Amount (inr)</span>
            <span className="col-span-2 text-right">Status & action</span>
          </div>

          {filteredInvoices.map((inv) => {
            const statusColor =
              inv.status === "Paid"
                ? "text-emerald bg-emerald/10"
                : inv.status === "Due"
                ? "text-crimson bg-crimson/10"
                : inv.status === "Sent"
                ? "text-amber bg-amber/10"
                : "text-muted bg-hover border-edge";

            return (
              <div
                key={inv.id}
                className="grid min-h-[44px] grid-cols-12 items-center border-b border-line px-1 py-2 text-[13px] hover:bg-hover transition"
              >
                <div className="col-span-3">
                  <div className="tnum font-medium text-tealhi">{inv.number}</div>
                  <div className="mt-0.5 text-[12px] text-ink">{inv.client?.name ?? "—"}</div>
                </div>

                <div className="col-span-3 text-[12px] text-muted">
                  {inv.contract?.name ?? <span className="tnum text-[11px] text-edge">Direct Billing</span>}
                </div>

                <div className="col-span-2 tnum text-[11px] text-muted">
                  {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-IN") : "—"}
                </div>

                <div className="col-span-2 text-right tnum font-semibold text-ink">
                  ₹{inv.amountPaise ? (Number(inv.amountPaise) / 100).toLocaleString("en-IN") : "0"}
                </div>

                <div className="col-span-2 flex items-center justify-end gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 tnum text-[11px]", statusColor)}>
                    {inv.status}
                  </span>

                  {inv.status !== "Paid" && (
                    <button
                      onClick={() => updateInvoiceStatus(inv.id, "Paid")}
                      className="rounded bg-emerald/15 px-2 py-1 text-[11px] font-semibold text-emerald hover:bg-emerald/30 transition"
                      title="Mark as Paid"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {inv.status === "Paid" && (
                    <button
                      onClick={() => updateInvoiceStatus(inv.id, "Due")}
                      className="rounded bg-amber/15 px-2 py-1 text-[11px] font-semibold text-amber hover:bg-amber/30 transition"
                      title="Mark as Due"
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {filteredInvoices.length === 0 && (
            ff.active ? <NoMatches filter={ff} /> : (
            <div className="p-8 text-center text-[13px] text-muted">
              No invoices found matching the current filter.
            </div>)
          )}
</div>
      )}

      {/* Tab 2: Client Contracts */}
      {activeTab === "contracts" && (
        <div>
          <div className="grid grid-cols-12 border-b border-line px-1 pb-2 text-[12px] font-medium text-muted">
            <span className="col-span-4">Contract & client</span>
            <span className="col-span-3">Billing cycle</span>
            <span className="col-span-2">Duration</span>
            <span className="col-span-3 text-right">Value (inr) & status</span>
          </div>

          {filteredContracts.map((c) => (
            <div
              key={c.id}
              className="grid min-h-[44px] grid-cols-12 items-center border-b border-line px-1 py-2 text-[13px] hover:bg-hover transition"
            >
              <div className="col-span-4">
                <div className="font-medium text-ink">{c.name}</div>
                <div className="mt-0.5 text-[12px] text-tealhi">{c.client?.name ?? "—"}</div>
              </div>

              <div className="col-span-3 tnum text-[12px] text-muted">
                {c.billingCycle ?? "Monthly Retainer"}
              </div>

              <div className="col-span-2 tnum text-[11px] text-muted">
                {c.startDate ? new Date(c.startDate).toLocaleDateString("en-IN") : "Ongoing"}
              </div>

              <div className="col-span-3 flex items-center justify-end gap-3">
                <span className="tnum font-semibold text-emerald">
                  ₹{c.valuePaise ? (Number(c.valuePaise) / 100).toLocaleString("en-IN") : "—"}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 tnum text-[11px]",
                    c.status === "ACTIVE"
                      ? "text-emerald bg-emerald/10"
                      : "text-muted bg-hover border-edge"
                  )}
                >
                  {c.status}
                </span>
              </div>
            </div>
          ))}

          {filteredContracts.length === 0 && (
            ff.active ? <NoMatches filter={ff} /> : <div className="p-8 text-center text-[13px] text-muted">No contracts found.</div>
          )}
</div>
      )}

      {/* Tab 3: Account Breakdown & Analytics */}
      {activeTab === "cashflow" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="py-3">
            <SectionLabel>Client Revenue Distribution</SectionLabel>
            <div className="mt-4 space-y-3">
              {clients.map((client) => {
                const clientContracts = contracts.filter((c) => c.clientId === client.id && c.status === "ACTIVE");
                const totalVal = clientContracts.reduce((s, c) => s + (c.valuePaise ? Number(c.valuePaise) : 0), 0);
                if (totalVal === 0 && clientContracts.length === 0) return null;

                const maxMRR = Math.max(1, totalContractMRR);
                const pct = (totalVal / maxMRR) * 100;

                return (
                  <div key={client.id} className="space-y-1">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-medium text-ink">{client.name}</span>
                      <span className="tnum text-tealhi">₹{fmtCompact(totalVal)}/mo</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-hover">
                      <div className="h-full bg-tealhi" style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="py-3">
            <SectionLabel>Settlement & Aging Breakdown</SectionLabel>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-edge bg-bg p-3">
                <div className="flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full bg-emerald" />
                  <div>
                    <div className="text-[13px] font-medium text-ink">Realized / Paid</div>
                    <div className="text-[11px] text-muted">Cleared invoices</div>
                  </div>
                </div>
                <div className="font-mono text-sm font-semibold text-emerald">₹{fmtCompact(totalPaid)}</div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-edge bg-bg p-3">
                <div className="flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full bg-amber" />
                  <div>
                    <div className="text-[13px] font-medium text-ink">Outstanding / Due</div>
                    <div className="text-[11px] text-muted">Current billing cycle</div>
                  </div>
                </div>
                <div className="tnum text-sm font-semibold text-amber">₹{fmtCompact(totalOutstanding)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Invoice */}
      {showCreateInvoice && (
        <CreateInvoiceModal
          clients={clients}
          contracts={contracts}
          onClose={() => setShowCreateInvoice(false)}
          onCreated={(newInv) => {
            setInvoices((prev) => [newInv, ...prev]);
            setShowCreateInvoice(false);
            startTransition(() => router.refresh());
          }}
        />
      )}

      {/* Modal: Create Contract */}
      {showCreateContract && (
        <CreateContractModal
          clients={clients}
          onClose={() => setShowCreateContract(false)}
          onCreated={(newContract) => {
            setContracts((prev) => [newContract, ...prev]);
            setShowCreateContract(false);
            startTransition(() => router.refresh());
          }}
        />
      )}
    </div>
  );
}

function CreateInvoiceModal({
  clients,
  contracts,
  onClose,
  onCreated,
}: {
  clients: ClientOption[];
  contracts: ContractItem[];
  onClose: () => void;
  onCreated: (inv: InvoiceItem) => void;
}) {
  const toast = useToast();
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const [contractId, setContractId] = useState("");
  const [number, setNumber] = useState(`INV-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
  const [amountRupees, setAmountRupees] = useState("50000");
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  const [status, setStatus] = useState("Sent");
  const [saving, setSaving] = useState(false);

  const availableContracts = contracts.filter((c) => c.clientId === clientId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || !number || !amountRupees) {
      toast("Please fill all required fields", "error");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/finance/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          contractId: contractId || null,
          number,
          amountPaise: Math.round(parseFloat(amountRupees) * 100),
          dueDate: dueDate || null,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to create invoice");

      toast("Invoice generated successfully", "success");
      onCreated(data.invoice);
    } catch (err: any) {
      toast(err.message || "Failed to create invoice", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-[10px] border border-edge bg-raised p-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-edge pb-3 mb-4">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-tealhi" />
            <h2 className="text-[15px] font-semibold text-ink">Generate Client Invoice</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="mb-1 block tnum text-[11px] text-muted">CLIENT ACCOUNT</label>
            <select
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setContractId("");
              }}
              className="w-full rounded-lg border border-edge bg-transparent px-3 py-2 text-[13px] text-ink outline-none focus:border-teal"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block tnum text-[11px] text-muted">LINKED CONTRACT (OPTIONAL)</label>
            <select
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
              className="w-full rounded-lg border border-edge bg-transparent px-3 py-2 text-[13px] text-ink outline-none focus:border-teal"
            >
              <option value="">None / One-time Deliverable</option>
              {availableContracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (₹{c.valuePaise ? fmtCompact(Number(c.valuePaise)) : "0"})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block tnum text-[11px] text-muted">INVOICE NUMBER</label>
              <input
                type="text"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className="w-full rounded-lg border border-edge bg-transparent px-3 py-2 tnum text-[13px] text-ink outline-none focus:border-teal"
              />
            </div>

            <div>
              <label className="mb-1 block tnum text-[11px] text-muted">AMOUNT (INR ₹)</label>
              <input
                type="number"
                value={amountRupees}
                onChange={(e) => setAmountRupees(e.target.value)}
                className="w-full rounded-lg border border-edge bg-transparent px-3 py-2 tnum text-[13px] text-ink outline-none focus:border-teal"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block tnum text-[11px] text-muted">DUE DATE</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-edge bg-transparent px-3 py-2 text-[12px] text-ink outline-none focus:border-teal"
              />
            </div>

            <div>
              <label className="mb-1 block tnum text-[11px] text-muted">INITIAL STATUS</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-edge bg-transparent px-3 py-2 text-[12px] text-ink outline-none focus:border-teal"
              >
                <option value="Sent">Sent</option>
                <option value="Due">Due</option>
                <option value="Paid">Paid</option>
                <option value="Draft">Draft</option>
              </select>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2 pt-3 border-t border-edge">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-edge px-3.5 py-2 text-[12px] text-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
 className="rounded-md bg-teal h-8 px-3 text-[13px] font-medium text-white hover:bg-tealhi disabled:opacity-50"
            >
              {saving ? "Generating..." : "Generate Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateContractModal({
  clients,
  onClose,
  onCreated,
}: {
  clients: ClientOption[];
  onClose: () => void;
  onCreated: (c: ContractItem) => void;
}) {
  const toast = useToast();
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const [name, setName] = useState("Full-Stack Retainer Agreement");
  const [valueRupees, setValueRupees] = useState("100000");
  const [billingCycle, setBillingCycle] = useState("Monthly");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || !name || !valueRupees) {
      toast("Please fill all required fields", "error");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/finance/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          name,
          valuePaise: Math.round(parseFloat(valueRupees) * 100),
          billingCycle,
          startDate,
          status: "ACTIVE",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to create contract");

      toast("Contract created successfully", "success");
      onCreated(data.contract);
    } catch (err: any) {
      toast(err.message || "Failed to create contract", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-[10px] border border-edge bg-raised p-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-edge pb-3 mb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-tealhi" />
            <h2 className="text-[15px] font-semibold text-ink">New Client Contract</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="mb-1 block tnum text-[11px] text-muted">CLIENT ACCOUNT</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full rounded-lg border border-edge bg-transparent px-3 py-2 text-[13px] text-ink outline-none focus:border-teal"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block tnum text-[11px] text-muted">CONTRACT TITLE</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-edge bg-transparent px-3 py-2 text-[13px] text-ink outline-none focus:border-teal"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block tnum text-[11px] text-muted">VALUE (INR ₹)</label>
              <input
                type="number"
                value={valueRupees}
                onChange={(e) => setValueRupees(e.target.value)}
                className="w-full rounded-lg border border-edge bg-transparent px-3 py-2 tnum text-[13px] text-ink outline-none focus:border-teal"
              />
            </div>

            <div>
              <label className="mb-1 block tnum text-[11px] text-muted">BILLING CYCLE</label>
              <select
                value={billingCycle}
                onChange={(e) => setBillingCycle(e.target.value)}
                className="w-full rounded-lg border border-edge bg-transparent px-3 py-2 text-[12px] text-ink outline-none focus:border-teal"
              >
                <option value="Monthly">Monthly Retainer</option>
                <option value="Milestone">Milestone Basis</option>
                <option value="Quarterly">Quarterly</option>
                <option value="Annual">Annual</option>
                <option value="One-time">One-time Project</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block tnum text-[11px] text-muted">START DATE</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-edge bg-transparent px-3 py-2 text-[12px] text-ink outline-none focus:border-teal"
            />
          </div>

          <div className="mt-5 flex justify-end gap-2 pt-3 border-t border-edge">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-edge px-3.5 py-2 text-[12px] text-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
 className="rounded-md bg-teal h-8 px-3 text-[13px] font-medium text-white hover:bg-tealhi disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create Contract"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
