import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  clientId: z.string().min(1),
  contractId: z.string().nullish(),
  number: z.string().min(1),
  amountPaise: z.number().positive(),
  dueDate: z.string().nullish(),
  status: z.enum(["Draft", "Sent", "Due", "Paid", "Void"]).default("Sent"),
});

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["Draft", "Sent", "Due", "Paid", "Void"]).optional(),
  dueDate: z.string().nullish(),
});

export async function GET(req: Request) {
  try {
    await requireRole("finance.view");

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const clientId = searchParams.get("clientId");

    const where: any = { deletedAt: null };
    if (status && status !== "ALL") {
      where.status = status;
    }
    if (clientId) {
      where.clientId = clientId;
    }

    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, name: true } },
        contract: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ ok: true, invoices });
  } catch (err: any) {
    const status = err.status ?? 500;
    return NextResponse.json({ error: err.message || "Failed to fetch invoices" }, { status });
  }
}

export async function POST(req: Request) {
  try {
    await requireRole("finance.manage");

    const body = await req.json();
    const parsed = createSchema.parse(body);

    const invoice = await prisma.invoice.create({
      data: {
        clientId: parsed.clientId,
        contractId: parsed.contractId || null,
        number: parsed.number,
        amountPaise: parsed.amountPaise,
        status: parsed.status,
        dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
        issuedAt: new Date(),
      },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ ok: true, invoice });
  } catch (err: any) {
    const status = err.status ?? 400;
    return NextResponse.json({ error: err.message || "Failed to create invoice" }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    await requireRole("finance.manage");

    const body = await req.json();
    const parsed = patchSchema.parse(body);

    const data: any = {};
    if (parsed.status) data.status = parsed.status;
    if (parsed.dueDate !== undefined) data.dueDate = parsed.dueDate ? new Date(parsed.dueDate) : null;

    const invoice = await prisma.invoice.update({
      where: { id: parsed.id },
      data,
    });

    return NextResponse.json({ ok: true, invoice });
  } catch (err: any) {
    const status = err.status ?? 400;
    return NextResponse.json({ error: err.message || "Failed to update invoice" }, { status });
  }
}
