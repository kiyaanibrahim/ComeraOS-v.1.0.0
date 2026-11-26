"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { DatePicker } from "@/components/date-picker"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import type { DataTableFeatures } from "@/components/data-table/data-table-features"
import { FinanceScreen, FinanceSelect, FinanceTable, FinanceTabs, MetricRow, TabsContent } from "@/components/financials/finance-shell"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/sonner"
import { money, statusLabel } from "@/lib/flow/format"
import { callRpc } from "@/lib/flow/rpc"
import type { BusinessRecord, FlowClient } from "@/lib/flow/use-business"
import { dayKey, runningBalance, seriesWithDelta } from "@/lib/stat-series"

type AccountRow = { id: string; code: string; name: string; kind: string }
type LedgerRow = {
  id: string | null
  entry_id: string | null
  entry_date: string | null
  memo: string | null
  account_code: string | null
  account_name: string | null
  account_kind: string | null
  debit: number | null
  credit: number | null
  source_type: string | null
  event: string | null
}
type SessionRow = {
  id: string
  register_id: string
  status: string
  expected_cash: number | null
  counted_cash: number | null
  cash_difference: number | null
  reconciled: boolean
  opened_at: string
}
type BankRow = { id: string; name: string; institution: string | null; opening_balance: number }
type StatementRow = {
  id: string
  bank_account_id: string
  posted_on: string
  description: string
  amount: number
  status: string
}
type JournalHeader = { id: string; entry_date: string; memo: string | null; posted: boolean; source_type: string | null; event: string | null }

const reports = [
  { id: "pnl", label: "Profit and loss" },
  { id: "balance", label: "Balance sheet" },
  { id: "cash", label: "Cash flow" },
  { id: "trial", label: "Trial balance" },
  { id: "ar", label: "Receivables" },
  { id: "ap", label: "Payables" },
  { id: "gst", label: "GST worksheet" },
] as const

export function AccountingDesk({ businessKey }: { businessKey: string }) {
  return (
    <FinanceScreen
      businessKey={businessKey}
      title="Accounting"
      description="Chart of accounts, posted journals, reconciliation, and reports from the general ledger."
    >
      {({ business, supabase }) => <AccountingBody business={business} supabase={supabase} />}
    </FinanceScreen>
  )
}

