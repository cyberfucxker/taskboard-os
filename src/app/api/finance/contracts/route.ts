import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createContractSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1),
  valuePaise: z.number().positive(),
  // Contract.billingCycle is a free-form String column in the schema, not a
  // Prisma enum -- this used to force UPPER_SNAKE values the UI never sent
  // (it sends "Monthly"/"Quarterly"/etc.), so every contract creation 400'd.
  billingCycle: z.string().min(1).default("Monthly"),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  status: z.enum(["DRAFT", "ACTIVE", "SUSPENDED", "EXPIRED", "TERMINATED"]).default("ACTIVE"),
});

export async function GET(req: Request) {
  try {
    await requireRole("finance.view");

    const contracts = await prisma.contract.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, name: true } },
        invoices: { where: { deletedAt: null }, select: { id: true, number: true, amountPaise: true, status: true } },
      },
    });

    return NextResponse.json({ ok: true, contracts });
  } catch (err: any) {
    const status = err.status ?? 500;
    return NextResponse.json({ error: err.message || "Failed to fetch contracts" }, { status });
  }
}

export async function POST(req: Request) {
  try {
    await requireRole("finance.manage");

    const body = await req.json();
    const parsed = createContractSchema.parse(body);

    const contract = await prisma.contract.create({
      data: {
        clientId: parsed.clientId,
        name: parsed.name,
        valuePaise: parsed.valuePaise,
        billingCycle: parsed.billingCycle,
        startDate: parsed.startDate ? new Date(parsed.startDate) : new Date(),
        endDate: parsed.endDate ? new Date(parsed.endDate) : null,
        status: parsed.status,
      },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ ok: true, contract });
  } catch (err: any) {
    const status = err.status ?? 400;
    return NextResponse.json({ error: err.message || "Failed to create contract" }, { status });
  }
}
