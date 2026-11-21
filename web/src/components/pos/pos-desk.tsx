"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { MinusIcon, PlusIcon, XIcon } from "lucide-react"

import { PosScreen } from "@/components/pos/pos-screen"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/sonner"
import { pushIslandReceipt } from "@/lib/island-toast"
import { money, quantity } from "@/lib/flow/format"
import { callRpc } from "@/lib/flow/rpc"
import type { BusinessRecord, FlowClient } from "@/lib/flow/use-business"
import { cn } from "@/lib/utils"

type ProductRow = {
  id: string
  sku: string
  name: string
  price: number
  status: string
  category_id: string | null
}
type Balance = { product_id: string; location_id: string; quantity: number }
type LocationRow = { id: string; name: string; kind: string }
type RegisterRow = {
  id: string
  name: string
  location_id: string
  warehouse_id: string
  status: string
}
type SessionRow = {
  id: string
  register_id: string
  opening_cash: number
  opened_at: string
  opened_by: string | null
  status: string
}
type CustomerRow = {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  customer_type: string
  status: string
}
type CartLine = { productId: string; name: string; price: number; quantity: number; onHand: number }
type PayMethod = "cash" | "card" | "bank_transfer"
type DiscountMode = "amount" | "percent"
type DraftTicket = {
  id: string
  number: string
  customer_id: string | null
  notes: string | null
  discount: number
  total: number
}
const PAY_METHODS: { id: PayMethod; label: string }[] = [
  { id: "bank_transfer", label: "Bank transfer" },
  { id: "cash", label: "Cash" },
  { id: "card", label: "Card" },
]

export function PosDesk({ businessKey }: { businessKey: string }) {
  return (
    <PosScreen
      businessKey={businessKey}
      title="Sell"
      description="Take payment from the open register."
    >
      {({ business, supabase }) => <Desk businessKey={businessKey} business={business} supabase={supabase} />}
    </PosScreen>
  )
}

