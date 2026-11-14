import { guardPage } from "@/lib/pages";
import { prisma } from "@/lib/db";
import { FinanceWorkbench, type InvoiceItem, type ContractItem, type ClientOption } from "@/components/finance/FinanceWorkbench";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  await guardPage("Finance");

  const [contracts, invoices, clients] = await Promise.all([
    prisma.contract.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, name: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, name: true } },
        contract: { select: { id: true, name: true } },
      },
    }),
    prisma.client.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const formattedInvoices: InvoiceItem[] = invoices.map((i) => ({
    id: i.id,
    number: i.number,
    clientId: i.clientId,
    client: i.client,
    contractId: i.contractId,
    contract: i.contract,
    amountPaise: i.amountPaise ? Number(i.amountPaise) : 0,
    status: i.status,
    dueDate: i.dueDate?.toISOString() ?? null,
    issuedAt: i.issuedAt?.toISOString() ?? null,
  }));

  const formattedContracts: ContractItem[] = contracts.map((c) => ({
    id: c.id,
    name: c.name,
    clientId: c.clientId,
    client: c.client,
    valuePaise: c.valuePaise ? Number(c.valuePaise) : 0,
    billingCycle: c.billingCycle,
    startDate: c.startDate?.toISOString() ?? null,
    endDate: c.endDate?.toISOString() ?? null,
    status: c.status,
  }));

  return (
    <FinanceWorkbench
      initialInvoices={formattedInvoices}
      initialContracts={formattedContracts}
      clients={clients}
    />
  );
}
