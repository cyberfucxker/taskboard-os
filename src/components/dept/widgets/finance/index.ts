import type { DeptWidget } from "../../types";
import { asComponent } from "../lane-d-kit";
import { FinanceStats, HoursVsBilled, InvoicesDue, ReceivablesByClient } from "./components";

/** Finance: "Who owes what?" Every metric is gated on finance.view; others see a designed denied state. */
export const widgets: DeptWidget[] = [
  { id: "finance-stats", title: "Summary", span: 2, Component: asComponent(FinanceStats) },
  { id: "finance-receivables", title: "Receivables by client", Component: asComponent(ReceivablesByClient) },
  { id: "finance-due", title: "Invoices due", Component: asComponent(InvoicesDue) },
  { id: "finance-hours", title: "Project hours vs billed", span: 2, Component: asComponent(HoursVsBilled) },
];

export default widgets;