function AccountingBody({ business, supabase }: { business: BusinessRecord; supabase: FlowClient }) {
  const [tab, setTab] = useState("accounts")
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [journals, setJournals] = useState<JournalHeader[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [registers, setRegisters] = useState<Record<string, string>>({})
  const [banks, setBanks] = useState<BankRow[]>([])
  const [lines, setLines] = useState<StatementRow[]>([])
  const [report, setReport] = useState<(typeof reports)[number]["id"]>("pnl")
  const [org, setOrg] = useState(false)
  const [journalOpen, setJournalOpen] = useState(false)
  const [bankOpen, setBankOpen] = useState(false)
  const [memo, setMemo] = useState("")
  const [debitAccount, setDebitAccount] = useState("")
  const [creditAccount, setCreditAccount] = useState("")
  const [journalAmount, setJournalAmount] = useState("")
  const [bankName, setBankName] = useState("")
  const [statement, setStatement] = useState({ bankId: "", description: "", amount: "", postedOn: undefined as Date | undefined })

  const load = useCallback(async () => {
    let businessIds = [business.id]
    if (org) {
      const current = await supabase.from("businesses").select("id, organization_id").eq("id", business.id).maybeSingle()
      const organizationId = current.data?.organization_id
      if (organizationId) {
        const siblings = await supabase.from("businesses").select("id").eq("organization_id", organizationId)
        if (siblings.data?.length) businessIds = siblings.data.map((row) => row.id)
      }
    }
    const [accountRes, ledgerRes, journalRes, sessionRes, registerRes, bankRes, lineRes] = await Promise.all([
      supabase.from("accounts").select("id, code, name, kind").eq("business_id", business.id).order("code"),
      supabase.from("general_ledger").select("id, entry_id, entry_date, memo, account_code, account_name, account_kind, debit, credit, source_type, event").in("business_id", businessIds).order("entry_date", { ascending: false }).limit(800),
      supabase.from("journal_entries").select("id, entry_date, memo, posted, source_type, event").eq("business_id", business.id).order("entry_date", { ascending: false }).limit(300),
      supabase.from("register_sessions").select("id, register_id, status, expected_cash, counted_cash, cash_difference, reconciled, opened_at").eq("business_id", business.id).order("opened_at", { ascending: false }).limit(100),
      supabase.from("registers").select("id, name").eq("business_id", business.id),
      supabase.from("bank_accounts").select("id, name, institution, opening_balance").eq("business_id", business.id),
      supabase.from("bank_statement_lines").select("id, bank_account_id, posted_on, description, amount, status").eq("business_id", business.id).order("posted_on", { ascending: false }),
    ])
    const error = accountRes.error || ledgerRes.error || journalRes.error || sessionRes.error || registerRes.error || bankRes.error || lineRes.error
    if (error) toast.error(error.message)
    setAccounts((accountRes.data ?? []) as AccountRow[])
    setLedger((ledgerRes.data ?? []) as LedgerRow[])
    setJournals((journalRes.data ?? []) as JournalHeader[])
    setSessions((sessionRes.data ?? []) as SessionRow[])
    setRegisters(Object.fromEntries((registerRes.data ?? []).map((row) => [row.id, row.name])))
    setBanks((bankRes.data ?? []) as BankRow[])
    setLines((lineRes.data ?? []) as StatementRow[])
    if (accountRes.data?.[0]) {
      setDebitAccount((current) => current || accountRes.data![0].id)
      setCreditAccount((current) => current || accountRes.data![1]?.id || accountRes.data![0].id)
    }
  }, [business.id, org, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const balances = useMemo(() => {
    const map = new Map<string, { kind: string; name: string; code: string; debit: number; credit: number }>()
    for (const row of ledger) {
      const code = row.account_code ?? ""
      const current = map.get(code) ?? { kind: row.account_kind ?? "", name: row.account_name ?? "", code, debit: 0, credit: 0 }
      current.debit += Number(row.debit ?? 0)
      current.credit += Number(row.credit ?? 0)
      map.set(code, current)
    }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code))
  }, [ledger])

  function signed(row: { kind: string; debit: number; credit: number }) {
    if (row.kind === "asset" || row.kind === "expense") return row.debit - row.credit
    return row.credit - row.debit
  }

  const income = balances.filter((row) => row.kind === "income").reduce((sum, row) => sum + signed(row), 0)
  const expense = balances.filter((row) => row.kind === "expense").reduce((sum, row) => sum + signed(row), 0)
  const netProfit = income - expense
  const cash = balances.filter((row) => row.code === "1000" || row.code === "1010").reduce((sum, row) => sum + signed(row), 0)
  const liabilities = balances.filter((row) => row.kind === "liability").reduce((sum, row) => sum + signed(row), 0)

  const profitSeries = useMemo(() => {
    const rows = ledger
      .filter((row) => row.account_kind === "income" || row.account_kind === "expense")
      .map((row) => {
        const debit = Number(row.debit ?? 0)
        const credit = Number(row.credit ?? 0)
        const amount = row.account_kind === "income" ? credit - debit : debit - credit
        return {
          day: dayKey(row.entry_date),
          amount: row.account_kind === "income" ? amount : -amount,
        }
      })
    return seriesWithDelta(rows)
  }, [ledger])
  const cashSeries = useMemo(() => {
    const rows = ledger
      .filter((row) => row.account_code === "1000" || row.account_code === "1010")
      .map((row) => ({
        day: dayKey(row.entry_date),
        amount: Number(row.debit ?? 0) - Number(row.credit ?? 0),
      }))
    const series = seriesWithDelta(rows)
    return { ...series, values: runningBalance(series.values) }
  }, [ledger])
  const liabilitySeries = useMemo(() => {
    const rows = ledger
      .filter((row) => row.account_kind === "liability")
      .map((row) => ({
        day: dayKey(row.entry_date),
        amount: Number(row.credit ?? 0) - Number(row.debit ?? 0),
      }))
    const series = seriesWithDelta(rows)
    return { ...series, values: runningBalance(series.values) }
  }, [ledger])

  const accountColumns = useMemo<ColumnDef<DataTableFeatures, AccountRow>[]>(
    () => [
      { accessorKey: "code", header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />, filterFn: "includesString" },
      { accessorKey: "name", header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />, filterFn: "includesString" },
      { accessorKey: "kind", header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />, cell: ({ row }) => statusLabel(row.original.kind) },
    ],
    [],
  )

  const journalColumns = useMemo<ColumnDef<DataTableFeatures, JournalHeader>[]>(
    () => [
      { accessorKey: "entry_date", header: ({ column }) => <DataTableColumnHeader column={column} title="Date" /> },
      { accessorKey: "memo", header: ({ column }) => <DataTableColumnHeader column={column} title="Memo" />, filterFn: "includesString" },
      { accessorKey: "source_type", header: ({ column }) => <DataTableColumnHeader column={column} title="Source" /> },
      { accessorKey: "event", header: ({ column }) => <DataTableColumnHeader column={column} title="Event" /> },
      {
        accessorKey: "posted",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Posted" />,
        cell: ({ row }) => <StatusBadge status={row.original.posted ? "posted" : "draft"} />,
      },
    ],
    [],
  )

  const sessionColumns = useMemo<ColumnDef<DataTableFeatures, SessionRow>[]>(
    () => [
      {
        id: "register",
        accessorFn: (row) => registers[row.register_id] ?? "Register",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Register" />,
        filterFn: "includesString",
      },
      { accessorKey: "status", header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      {
        accessorKey: "expected_cash",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Expected" />,
        cell: ({ row }) => money(Number(row.original.expected_cash ?? 0), business.currency),
      },
      {
        accessorKey: "counted_cash",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Counted" />,
        cell: ({ row }) => money(Number(row.original.counted_cash ?? 0), business.currency),
      },
      {
        accessorKey: "cash_difference",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Difference" />,
        cell: ({ row }) => money(Number(row.original.cash_difference ?? 0), business.currency),
      },
      {
        accessorKey: "reconciled",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Reconciled" />,
        cell: ({ row }) => (row.original.reconciled ? "Yes" : "No"),
      },
      {
        id: "confirm",
        header: "",
        cell: ({ row }) =>
          row.original.reconciled ? null : (
            <Button size="sm" variant="outline" onClick={() => void confirmSession(row.original.id)}>
              Confirm
            </Button>
          ),
      },
    ],
    [business.currency, registers],
  )

  const lineColumns = useMemo<ColumnDef<DataTableFeatures, StatementRow>[]>(
    () => [
      { accessorKey: "posted_on", header: ({ column }) => <DataTableColumnHeader column={column} title="Date" /> },
      { accessorKey: "description", header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />, filterFn: "includesString" },
      {
        accessorKey: "amount",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
        cell: ({ row }) => money(Number(row.original.amount), business.currency),
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "adjust",
        header: "",
        cell: ({ row }) =>
          row.original.status === "open" ? (
            <Button size="sm" variant="outline" onClick={() => void adjustLine(row.original.id)}>
              Adjust
            </Button>
          ) : null,
      },
    ],
    [business.currency],
  )

  async function confirmSession(id: string) {
    try {
      await callRpc(supabase, "reconcile_register_session", { p_business_id: business.id, p_session_id: id })
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reconcile session")
    }
  }

  async function adjustLine(id: string) {
    try {
      await callRpc(supabase, "adjust_bank_statement_line", { p_business_id: business.id, p_line_id: id })
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not post adjustment")
    }
  }

  async function postJournal() {
    try {
      const amount = Number(journalAmount)
      await callRpc(supabase, "create_manual_journal", {
        p_business_id: business.id,
        p_entry_date: new Date().toISOString().slice(0, 10),
        p_memo: memo || "Manual journal",
        p_lines: [
          { account_id: debitAccount, debit: amount, credit: 0 },
          { account_id: creditAccount, debit: 0, credit: amount },
        ],
      })
      setJournalOpen(false)
      setMemo("")
      setJournalAmount("")
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not post journal")
    }
  }

  async function saveBank() {
    try {
      await callRpc(supabase, "create_bank_account", { p_business_id: business.id, p_name: bankName })
      setBankOpen(false)
      setBankName("")
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create bank account")
    }
  }

  async function addStatement() {
    try {
      await callRpc(supabase, "add_bank_statement_line", {
        p_business_id: business.id,
        p_bank_account_id: statement.bankId,
        p_posted_on: statement.postedOn ? statement.postedOn.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        p_description: statement.description,
        p_amount: Number(statement.amount),
      })
      setStatement({ bankId: statement.bankId, description: "", amount: "", postedOn: undefined })
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add statement line")
    }
  }

  const reportRows = useMemo(() => {
    if (report === "pnl") return balances.filter((row) => row.kind === "income" || row.kind === "expense")
    if (report === "balance") return balances.filter((row) => ["asset", "liability", "equity"].includes(row.kind))
    if (report === "cash") return balances.filter((row) => row.code === "1000" || row.code === "1010" || row.code === "5600")
    if (report === "gst") return balances.filter((row) => row.code === "1300" || row.code === "2200")
    if (report === "ar") return balances.filter((row) => row.code === "1100")
    if (report === "ap") return balances.filter((row) => row.code === "2000")
    return balances
  }, [balances, report])

  const reportColumns = useMemo<ColumnDef<DataTableFeatures, (typeof reportRows)[number]>[]>(
    () => [
      {
        accessorKey: "code",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
        filterFn: "includesString",
      },
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Account" />,
      },
      {
        meta: { align: "right" },
        id: "amount",
        accessorFn: (row) => signed(row),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
        cell: ({ row }) => <div className="text-right tabular-nums">{money(signed(row.original), business.currency)}</div>,
      },
    ],
    [business.currency],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Label htmlFor="org-roll" className="flex items-center gap-2 font-normal">
          <Switch id="org-roll" checked={org} onCheckedChange={setOrg} />
          Organization
        </Label>
        <Button onClick={() => setJournalOpen(true)}>New journal entry</Button>
      </div>
      <MetricRow
        items={[
          {
            label: "Net profit",
            value: money(netProfit, business.currency),
            delta: profitSeries.delta,
            chart: { kind: "area", values: profitSeries.values },
          },
          {
            label: "Cash balance",
            value: money(cash, business.currency),
            delta: cashSeries.delta,
            chart: { kind: "line", values: cashSeries.values },
          },
          {
            label: "Total liabilities",
            value: money(liabilities, business.currency),
            delta: liabilitySeries.delta,
            invert: true,
            chart: { kind: "line", values: liabilitySeries.values },
          },
        ]}
      />
      <FinanceTabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: "accounts", label: "Accounts" },
          { value: "ledger", label: "Ledger" },
          { value: "reconciliation", label: "Reconciliation" },
          { value: "reports", label: "Reports" },
        ]}
      >
        <TabsContent value="accounts" className="pt-4">
          <div className="flex justify-end pb-3">
            <Button variant="outline" onClick={() => setBankOpen(true)}>
              New bank account
            </Button>
          </div>
          <FinanceTable columns={accountColumns} data={accounts} filterColumn="code" filterPlaceholder="Search accounts…" empty="No accounts" getRowId={(row) => row.id} />
          {banks.length > 0 ? (
            <p className="pt-3 text-sm text-muted-foreground">
              Bank accounts: {banks.map((bank) => bank.name).join(", ")}
            </p>
          ) : null}
        </TabsContent>
        <TabsContent value="ledger" className="pt-4">
          <FinanceTable columns={journalColumns} data={journals} filterColumn="memo" filterPlaceholder="Search journals…" empty="No journals posted yet" getRowId={(row) => row.id} />
        </TabsContent>
        <TabsContent value="reconciliation" className="pt-4">
          <div className="grid gap-4">
            <FinanceTable columns={sessionColumns} data={sessions} filterColumn="register" filterPlaceholder="Search sessions…" empty="No register sessions" getRowId={(row) => row.id} />
            <div className="flex flex-wrap items-end gap-2">
              <FinanceSelect
                value={statement.bankId || "none"}
                onValueChange={(value) => setStatement({ ...statement, bankId: value === "none" ? "" : value })}
                items={{ none: "Bank account", ...Object.fromEntries(banks.map((bank) => [bank.id, bank.name])) }}
              />
              <Input className="w-40" placeholder="Description" value={statement.description} onValueChange={(value) => setStatement({ ...statement, description: value })} />
              <Input className="w-28" type="number" placeholder="Amount" value={statement.amount} onValueChange={(value) => setStatement({ ...statement, amount: value })} />
              <DatePicker placeholder="Posted on" value={statement.postedOn} onChange={(value) => setStatement({ ...statement, postedOn: value })} />
              <Button variant="outline" onClick={() => void addStatement()}>
                Add line
              </Button>
            </div>
            <FinanceTable columns={lineColumns} data={lines} filterColumn="description" filterPlaceholder="Search lines…" empty="Enter statement lines to match against posted payments." getRowId={(row) => row.id} />
          </div>
        </TabsContent>
        <TabsContent value="reports" className="pt-4">
          <div className="mb-3">
            <FinanceSelect
              value={report}
              onValueChange={(value) => setReport(value as typeof report)}
              items={Object.fromEntries(reports.map((item) => [item.id, item.label]))}
            />
          </div>
          <FinanceTable columns={reportColumns} data={reportRows} filterColumn="code" filterPlaceholder="Search accounts…" empty="No posted activity for this report." getRowId={(row) => row.code} />
        </TabsContent>
      </FinanceTabs>

      <Dialog open={journalOpen} onOpenChange={setJournalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New journal entry</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="j-memo">Memo</FieldLabel>
              <Input id="j-memo" value={memo} onValueChange={setMemo} />
            </Field>
            <Field>
              <FieldLabel htmlFor="j-debit">Debit account</FieldLabel>
              <FinanceSelect
                id="j-debit"
                className="w-full"
                value={debitAccount}
                onValueChange={setDebitAccount}
                items={Object.fromEntries(accounts.map((account) => [account.id, `${account.code} ${account.name}`]))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="j-credit">Credit account</FieldLabel>
              <FinanceSelect
                id="j-credit"
                className="w-full"
                value={creditAccount}
                onValueChange={setCreditAccount}
                items={Object.fromEntries(accounts.map((account) => [account.id, `${account.code} ${account.name}`]))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="j-amt">Amount</FieldLabel>
              <Input id="j-amt" type="number" value={journalAmount} onValueChange={setJournalAmount} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button onClick={() => void postJournal()}>Post</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bankOpen} onOpenChange={setBankOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bank account</DialogTitle>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="bank-name">Name</FieldLabel>
            <Input id="bank-name" value={bankName} onValueChange={setBankName} />
          </Field>
          <DialogFooter>
            <Button onClick={() => void saveBank()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
