"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"

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
import { dayKey, runningBalance, seriesWithDelta } from "@/lib/stat-series"

type EquityRow = {
  id: string
  kind: string
  description: string
  amount: number
  occurred_on: string
}

type AssetRow = {
  id: string
  name: string
  category: string
  acquisition_cost: number
  accumulated_depreciation: number
  residual_value: number
  status: string
  acquired_on: string
  shipment_id: string | null
}

type LoanRow = {
  id: string
  name: string
  lender: string
  principal: number
  outstanding: number
  interest_rate: number
  status: string
  start_on: string
}

type ExpenseRow = {
  id: string
  loan_id: string | null
  vendor: string
  amount: number
  amount_paid: number
  status: string
  due_on: string | null
  principal_amount: number
  interest_amount: number
}

export function CapitalDesk({ businessKey }: { businessKey: string }) {
  return (
    <FinanceScreen
      businessKey={businessKey}
      title="Capital"
      description="Equity, fixed assets, and loans. Loan repayments are the same rows shown in Expenses."
    >
      {({ business, supabase }) => <CapitalBody business={business} supabase={supabase} />}
    </FinanceScreen>
  )
}

function CapitalBody({ business, supabase }: { business: BusinessRecord; supabase: FlowClient }) {
  const [tab, setTab] = useState("equity")
  const [equity, setEquity] = useState<EquityRow[]>([])
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [loans, setLoans] = useState<LoanRow[]>([])
  const [installments, setInstallments] = useState<ExpenseRow[]>([])
  const [entryOpen, setEntryOpen] = useState(false)
  const [kind, setKind] = useState("contribution")
  const [form, setForm] = useState({ name: "", amount: "", extra: "", months: "36", count: "12" })
  const [openLoan, setOpenLoan] = useState<LoanRow | null>(null)

  const load = useCallback(async () => {
    const [equityRes, assetRes, loanRes, expenseRes] = await Promise.all([
      supabase
        .from("capital_entries")
        .select("id, kind, description, amount, occurred_on")
        .eq("business_id", business.id)
        .order("occurred_on", { ascending: false }),
      supabase
        .from("fixed_assets")
        .select("id, name, category, acquisition_cost, accumulated_depreciation, residual_value, status, acquired_on, shipment_id")
        .eq("business_id", business.id)
        .order("acquired_on", { ascending: false }),
      supabase
        .from("loans")
        .select("id, name, lender, principal, outstanding, interest_rate, status, start_on")
        .eq("business_id", business.id)
        .order("start_on", { ascending: false }),
      supabase
        .from("expenses")
        .select("id, loan_id, vendor, amount, amount_paid, status, due_on, principal_amount, interest_amount")
        .eq("business_id", business.id)
        .eq("source", "loan"),
    ])
    const error = equityRes.error || assetRes.error || loanRes.error || expenseRes.error
    if (error) toast.error(error.message)
    setEquity((equityRes.data ?? []) as EquityRow[])
    setAssets((assetRes.data ?? []) as AssetRow[])
    setLoans((loanRes.data ?? []) as LoanRow[])
    setInstallments((expenseRes.data ?? []) as ExpenseRow[])
  }, [business.id, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const equityTotal = equity.reduce((sum, row) => {
    if (row.kind === "withdrawal") return sum - Number(row.amount)
    return sum + Number(row.amount)
  }, 0)
  const nav = assets
    .filter((row) => row.status === "active")
    .reduce((sum, row) => sum + Number(row.acquisition_cost) - Number(row.accumulated_depreciation), 0)
  const borrowings = loans.filter((row) => row.status === "active").reduce((sum, row) => sum + Number(row.outstanding), 0)
  const principal = loans.filter((row) => row.status === "active").reduce((sum, row) => sum + Number(row.principal), 0)
  const equitySeries = useMemo(
    () =>
      seriesWithDelta(
        equity.map((row) => ({
          day: dayKey(row.occurred_on),
          amount: row.kind === "withdrawal" ? -Number(row.amount) : Number(row.amount),
        })),
      ),
    [equity],
  )
  const assetSeries = useMemo(
    () =>
      seriesWithDelta(
        assets
          .filter((row) => row.status === "active")
          .map((row) => ({
            day: dayKey(row.acquired_on),
            amount: Number(row.acquisition_cost) - Number(row.accumulated_depreciation),
          })),
      ),
    [assets],
  )
  const borrowingLine = useMemo(() => {
    const series = seriesWithDelta(
      loans.map((row) => ({ day: dayKey(row.start_on), amount: Number(row.outstanding) })),
    )
    return { ...series, values: runningBalance(series.values) }
  }, [loans])

  const equityColumns = useMemo<ColumnDef<DataTableFeatures, EquityRow>[]>(
    () => [
      { accessorKey: "kind", header: ({ column }) => <DataTableColumnHeader column={column} title="Kind" />, cell: ({ row }) => statusLabel(row.original.kind) },
      { accessorKey: "description", header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />, filterFn: "includesString" },
      {
        meta: { align: "right" },
        accessorKey: "amount",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
        cell: ({ row }) => <div className="text-right tabular-nums">{money(Number(row.original.amount), business.currency)}</div>,
      },
      { accessorKey: "occurred_on", header: ({ column }) => <DataTableColumnHeader column={column} title="Date" /> },
    ],
    [business.currency],
  )

  const assetColumns = useMemo<ColumnDef<DataTableFeatures, AssetRow>[]>(
    () => [
      { accessorKey: "name", header: ({ column }) => <DataTableColumnHeader column={column} title="Asset" />, filterFn: "includesString" },
      { accessorKey: "category", header: ({ column }) => <DataTableColumnHeader column={column} title="Category" /> },
      {
        meta: { align: "right" },
        accessorKey: "acquisition_cost",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Cost" />,
        cell: ({ row }) => <div className="text-right tabular-nums">{money(Number(row.original.acquisition_cost), business.currency)}</div>,
      },
      {
        meta: { align: "right" },
        accessorKey: "accumulated_depreciation",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Depreciation" />,
        cell: ({ row }) => <div className="text-right tabular-nums">{money(Number(row.original.accumulated_depreciation), business.currency)}</div>,
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "origin",
        header: "Origin",
        accessorFn: (row) => (row.shipment_id ? "Procurement" : "Manual"),
      },
    ],
    [business.currency],
  )

  const loanColumns = useMemo<ColumnDef<DataTableFeatures, LoanRow>[]>(
    () => [
      { accessorKey: "name", header: ({ column }) => <DataTableColumnHeader column={column} title="Loan" />, filterFn: "includesString" },
      { accessorKey: "lender", header: ({ column }) => <DataTableColumnHeader column={column} title="Lender" /> },
      {
        meta: { align: "right" },
        accessorKey: "outstanding",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Outstanding" />,
        cell: ({ row }) => <div className="text-right tabular-nums">{money(Number(row.original.outstanding), business.currency)}</div>,
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "open",
        header: "",
        cell: ({ row }) => (
          <Button size="sm" variant="outline" onClick={() => setOpenLoan(row.original)}>
            Open
          </Button>
        ),
      },
    ],
    [business.currency],
  )

  async function save() {
    try {
      if (kind === "asset") {
        await callRpc(supabase, "create_fixed_asset", {
          p_business_id: business.id,
          p_name: form.name,
          p_acquisition_cost: Number(form.amount),
          p_useful_life_months: Number(form.months) || 36,
        })
      } else if (kind === "loan") {
        await callRpc(supabase, "create_loan", {
          p_business_id: business.id,
          p_name: form.name,
          p_lender: form.extra,
          p_principal: Number(form.amount),
          p_installment_count: Number(form.count) || undefined,
        })
      } else {
        await callRpc(supabase, "create_capital_entry", {
          p_business_id: business.id,
          p_kind: kind,
          p_description: form.name,
          p_amount: Number(form.amount),
        })
      }
      setEntryOpen(false)
      setForm({ name: "", amount: "", extra: "", months: "36", count: "12" })
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save entry")
    }
  }

  const loanRows = installments.filter((row) => openLoan && row.loan_id === openLoan.id)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setEntryOpen(true)}>New entry</Button>
      </div>
      <MetricRow
        items={[
          {
            label: "Total equity",
            value: money(equityTotal, business.currency),
            delta: equitySeries.delta,
            chart: { kind: "area", values: equitySeries.values },
          },
          {
            label: "Net asset value",
            value: money(nav, business.currency),
            delta: assetSeries.delta,
            chart: { kind: "area", values: assetSeries.values },
          },
          {
            label: "Outstanding borrowings",
            value: money(borrowings, business.currency),
            invert: true,
            chart:
              principal > 0
                ? { kind: "radial", value: borrowings, total: principal, label: "Outstanding" }
                : { kind: "line", values: borrowingLine.values },
          },
        ]}
      />
      <FinanceTabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: "equity", label: "Equity" },
          { value: "assets", label: "Assets" },
          { value: "loans", label: "Loans" },
        ]}
      >
        <TabsContent value="equity" className="pt-4">
          <FinanceTable columns={equityColumns} data={equity} filterColumn="description" filterPlaceholder="Search equity…" empty="No equity entries" getRowId={(row) => row.id} />
        </TabsContent>
        <TabsContent value="assets" className="pt-4">
          <FinanceTable columns={assetColumns} data={assets} filterColumn="name" filterPlaceholder="Search assets…" empty="No assets. Receive a capitalized line in procurement, or add one here." getRowId={(row) => row.id} />
        </TabsContent>
        <TabsContent value="loans" className="pt-4">
          <FinanceTable columns={loanColumns} data={loans} filterColumn="name" filterPlaceholder="Search loans…" empty="No loans" getRowId={(row) => row.id} />
        </TabsContent>
      </FinanceTabs>

      <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New entry</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="cap-kind">Entry</FieldLabel>
              <FinanceSelect
                id="cap-kind"
                className="w-full"
                value={kind}
                onValueChange={setKind}
                items={{
                  contribution: "Equity contribution",
                  investment: "Investment",
                  withdrawal: "Withdrawal",
                  asset: "Fixed asset",
                  loan: "Loan",
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cap-name">{kind === "loan" ? "Name" : kind === "asset" ? "Asset" : "Description"}</FieldLabel>
              <Input id="cap-name" value={form.name} onValueChange={(value) => setForm({ ...form, name: value })} />
            </Field>
            {kind === "loan" ? (
              <Field>
                <FieldLabel htmlFor="cap-lender">Lender</FieldLabel>
                <Input id="cap-lender" value={form.extra} onValueChange={(value) => setForm({ ...form, extra: value })} />
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="cap-amt">Amount</FieldLabel>
              <Input id="cap-amt" type="number" value={form.amount} onValueChange={(value) => setForm({ ...form, amount: value })} />
            </Field>
            {kind === "asset" ? (
              <Field>
                <FieldLabel htmlFor="cap-life">Useful life (months)</FieldLabel>
                <Input id="cap-life" type="number" value={form.months} onValueChange={(value) => setForm({ ...form, months: value })} />
              </Field>
            ) : null}
            {kind === "loan" ? (
              <Field>
                <FieldLabel htmlFor="cap-n">Installments</FieldLabel>
                <Input id="cap-n" type="number" value={form.count} onValueChange={(value) => setForm({ ...form, count: value })} />
              </Field>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button onClick={() => void save()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(openLoan)} onOpenChange={(value) => !value && setOpenLoan(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{openLoan?.name}</DialogTitle>
          </DialogHeader>
          {openLoan ? (
            <div className="grid gap-2 text-sm">
              <p>Lender {openLoan.lender}</p>
              <p>Principal {money(Number(openLoan.principal), business.currency)}</p>
              <p>Outstanding {money(Number(openLoan.outstanding), business.currency)}</p>
              <p className="font-medium">Repayments (shared with Expenses)</p>
              {loanRows.length === 0 ? <p className="text-muted-foreground">No installments generated yet</p> : null}
              {loanRows.map((row) => (
                <p key={row.id}>
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <span>
                      {row.due_on} · {money(Number(row.amount), business.currency)}
                    </span>
                    <StatusBadge status={row.status} />
                    <span>· principal {money(Number(row.principal_amount), business.currency)}</span>
                  </span>
                </p>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
