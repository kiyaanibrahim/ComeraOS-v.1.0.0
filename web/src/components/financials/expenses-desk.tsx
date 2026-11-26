"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { DatePicker } from "@/components/date-picker"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import type { DataTableFeatures } from "@/components/data-table/data-table-features"
import { FinanceScreen, FinanceSelect, FinanceTable, FinanceTabs, MetricRow, TabsContent } from "@/components/financials/finance-shell"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/sonner"
import { money, statusLabel } from "@/lib/flow/format"
import { callRpc } from "@/lib/flow/rpc"
import type { BusinessRecord, FlowClient } from "@/lib/flow/use-business"
import { dayKey, seriesWithDelta } from "@/lib/stat-series"

type ExpenseRow = {
  id: string
  vendor: string
  category: string
  amount: number
  amount_paid: number
  status: string
  source: string
  spent_on: string
  due_on: string | null
  schedule_id: string | null
  loan_id: string | null
  principal_amount: number
  interest_amount: number
}

type ScheduleRow = {
  id: string
  vendor: string
  category: string
  amount: number
  frequency: string
  kind: string
  status: string
  next_on: string
  installment_count: number | null
  generated_count: number
  loan_id: string | null
}

type PaymentRow = {
  id: string
  expense_id: string
  amount: number
  paid_on: string
  method: string
}

const emptyExpense = {
  vendor: "",
  category: "Operating",
  amount: "",
  type: "one_time" as "one_time" | "fixed" | "ongoing",
  frequency: "monthly",
  startOn: undefined as Date | undefined,
  endOn: undefined as Date | undefined,
  installments: "",
}

export function ExpensesDesk({ businessKey }: { businessKey: string }) {
  return (
    <FinanceScreen
      businessKey={businessKey}
      title="Expenses"
      description="One-time costs, recurring commitments, payroll posts, and loan installments."
    >
      {({ business, supabase }) => <ExpensesBody business={business} supabase={supabase} />}
    </FinanceScreen>
  )
}