function Desk({
  businessKey,
  business,
  supabase,
}: {
  businessKey: string
  business: BusinessRecord
  supabase: FlowClient
}) {
  const [products, setProducts] = useState<ProductRow[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [registers, setRegisters] = useState<RegisterRow[]>([])
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [session, setSession] = useState<SessionRow | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [registerId, setRegisterId] = useState("")
  const [search, setSearch] = useState("")
  const [customerQuery, setCustomerQuery] = useState("")
  const [customerId, setCustomerId] = useState("")
  const [customerIndex, setCustomerIndex] = useState(0)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const [newAddress, setNewAddress] = useState("")
  const [cart, setCart] = useState<CartLine[]>([])
  const [notes, setNotes] = useState("")
  const [method, setMethod] = useState<PayMethod>("card")
  const [tendered, setTendered] = useState("")
  const [transferRef, setTransferRef] = useState("")
  const [busy, setBusy] = useState(false)
  const [taxRate, setTaxRate] = useState(0)
  const [discountMode, setDiscountMode] = useState<DiscountMode>("amount")
  const [discountInput, setDiscountInput] = useState("")
  const [drafts, setDrafts] = useState<DraftTicket[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const quoteParams = useSearchParams()
  const quoteId = quoteParams.get("quote")
  const loadedQuote = useRef<string | null>(null)
  const activeIdRef = useRef<string | null>(null)
  const skipSave = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ticketStrip = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const [productRes, categoryRes, balanceRes, locationRes, registerRes, customerRes, settingsRes] = await Promise.all([
      supabase
        .from("products")
        .select("id, sku, name, price, status, category_id")
        .eq("business_id", business.id)
        .eq("status", "active")
        .order("name"),
      supabase.from("categories").select("id, name").eq("business_id", business.id).order("name"),
      supabase
        .from("inventory_balances")
        .select("product_id, location_id, quantity")
        .eq("business_id", business.id),
      supabase.from("locations").select("id, name, kind").eq("business_id", business.id).order("name"),
      supabase
        .from("registers")
        .select("id, name, location_id, warehouse_id, status")
        .eq("business_id", business.id)
        .eq("status", "active")
        .order("name"),
      supabase
        .from("customers")
        .select("id, name, phone, email, address, customer_type, status")
        .eq("business_id", business.id)
        .order("name")
        .limit(1000),
      supabase.from("business_settings").select("tax_rate").eq("business_id", business.id).maybeSingle(),
    ])
    const error =
      productRes.error ||
      categoryRes.error ||
      balanceRes.error ||
      locationRes.error ||
      registerRes.error ||
      customerRes.error ||
      settingsRes.error
    if (error) toast.error(error.message)

    const tills = (registerRes.data ?? []).filter(
      (row): row is RegisterRow => Boolean(row.location_id && row.warehouse_id),
    )
    setProducts(productRes.data ?? [])
    setCategories(categoryRes.data ?? [])
    setBalances(balanceRes.data ?? [])
    setLocations(locationRes.data ?? [])
    setRegisters(tills)
    setCustomers(customerRes.data ?? [])
    setTaxRate(Number(settingsRes.data?.tax_rate ?? 0))

    const nextRegisterId =
      registerId && tills.some((row) => row.id === registerId) ? registerId : tills[0]?.id || ""
    setRegisterId(nextRegisterId)

    if (!nextRegisterId) {
      setSession(null)
      setDrafts([])
      return
    }

    const sessionRes = await supabase
      .from("register_sessions")
      .select("id, register_id, opening_cash, opened_at, opened_by, status")
      .eq("business_id", business.id)
      .eq("register_id", nextRegisterId)
      .eq("status", "open")
      .maybeSingle()
    if (sessionRes.error) toast.error(sessionRes.error.message)
    const open = sessionRes.data
    setSession(
      open
        ? {
            id: open.id,
            register_id: open.register_id,
            opening_cash: Number(open.opening_cash),
            opened_at: open.opened_at,
            opened_by: open.opened_by,
            status: open.status,
          }
        : null,
    )
  }, [business.id, registerId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [supabase])

  const selected = registers.find((row) => row.id === registerId) ?? null
  const placeName = useMemo(() => {
    const map = new Map(locations.map((location) => [location.id, location.name]))
    return (id: string) => map.get(id) ?? "Location"
  }, [locations])
  const registerItems = Object.fromEntries(
    registers.map((row) => [row.id, `${row.name} · ${placeName(row.location_id)}`]),
  )
  const stock = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of balances) {
      if (row.location_id === selected?.warehouse_id) map.set(row.product_id, Number(row.quantity))
    }
    return map
  }, [balances, selected?.warehouse_id])

  useEffect(() => {
    if (!quoteId || loadedQuote.current === quoteId || products.length === 0) return
    loadedQuote.current = quoteId
    void (async () => {
      const [quoteRes, lineRes] = await Promise.all([
        supabase
          .from("quotations")
          .select("customer_id, status")
          .eq("business_id", business.id)
          .eq("id", quoteId)
          .maybeSingle(),
        supabase
          .from("quotation_lines")
          .select("product_id, description, quantity, unit_price")
          .eq("business_id", business.id)
          .eq("quotation_id", quoteId),
      ])
      if (quoteRes.error || lineRes.error) {
        toast.error(quoteRes.error?.message ?? lineRes.error?.message ?? "Could not load the quotation")
        return
      }
      if (quoteRes.data?.status === "accepted") {
        toast.error("That quote is already an order.")
        return
      }
      const next = (lineRes.data ?? []).flatMap((line) => {
        if (!line.product_id) return []
        return [
          {
            productId: line.product_id,
            name: line.description,
            price: Number(line.unit_price),
            quantity: Number(line.quantity),
            onHand: stock.get(line.product_id) ?? Number(line.quantity),
          },
        ]
      })
      if (next.length === 0) {
        toast.error("That quotation has no products to sell.")
        return
      }
      activeIdRef.current = null
      setActiveId(null)
      setCart(next)
      setCustomerId(quoteRes.data?.customer_id ?? "")
      setDiscountMode("amount")
      setDiscountInput("")
      toast.success("Quotation loaded into the cart.")
    })()
  }, [business.id, products.length, quoteId, stock, supabase])

  const categoryName = useMemo(() => {
    const map = new Map(categories.map((category) => [category.id, category.name]))
    return (id: string | null) => (id ? map.get(id) ?? "Products" : "Products")
  }, [categories])

  const query = search.trim().toLowerCase()
  const sellable = products.filter((product) => {
    if ((stock.get(product.id) ?? 0) <= 0) return false
    if (!query) return true
    return product.name.toLowerCase().includes(query) || product.sku.toLowerCase().includes(query)
  })
  const groups = useMemo(() => {
    const map = new Map<string, ProductRow[]>()
    for (const product of sellable) {
      const label = categoryName(product.category_id)
      map.set(label, [...(map.get(label) ?? []), product])
    }
    return [...map.entries()]
  }, [categoryName, sellable])

  const customerNeedle = customerQuery.trim().toLowerCase()
  const customerMatches = customers.filter((customer) => {
    if (customer.status !== "active" || !customerNeedle) return false
    return [customer.name, customer.phone, customer.email, customer.address]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(customerNeedle)
  }).slice(0, 6)
  const selectedCustomer = customers.find((customer) => customer.id === customerId) ?? null
  const activeCustomerIndex = customerMatches.length === 0 ? 0 : Math.min(customerIndex, customerMatches.length - 1)

  function chooseCustomer(customer: CustomerRow) {
    setCustomerId(customer.id)
    setCustomerQuery("")
    setCustomerIndex(0)
  }

  function onCustomerKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (selectedCustomer || customerMatches.length === 0) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setCustomerIndex((activeCustomerIndex + 1) % customerMatches.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setCustomerIndex((activeCustomerIndex - 1 + customerMatches.length) % customerMatches.length)
    } else if (event.key === "Enter") {
      const customer = customerMatches[activeCustomerIndex]
      if (!customer) return
      event.preventDefault()
      chooseCustomer(customer)
    }
  }

  const subtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0)
  const requestedDiscount =
    discountMode === "percent" ? (subtotal * (Number(discountInput) || 0)) / 100 : Number(discountInput) || 0
  const discount = Math.round(Math.min(Math.max(requestedDiscount, 0), subtotal) * 100) / 100
  const taxable = Math.round((subtotal - discount) * 100) / 100
  const tax = Math.round((taxable * taxRate) / 100 * 100) / 100
  const total = Math.round((taxable + tax) * 100) / 100
  const cashReceived = Number(tendered) || 0
  const changeDue = method === "cash" ? Math.max(0, cashReceived - total) : 0
  const heldByMe = Boolean(session && userId && session.opened_by === userId)
  const registerOpen = heldByMe

  function chooseRegister(next: string) {
    skipSave.current = true
    activeIdRef.current = null
    setActiveId(null)
    setRegisterId(next)
  }

  function setQty(product: ProductRow, next: number) {
    if (!registerOpen) return
    const onHand = stock.get(product.id) ?? 0
    const quantity = Math.min(onHand, Math.max(0, next))
    setCart((current) => {
      if (quantity <= 0) return current.filter((line) => line.productId !== product.id)
      const existing = current.find((line) => line.productId === product.id)
      if (!existing) {
        return [...current, { productId: product.id, name: product.name, price: Number(product.price), quantity, onHand }]
      }
      return current.map((line) => (line.productId === product.id ? { ...line, quantity, onHand } : line))
    })
  }

  function openNewCustomer() {
    const typed = customerQuery.trim()
    const digits = typed.replace(/[^\d+]/g, "")
    const looksLikePhone = typed.length > 0 && digits.length >= typed.replace(/\s/g, "").length - 1 && /\d/.test(typed)
    setNewName(looksLikePhone ? "" : typed)
    setNewPhone(looksLikePhone ? typed : "")
    setNewAddress("")
    setCreating(true)
  }

  async function addCustomer() {
    const name = newName.trim()
    const phone = newPhone.trim()
    if (!name || !phone) {
      toast.error("Name and phone number are required.")
      return
    }
    setBusy(true)
    const { data, error } = await supabase
      .from("customers")
      .insert({
        business_id: business.id,
        name,
        phone,
        address: newAddress.trim() || null,
        customer_type: "individual",
        status: "active",
      })
      .select("id, name, phone, email, address, customer_type, status")
      .single()
    setBusy(false)
    if (error || !data) {
      toast.error(error?.message ?? "Could not add the customer")
      return
    }
    setCustomers((current) => [...current.filter((customer) => customer.id !== data.id), data].sort((a, b) => a.name.localeCompare(b.name)))
    setCustomerId(data.id)
    setCustomerQuery("")
    setCreating(false)
  }

  function onProductKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || !registerOpen) return
    const sku = search.trim().toLowerCase()
    if (!sku) return
    const product = products.find((item) => item.sku.toLowerCase() === sku)
    if (!product) return
    event.preventDefault()
    const current = cart.find((line) => line.productId === product.id)
    setQty(product, (current?.quantity ?? 0) + 1)
    setSearch("")
  }

  function clearSaveTimer() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
  }

  function rememberTicket(ticket: DraftTicket) {
    setDrafts((current) => {
      const index = current.findIndex((item) => item.id === ticket.id)
      if (index === -1) return [...current, ticket]
      const next = current.slice()
      next[index] = ticket
      return next
    })
  }

  function blankTicket() {
    skipSave.current = true
    activeIdRef.current = null
    setActiveId(null)
    setCart([])
    setNotes("")
    setCustomerId("")
    setCustomerQuery("")
    setDiscountMode("amount")
    setDiscountInput("")
    setTendered("")
    setTransferRef("")
  }

  async function persistDraft() {
    if (!selected || !registerOpen) return activeIdRef.current
    const orderId = activeIdRef.current
    if (cart.length === 0 && !orderId) return null
    const saved = await callRpc<{
      id: string
      number: string
      customer_id: string | null
      notes: string | null
      discount: number
      total: number
    } | null>(supabase, "save_pos_draft", {
      p_business_id: business.id,
      p_register_id: selected.id,
      p_order_id: orderId,
      p_lines: cart.map((line) => ({ product_id: line.productId, quantity: line.quantity })),
      p_customer_id: customerId || null,
      p_notes: notes.trim() || null,
      p_discount: discount,
    })
    if (!saved) {
      if (orderId) setDrafts((current) => current.filter((item) => item.id !== orderId))
      activeIdRef.current = null
      setActiveId(null)
      return null
    }
    activeIdRef.current = saved.id
    setActiveId(saved.id)
    rememberTicket({
      id: saved.id,
      number: saved.number,
      customer_id: saved.customer_id,
      notes: saved.notes,
      discount: Number(saved.discount),
      total: Number(saved.total),
    })
    return saved.id
  }

  async function hydrate(id: string) {
    const [orderRes, lineRes] = await Promise.all([
      supabase
        .from("orders")
        .select("id, number, customer_id, notes, discount, total")
        .eq("business_id", business.id)
        .eq("id", id)
        .eq("status", "draft")
        .maybeSingle(),
      supabase
        .from("order_lines")
        .select("product_id, description, quantity, unit_price")
        .eq("business_id", business.id)
        .eq("order_id", id),
    ])
    if (orderRes.error || lineRes.error || !orderRes.data) {
      toast.error(orderRes.error?.message ?? lineRes.error?.message ?? "This draft is no longer open")
      return
    }
    skipSave.current = true
    activeIdRef.current = orderRes.data.id
    setActiveId(orderRes.data.id)
    setCustomerId(orderRes.data.customer_id ?? "")
    setCustomerQuery("")
    setNotes(orderRes.data.notes ?? "")
    setDiscountMode("amount")
    setDiscountInput(Number(orderRes.data.discount) > 0 ? String(orderRes.data.discount) : "")
    setTendered("")
    setCart(
      (lineRes.data ?? []).flatMap((line) => {
        if (!line.product_id) return []
        return [
          {
            productId: line.product_id,
            name: line.description,
            price: Number(line.unit_price),
            quantity: Number(line.quantity),
            onHand: stock.get(line.product_id) ?? Number(line.quantity),
          },
        ]
      }),
    )
    rememberTicket({
      id: orderRes.data.id,
      number: orderRes.data.number,
      customer_id: orderRes.data.customer_id,
      notes: orderRes.data.notes,
      discount: Number(orderRes.data.discount),
      total: Number(orderRes.data.total),
    })
  }

  async function openTicket(id: string) {
    if (id === activeIdRef.current) return
    clearSaveTimer()
    try {
      if (cart.length > 0 || activeIdRef.current) await persistDraft()
      await hydrate(id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the draft")
    }
  }

  async function startNewOrder() {
    clearSaveTimer()
    try {
      if (cart.length > 0 || activeIdRef.current) await persistDraft()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the draft")
      return
    }
    blankTicket()
  }

  async function discardTicket(id: string) {
    clearSaveTimer()
    const active = id === activeIdRef.current
    if (active) skipSave.current = true
    try {
      await callRpc(supabase, "discard_pos_draft", { p_business_id: business.id, p_order_id: id })
      setDrafts((current) => current.filter((item) => item.id !== id))
      if (active) blankTicket()
    } catch (error) {
      if (active) skipSave.current = false
      toast.error(error instanceof Error ? error.message : "Could not discard the draft")
    }
  }

  useEffect(() => {
    if (!registerId || !session) {
      setDrafts([])
      return
    }
    let cancelled = false
    void (async () => {
      const draftRes = await supabase
        .from("orders")
        .select("id, number, customer_id, notes, discount, total")
        .eq("business_id", business.id)
        .eq("register_id", registerId)
        .eq("source", "pos")
        .eq("status", "draft")
        .order("created_at", { ascending: true })
      if (cancelled) return
      if (draftRes.error) {
        toast.error(draftRes.error.message)
        return
      }
      const rows = (draftRes.data ?? []).map((row) => ({
        id: row.id,
        number: row.number,
        customer_id: row.customer_id,
        notes: row.notes,
        discount: Number(row.discount),
        total: Number(row.total),
      }))
      setDrafts(rows)
      if (cancelled || (quoteId && loadedQuote.current === quoteId)) return
      if (quoteId && loadedQuote.current !== quoteId) return
      if (activeIdRef.current && rows.some((row) => row.id === activeIdRef.current)) return
      const latest = rows.at(-1)
      if (!latest) {
        blankTicket()
        return
      }
      await hydrate(latest.id)
    })()
    return () => {
      cancelled = true
    }
  }, [business.id, quoteId, registerId, session?.id, supabase])

  useEffect(() => {
    if (!registerOpen || !selected) return
    if (skipSave.current) {
      skipSave.current = false
      return
    }
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      void persistDraft().catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Could not save the draft")
      })
    }, 400)
    return () => clearSaveTimer()
  }, [cart, customerId, discount, notes, registerOpen, selected?.id])

  useEffect(() => {
    const node = ticketStrip.current
    if (!node) return
    node.scrollLeft = node.scrollWidth
  }, [drafts.length])

  useEffect(() => {
    const node = ticketStrip.current
    if (!node) return
    const onWheel = (event: WheelEvent) => {
      if (node.scrollWidth <= node.clientWidth) return
      event.preventDefault()
      node.scrollLeft += event.deltaY
    }
    node.addEventListener("wheel", onWheel, { passive: false })
    return () => node.removeEventListener("wheel", onWheel)
  }, [])

  async function charge() {
    if (!selected || !registerOpen || cart.length === 0) return
    if (method === "cash" && cashReceived < total) {
      toast.error("Cash received is less than the total.")
      return
    }
    clearSaveTimer()
    setBusy(true)
    try {
      const draftId = await persistDraft()
      const sale = await callRpc<{
        id: string
        number: string
        bill_number: string
        lines: { name: string; quantity: number; price: number }[]
        subtotal: number
        discount: number
        tax: number
        tax_rate: number
        total: number
        method: string
        tendered: number
        change: number
      }>(supabase, "complete_pos_sale", {
        p_business_id: business.id,
        p_register_id: selected.id,
        p_lines: cart.map((line) => ({ product_id: line.productId, quantity: line.quantity })),
        p_method: method,
        p_tendered: method === "cash" ? cashReceived : null,
        p_notes: notes.trim() || null,
        p_customer_id: customerId || null,
        p_discount: discount,
        p_draft_id: draftId,
      })
      if (draftId) setDrafts((current) => current.filter((item) => item.id !== draftId))
      if (method === "bank_transfer" && transferRef.trim() && sale.id) {
        await supabase.from("payments").update({ external_ref: transferRef.trim() }).eq("business_id", business.id).eq("order_id", sale.id)
      }
      setTransferRef("")
      blankTicket()
      pushIslandReceipt({
        billNumber: sale.bill_number,
        lines: (sale.lines ?? []).map((line) => ({
          name: line.name,
          quantity: Number(line.quantity),
          amount: Number(line.price) * Number(line.quantity),
        })),
        subtotal: Number(sale.subtotal),
        discount: Number(sale.discount),
        tax: Number(sale.tax),
        total: Number(sale.total),
        currency: business.currency,
        tendered: sale.method === "cash" ? Number(sale.tendered) : null,
        change: sale.method === "cash" ? Number(sale.change) : null,
      })
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not complete the sale")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 xl:h-[calc(100svh-11rem)] xl:grid-cols-[minmax(0,1fr)_32rem] xl:gap-x-6 xl:overflow-hidden">
      <div className="flex min-h-0 flex-col gap-4">
        <div className="rounded-lg border px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>
              {registerOpen && selected
                ? `Ready. ${selected.name} is open at ${placeName(selected.location_id)}. Stock from ${placeName(selected.warehouse_id)}.`
                : session
                  ? "This register is open on another login."
                  : "Sell is locked until you open a register."}
            </p>
            {registers.length > 0 ? (
              <Select value={registerId} items={registerItems} onValueChange={(value) => chooseRegister(value ?? "")}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue placeholder="Register" />
                </SelectTrigger>
                <SelectContent>
                  {registers.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name} · {placeName(row.location_id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Button nativeButton={false} variant="outline" render={<Link href={`/app/${businessKey}/pos/register`} />}>
                Add a register
              </Button>
            )}
          </div>
        </div>

        <Input
          placeholder="Search products or scan a SKU and press Enter…"
          value={search}
          disabled={!registerOpen}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={onProductKeyDown}
        />

        <div className="min-h-0 flex-1 overflow-y-auto pr-5">
        {!selected ? (
          <p className="text-sm text-muted-foreground">Add a register before selling.</p>
        ) : !registerOpen ? (
          <p className="text-sm text-muted-foreground">Open the register, then search the catalog.</p>
        ) : sellable.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No stock in {placeName(selected.warehouse_id)}. Deliver a shipment there, then come back.
          </p>
        ) : (
          groups.map(([label, items]) => (
            <section key={label} className="mb-4 flex flex-col gap-3">
              <h2 className="text-xs tracking-wide text-muted-foreground uppercase">{label}</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
                {items.map((product) => {
                  const line = cart.find((item) => item.productId === product.id)
                  const onHand = stock.get(product.id) ?? 0
                  return (
                    <Card key={product.id} className="gap-3 py-4">
                      <CardHeader className="px-4">
                        <CardDescription>{product.sku}</CardDescription>
                        <CardTitle className="text-base">{product.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="flex items-center justify-between gap-3 px-4">
                        <div className="font-medium tabular-nums">{money(Number(product.price), business.currency)}</div>
                        {line ? (
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="outline"
                              onClick={() => setQty(product, line.quantity - 1)}
                            >
                              <MinusIcon />
                            </Button>
                            <span className="w-8 text-center text-sm tabular-nums">{line.quantity}</span>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="outline"
                              disabled={line.quantity >= onHand}
                              onClick={() => setQty(product, line.quantity + 1)}
                            >
                              <PlusIcon />
                            </Button>
                          </div>
                        ) : (
                          <Button type="button" size="sm" onClick={() => setQty(product, 1)}>
                            Add
                          </Button>
                        )}
                      </CardContent>
                      <p className="px-4 text-xs text-muted-foreground">{quantity(onHand)} on hand</p>
                    </Card>
                  )
                })}
              </div>
            </section>
          ))
        )}
        </div>
      </div>

      <Card className="flex flex-col xl:h-full xl:min-h-0 xl:overflow-hidden">
        <div className="flex shrink-0 items-stretch gap-2 px-5 pt-5">
          <div
            ref={ticketStrip}
            className="flex min-w-0 flex-1 snap-x snap-mandatory gap-2 overflow-x-scroll overscroll-x-contain pb-5"
          >
            {drafts.map((ticket) => {
              const name = ticket.customer_id
                ? customers.find((customer) => customer.id === ticket.customer_id)?.name ?? "Customer"
                : "Walk-in"
              const amount = ticket.id === activeId ? total : ticket.total
              const open = ticket.id === activeId
              return (
                <div key={ticket.id} className="group relative w-[calc((100%-1rem)/3)] shrink-0 snap-start">
                  <button
                    type="button"
                    className={cn(
                      "flex h-full w-full flex-col gap-0.5 rounded-lg border px-3 py-2 pr-7 text-left",
                      open ? "border-foreground" : "hover:bg-muted",
                    )}
                    disabled={!registerOpen || busy}
                    onClick={() => void openTicket(ticket.id)}
                  >
                    <span className="text-xs text-muted-foreground">{ticket.number}</span>
                    <span className="truncate text-sm">{name}</span>
                    <span className="text-sm font-medium tabular-nums">{money(amount, business.currency)}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Discard ${ticket.number}`}
                    className="absolute top-1.5 right-1.5 hidden size-5 items-center justify-center rounded-full text-muted-foreground group-hover:flex hover:text-foreground"
                    disabled={!registerOpen || busy}
                    onClick={() => void discardTicket(ticket.id)}
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
          <div className="flex w-10 shrink-0 pb-5">
          <button
            type="button"
            aria-label="New order"
            className={cn(
              "flex w-full flex-1 items-center justify-center rounded-lg border",
              activeId ? "hover:bg-muted" : "border-foreground",
            )}
            disabled={!registerOpen || busy}
            onClick={() => void startNewOrder()}
          >
            <PlusIcon className="size-4" />
          </button>
          </div>
        </div>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden px-5 py-6">
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto pr-5">
            <div className="sticky top-0 z-10 shrink-0 bg-card pb-2">
              <CardDescription>Current order</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{money(total, business.currency)}</CardTitle>
            </div>
            {cart.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add items to build the order.</p>
            ) : (
              cart.map((line) => (
                <div key={line.productId} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{line.name}</div>
                    <div className="text-sm text-muted-foreground">{money(line.price, business.currency)} each</div>
                  </div>
                  <span className="text-sm tabular-nums">{line.quantity}</span>
                </div>
              ))
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <div className="flex gap-2">
              <Input
                placeholder="Search CRM customers…"
                value={customerQuery}
                disabled={!registerOpen}
                role="combobox"
                aria-expanded={customerMatches.length > 0 && !selectedCustomer}
                aria-activedescendant={
                  customerMatches.length > 0 && !selectedCustomer
                    ? `pos-customer-option-${customerMatches[activeCustomerIndex]?.id}`
                    : undefined
                }
                onChange={(event) => {
                  setCustomerQuery(event.target.value)
                  setCustomerIndex(0)
                  if (customerId) setCustomerId("")
                }}
                onKeyDown={onCustomerKeyDown}
              />
              <Button type="button" variant="outline" disabled={!registerOpen || busy} onClick={openNewCustomer}>
                New
              </Button>
            </div>
            {selectedCustomer ? (
              <div className="flex items-start gap-2 rounded-lg border px-3 py-2">
                <Link
                  href={`/app/${businessKey}/crm/${selectedCustomer.id}`}
                  className="min-w-0 flex-1 rounded-md text-sm hover:bg-muted"
                >
                  <p className="font-medium">{selectedCustomer.name}</p>
                  <p className="text-muted-foreground">
                    {[selectedCustomer.phone, selectedCustomer.email].filter(Boolean).join(" · ") || "No phone or email"}
                  </p>
                  {selectedCustomer.address ? (
                    <p className="text-muted-foreground">{selectedCustomer.address}</p>
                  ) : null}
                </Link>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Remove customer"
                  onClick={() => setCustomerId("")}
                >
                  <XIcon />
                </Button>
              </div>
            ) : null}
            {customerNeedle && customerMatches.length === 0 && !selectedCustomer ? (
              <p className="text-sm text-muted-foreground">No CRM customer matches that search.</p>
            ) : null}
            {customerMatches.length > 0 && !selectedCustomer ? (
              <div className="overflow-hidden rounded-lg border" role="listbox">
                {customerMatches.map((customer, index) => (
                  <button
                    key={customer.id}
                    id={`pos-customer-option-${customer.id}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeCustomerIndex}
                    className={cn(
                      "block w-full px-3 py-2 text-left text-sm",
                      index === activeCustomerIndex ? "bg-muted" : "hover:bg-muted",
                    )}
                    onMouseEnter={() => setCustomerIndex(index)}
                    onClick={() => chooseCustomer(customer)}
                  >
                    <span className="block">{customer.name}</span>
                    <span className="block text-muted-foreground">
                      {[customer.phone, customer.email, customer.address].filter(Boolean).join(" · ") || "No contact details"}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <Textarea
              placeholder="Add a customer request, special handling, or internal note…"
              value={notes}
              disabled={!registerOpen}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          <Dialog open={creating} onOpenChange={setCreating}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>New CRM customer</DialogTitle>
                <DialogDescription>Name and phone are required. Address can be added later.</DialogDescription>
              </DialogHeader>
              <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  void addCustomer()
                }}
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pos-customer-name">Name</Label>
                  <Input
                    id="pos-customer-name"
                    required
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pos-customer-phone">Phone number</Label>
                  <Input
                    id="pos-customer-phone"
                    required
                    value={newPhone}
                    onChange={(event) => setNewPhone(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pos-customer-address">Address</Label>
                  <Input
                    id="pos-customer-address"
                    value={newAddress}
                    onChange={(event) => setNewAddress(event.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy || newName.trim().length === 0 || newPhone.trim().length === 0}>
                    {busy ? "Saving…" : "Save customer"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <div className="flex gap-2">
            <Select
              value={discountMode}
              items={{ amount: "Amount", percent: "Percent" }}
              onValueChange={(value) => setDiscountMode(value === "percent" ? "percent" : "amount")}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="amount">Amount</SelectItem>
                <SelectItem value="percent">Percent</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder={discountMode === "percent" ? "Discount %" : "Discount"}
              value={discountInput}
              disabled={!registerOpen}
              onChange={(event) => setDiscountInput(event.target.value)}
            />
          </div>

          <div className="flex shrink-0 flex-col gap-3">
          <div className="space-y-3">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Select payment method</div>
            <div className="grid grid-cols-3 gap-2">
              {PAY_METHODS.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  variant={method === option.id ? "default" : "outline"}
                  disabled={!registerOpen}
                  className={cn("h-auto px-2 py-2 text-xs whitespace-normal")}
                  onClick={() => setMethod(option.id)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {method === "cash" && registerOpen ? (
            <div className="space-y-2">
              <Input
                type="number"
                min={total}
                step="0.01"
                placeholder="Cash received"
                value={tendered}
                onChange={(event) => setTendered(event.target.value)}
              />
              <p className="text-sm text-muted-foreground">Change {money(changeDue, business.currency)}</p>
            </div>
          ) : null}
          {method === "bank_transfer" && registerOpen ? (
            <Input placeholder="Transfer reference" value={transferRef} onValueChange={setTransferRef} />
          ) : null}
          </div>
        </CardContent>
        <div className="flex shrink-0 flex-col gap-4 px-5 pt-2 pb-5">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{money(subtotal, business.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span className="tabular-nums">{money(discount, business.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax {taxRate}%</span>
              <span className="tabular-nums">{money(tax, business.currency)}</span>
            </div>
            <div className="flex justify-between pt-2 text-base font-medium">
              <span>Total due</span>
              <span className="tabular-nums">{money(total, business.currency)}</span>
            </div>
          </div>

          {registerOpen ? (
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                size="lg"
                disabled={busy || cart.length === 0 || (method === "cash" && cashReceived < total)}
                onClick={() => void charge()}
              >
                {busy ? "Charging…" : `Charge ${money(total, business.currency)}`}
              </Button>
            </div>
          ) : (
            <Button nativeButton={false} size="lg" render={<Link href={`/app/${businessKey}/pos/register`} />}>
              Open register
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