function ExpensesBody({ business, supabase }: { business: BusinessRecord; supabase: FlowClient }) {
  const [tab, setTab] = useState("all")
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [schedules, setSchedules] = useState<ScheduleRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(emptyExpense)
  const [open, setOpen] = useState<ExpenseRow | null>(null)
  const [payAmount, setPayAmount] = useState("")

  const load = useCallback(async () => {
    const [expenseRes, scheduleRes, payRes] = await Promise.all([
      supabase
        .from("expenses")
        .select("id, vendor, category, amount, amount_paid, status, source, spent_on, due_on, schedule_id, loan_id, principal_amount, interest_amount")
        .eq("business_id", business.id)
        .order("spent_on", { ascending: false })
        .limit(500),
      supabase
        .from("expense_schedules")
        .select("id, vendor, category, amount, frequency, kind, status, next_on, installment_count, generated_count, loan_id")
        .eq("business_id", business.id)
        .order("next_on"),
      supabase.from("expense_payments").select("id, expense_id, amount, paid_on, method").eq("business_id", business.id),
    ])
    const error = expenseRes.error || scheduleRes.error || payRes.error
    if (error) toast.error(error.message)
    setRows((expenseRes.data ?? []) as ExpenseRow[])
    setSchedules((scheduleRes.data ?? []) as ScheduleRow[])
    setPayments((payRes.data ?? []) as PaymentRow[])
  }, [business.id, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const total = rows.filter((row) => row.status !== "void").reduce((sum, row) => sum + Number(row.amount), 0)
  const paid = rows.reduce((sum, row) => sum + Number(row.amount_paid), 0)
  const outstanding = Math.max(total - paid, 0)
  const monthly = schedules
    .filter((row) => row.status === "active")
    .reduce((sum, row) => {
      const amount = Number(row.amount)
      if (row.frequency === "weekly") return sum + amount * (52 / 12)
      if (row.frequency === "quarterly") return sum + amount / 3
      if (row.frequency === "yearly") return sum + amount / 12
      return sum + amount
    }, 0)
  const spendSeries = useMemo(
    () =>
      seriesWithDelta(
        rows
          .filter((row) => row.status !== "void")
          .map((row) => ({ day: dayKey(row.spent_on), amount: Number(row.amount) })),
      ),
    [rows],
  )
  const paidSeries = useMemo(
    () =>
      seriesWithDelta(payments.map((row) => ({ day: dayKey(row.paid_on), amount: Number(row.amount) }))),
    [payments],
  )

  const columns = useMemo<ColumnDef<DataTableFeatures, ExpenseRow>[]>(
    () => [
      { accessorKey: "vendor", header: ({ column }) => <DataTableColumnHeader column={column} title="Vendor" />, filterFn: "includesString" },
      { accessorKey: "category", header: ({ column }) => <DataTableColumnHeader column={column} title="Category" /> },
      {
        accessorKey: "source",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
        cell: ({ row }) => statusLabel(row.original.source === "loan" ? "loan repayment" : row.original.source),
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        meta: { align: "right" },
        accessorKey: "amount",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
        cell: ({ row }) => <div className="text-right tabular-nums">{money(Number(row.original.amount), business.currency)}</div>,
      },
      {
        id: "open",
        header: "",
        cell: ({ row }) => (
          <Button size="sm" variant="outline" onClick={() => { setOpen(row.original); setPayAmount("") }}>
            Open
          </Button>
        ),
      },
    ],
    [business.currency],
  )

  const scheduleColumns = useMemo<ColumnDef<DataTableFeatures, ScheduleRow>[]>(
    () => [
      { accessorKey: "vendor", header: ({ column }) => <DataTableColumnHeader column={column} title="Vendor" />, filterFn: "includesString" },
      { accessorKey: "frequency", header: ({ column }) => <DataTableColumnHeader column={column} title="Frequency" /> },
      { accessorKey: "kind", header: ({ column }) => <DataTableColumnHeader column={column} title="Kind" /> },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        meta: { align: "right" },
        accessorKey: "amount",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
        cell: ({ row }) => <div className="text-right tabular-nums">{money(Number(row.original.amount), business.currency)}</div>,
      },
      { accessorKey: "next_on", header: ({ column }) => <DataTableColumnHeader column={column} title="Next" /> },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex gap-1">
            {row.original.status === "active" ? (
              <Button size="xs" variant="outline" onClick={() => void setStatus(row.original.id, "paused")}>
                Pause
              </Button>
            ) : null}
            {row.original.status === "paused" ? (
              <Button size="xs" variant="outline" onClick={() => void setStatus(row.original.id, "active")}>
                Resume
              </Button>
            ) : null}
            {row.original.status !== "discontinued" ? (
              <Button size="xs" variant="ghost" onClick={() => void setStatus(row.original.id, "discontinued")}>
                Stop
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [business.currency],
  )

  async function setStatus(id: string, status: string) {
    try {
      await callRpc(supabase, "set_expense_schedule_status", {
        p_business_id: business.id,
        p_schedule_id: id,
        p_status: status,
      })
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update schedule")
    }
  }

  async function create() {
    try {
      if (form.type === "one_time") {
        await callRpc(supabase, "create_manual_expense", {
          p_business_id: business.id,
          p_vendor: form.vendor,
          p_category: form.category,
          p_amount: Number(form.amount),
        })
      } else {
        await callRpc(supabase, "create_expense_schedule", {
          p_business_id: business.id,
          p_vendor: form.vendor,
          p_category: form.category,
          p_amount: Number(form.amount),
          p_frequency: form.frequency,
          p_kind: form.type,
          p_start_on: form.startOn ? form.startOn.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          p_end_on: form.type === "fixed" && form.endOn ? form.endOn.toISOString().slice(0, 10) : undefined,
          p_installment_count: form.type === "fixed" && form.installments ? Number(form.installments) : undefined,
        })
      }
      setCreateOpen(false)
      setForm(emptyExpense)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create expense")
    }
  }

  async function pay() {
    if (!open) return
    try {
      await callRpc(supabase, "pay_expense", {
        p_business_id: business.id,
        p_expense_id: open.id,
        p_amount: Number(payAmount),
      })
      setPayAmount("")
      await load()
      setOpen(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record payment")
    }
  }

  const openPays = payments.filter((row) => open && row.expense_id === open.id)
  const remaining = open ? Math.max(Number(open.amount) - Number(open.amount_paid), 0) : 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>New expense</Button>
      </div>
      <MetricRow
        items={[
          {
            label: "Total expenses",
            value: money(total, business.currency),
            delta: spendSeries.delta,
            invert: true,
            chart: { kind: "area", values: spendSeries.values },
          },
          {
            label: "Paid",
            value: money(paid, business.currency),
            delta: paidSeries.delta,
            chart: { kind: "radial", value: paid, total: total || paid, label: "Paid" },
          },
          {
            label: "Outstanding",
            value: money(outstanding, business.currency),
            invert: true,
            chart: { kind: "radial", value: outstanding, total: total || outstanding, label: "Outstanding" },
          },
          {
            label: "Monthly recurring",
            value: money(monthly, business.currency),
            invert: true,
            chart: { kind: "area", values: spendSeries.values },
          },
        ]}
      />
      <FinanceTabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: "all", label: "All expenses" },
          { value: "recurring", label: "Recurring" },
        ]}
      >
        <TabsContent value="all" className="pt-4">
          <FinanceTable columns={columns} data={rows} filterColumn="vendor" filterPlaceholder="Search expenses…" empty="No expenses yet" getRowId={(row) => row.id} />
        </TabsContent>
        <TabsContent value="recurring" className="pt-4">
          <FinanceTable columns={scheduleColumns} data={schedules} filterColumn="vendor" filterPlaceholder="Search schedules…" empty="No recurring schedules" getRowId={(row) => row.id} />
        </TabsContent>
      </FinanceTabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New expense</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="exp-vendor">Vendor</FieldLabel>
              <Input id="exp-vendor" value={form.vendor} onValueChange={(value) => setForm({ ...form, vendor: value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="exp-cat">Category</FieldLabel>
              <Input id="exp-cat" value={form.category} onValueChange={(value) => setForm({ ...form, category: value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="exp-amt">Amount</FieldLabel>
              <Input id="exp-amt" type="number" value={form.amount} onValueChange={(value) => setForm({ ...form, amount: value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="exp-type">Type</FieldLabel>
              <FinanceSelect
                id="exp-type"
                className="w-full"
                value={form.type}
                onValueChange={(value) => setForm({ ...form, type: value as typeof form.type })}
                items={{ one_time: "One-time", fixed: "Fixed-duration recurring", ongoing: "Ongoing recurring" }}
              />
            </Field>
            {form.type !== "one_time" ? (
              <>
                <Field>
                  <FieldLabel htmlFor="exp-freq">Frequency</FieldLabel>
                  <FinanceSelect
                    id="exp-freq"
                    className="w-full"
                    value={form.frequency}
                    onValueChange={(value) => setForm({ ...form, frequency: value })}
                    items={{ weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly" }}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="exp-start">Start</FieldLabel>
                  <DatePicker id="exp-start" value={form.startOn} onChange={(value) => setForm({ ...form, startOn: value })} />
                </Field>
              </>
            ) : null}
            {form.type === "fixed" ? (
              <>
                <Field>
                  <FieldLabel htmlFor="exp-end">End</FieldLabel>
                  <DatePicker id="exp-end" value={form.endOn} onChange={(value) => setForm({ ...form, endOn: value })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="exp-n">Installments</FieldLabel>
                  <Input id="exp-n" type="number" value={form.installments} onValueChange={(value) => setForm({ ...form, installments: value })} />
                </Field>
              </>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button onClick={() => void create()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(open)} onOpenChange={(value) => !value && setOpen(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{open?.vendor}</DialogTitle>
          </DialogHeader>
          {open ? (
            <div className="grid gap-2 text-sm">
              <p>{open.category} · {statusLabel(open.source)}</p>
              {open.source === "loan" ? (
                <p>
                  Principal {money(Number(open.principal_amount), business.currency)} · Interest{" "}
                  {money(Number(open.interest_amount), business.currency)}
                </p>
              ) : null}
              <p>Amount {money(Number(open.amount), business.currency)}</p>
              <p>Paid {money(Number(open.amount_paid), business.currency)}</p>
              {openPays.map((payment) => (
                <p key={payment.id}>
                  {money(Number(payment.amount), business.currency)} · {payment.method} · {payment.paid_on}
                </p>
              ))}
              {remaining > 0 ? (
                <Field>
                  <FieldLabel htmlFor="exp-pay">Payment</FieldLabel>
                  <Input id="exp-pay" type="number" value={payAmount} onValueChange={setPayAmount} />
                </Field>
              ) : null}
            </div>
          ) : null}
          {remaining > 0 ? (
            <DialogFooter>
              <Button onClick={() => void pay()}>Record payment</Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
