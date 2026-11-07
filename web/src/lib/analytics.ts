import { businesses, formatMoney, getBusiness } from "@/lib/businesses"

const POINTS = 365

export type MetricKind = "money" | "count" | "percent"
export type Tone = "positive" | "negative" | "neutral"
type Anchor =
  | "sales"
  | "openOrders"
  | "staff"
  | "businesses"
  | "platformSales"
  | "platformOrders"
  | "platformStaff"

type MetricSpec = {
  label: string
  kind: MetricKind
  base: number
  bias: number
  invert?: boolean
  anchor?: Anchor
}

type ModuleSpec = {
  metrics: MetricSpec[]
  trend: { title: string; description: string }
  bars: { title: string; description: string; kind: MetricKind; base: number; items: string[] }
  split: {
    title: string
    description: string
    items: { label: string; tone: Tone; weight?: number }[]
  }
}

export type Insights = {
  metrics: {
    label: string
    display: string
    delta: number
    invert?: boolean
    values: number[]
  }[]
  trend: {
    title: string
    description: string
    labels: string[]
    format: MetricKind
    series: { name: string; values: number[]; tone: "positive" | "negative" | "muted" | "default" }[]
  }
  bars: {
    title: string
    description: string
    items: { label: string; value: number; display: string }[]
  }
  split: {
    title: string
    description: string
    items: { label: string; value: number; tone: Tone }[]
  }
}

function hash(input: string) {
  let h = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    h ^= input.charCodeAt(index)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function unit(seed: string) {
  return hash(seed) / 4294967295
}

function round1(value: number) {
  const rounded = Math.round(value * 10) / 10
  return Object.is(rounded, -0) ? 0 : rounded
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function deltaFrom(values: number[]) {
  const mid = Math.floor(values.length / 2)
  const previous = average(values.slice(0, mid))
  const current = average(values.slice(mid))
  if (previous === 0) return 0
  return ((current - previous) / previous) * 100
}

function walk(seed: string, count: number, bias: number) {
  const values: number[] = []
  for (let index = 0; index < count; index += 1) {
    const t = count === 1 ? 1 : index / (count - 1)
    const wave = Math.sin((unit(seed) * Math.PI + index / 8) * Math.PI)
    const season = Math.sin((t + unit(`${seed}:season`)) * Math.PI * 2)
    const noise = (unit(`${seed}:${index}`) - 0.5) * 0.28
    const trend = bias * (t - 0.3) * 0.55
    values.push(Math.max(0.22, 1 + wave * 0.16 + season * 0.22 + noise + trend))
  }
  return values
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function distribute(total: number, weights: number[]) {
  const sum = weights.reduce((value, weight) => value + weight, 0) || 1
  const raw = weights.map((weight) => (weight / sum) * total)
  const floors = raw.map((value) => Math.floor(value))
  let left = Math.round(total) - floors.reduce((value, part) => value + part, 0)
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac)
  for (let step = 0; step < Math.max(left, 0); step += 1) {
    floors[order[step % order.length].index] += 1
  }
  return floors
}

function percentSeries(seed: string, base: number, bias: number) {
  const spread = base > 90 ? 5 : base < 20 ? Math.max(1.5, base * 0.55) : 16
  return walk(seed, POINTS, bias).map((value) =>
    round1(clamp(base + (value - 1) * spread, 0.2, 99.8)),
  )
}

const periodEnd = Date.UTC(2026, 10, 7)

function dayLabels() {
  return Array.from({ length: POINTS }, (_, index) => {
    const time = periodEnd - (POINTS - 1 - index) * 86400000
    const date = new Date(time)
    const month = String(date.getUTCMonth() + 1).padStart(2, "0")
    const day = String(date.getUTCDate()).padStart(2, "0")
    return `${date.getUTCFullYear()}-${month}-${day}`
  })
}

function scaleFor(businessId: string) {
  if (businessId === "platform") return 1
  const business = getBusiness(businessId)
  if (business.sales > 0) return business.sales / 12840
  return 0.45
}

function resolveTarget(metric: MetricSpec, businessId: string, scale: number) {
  if (metric.anchor === "businesses") return businesses.length
  if (metric.anchor === "platformSales") {
    return Math.max(1, businesses.reduce((sum, business) => sum + business.sales, 0))
  }
  if (metric.anchor === "platformOrders") {
    return Math.max(1, businesses.reduce((sum, business) => sum + business.openOrders, 0))
  }
  if (metric.anchor === "platformStaff") {
    return Math.max(1, businesses.reduce((sum, business) => sum + business.staff, 0))
  }
  const business = getBusiness(businessId)
  if (metric.anchor === "sales") return business.sales > 0 ? business.sales : Math.round(metric.base * scale)
  if (metric.anchor === "openOrders") return business.openOrders
  if (metric.anchor === "staff") return business.staff
  return Math.max(0, Math.round(metric.base * scale))
}

export function formatMetric(kind: MetricKind, value: number) {
  if (kind === "money") return formatMoney(Math.round(value))
  if (kind === "percent") return `${value.toFixed(1)}%`
  return new Intl.NumberFormat("en-US").format(Math.round(value))
}

function seriesFor(metric: MetricSpec, businessId: string, title: string, scale: number, prior = false) {
  const seed = `${businessId}:${title}:${metric.label}${prior ? ":prior" : ""}`
  const bias = prior ? metric.bias * -0.35 : metric.bias
  if (metric.kind === "percent") return percentSeries(seed, metric.base, bias)
  const target = resolveTarget(metric, businessId, scale)
  if (target <= 0) return Array.from({ length: POINTS }, () => 0)
  const shape = walk(seed, POINTS, bias)
  const last = shape[shape.length - 1] || 1
  const level = prior ? target * (0.72 + unit(seed) * 0.36) : target
  return shape.map((value) => (value / last) * level)
}

function accentTone(delta: number, invert?: boolean): "positive" | "negative" | "default" {
  if (Math.abs(delta) < 0.05) return "default"
  const favorable = invert ? delta < 0 : delta > 0
  return favorable ? "positive" : "negative"
}

function metric(
  label: string,
  kind: MetricKind,
  base: number,
  bias: number,
  extra?: Pick<MetricSpec, "invert" | "anchor">,
): MetricSpec {
  return { label, kind, base, bias, ...extra }
}

const modules: Record<string, ModuleSpec> = {
  Home: {
    metrics: [
      metric("Today's sales", "money", 12840, 0.6, { anchor: "sales" }),
      metric("Open orders", "count", 6, 0.35, { anchor: "openOrders" }),
      metric("Gross margin", "percent", 36, 0.45),
      metric("Low stock", "count", 8, 0.55, { invert: true }),
    ],
    trend: { title: "Sales", description: "Daily sales against the prior year." },
    bars: {
      title: "Channel mix",
      description: "Where today's sales were taken.",
      kind: "money",
      base: 6400,
      items: ["POS", "Invoices", "Online", "Quotations"],
    },
    split: {
      title: "Tender",
      description: "Share of sales by outcome.",
      items: [
        { label: "Paid", tone: "positive", weight: 4 },
        { label: "Open", tone: "neutral", weight: 1.4 },
        { label: "Refunded", tone: "negative", weight: 0.6 },
      ],
    },
  },
  Orders: {
    metrics: [
      metric("Order value", "money", 18600, 0.55),
      metric("Orders", "count", 48, 0.3),
      metric("Refund rate", "percent", 3.2, 0.5, { invert: true }),
      metric("Cancel rate", "percent", 6.4, -0.55, { invert: true }),
    ],
    trend: { title: "Order value", description: "Booked value against the prior year." },
    bars: {
      title: "Top accounts",
      description: "Largest order value in the period.",
      kind: "money",
      base: 4200,
      items: ["Harbor & Co", "North Yard", "Lumen Retail", "Field Office", "Walk-in"],
    },
    split: {
      title: "Order status",
      description: "Share of orders by current state.",
      items: [
        { label: "Fulfilled", tone: "positive", weight: 3.2 },
        { label: "Open", tone: "neutral", weight: 1.3 },
        { label: "Cancelled", tone: "negative", weight: 0.5 },
      ],
    },
  },
  "Draft Orders": {
    metrics: [
      metric("Draft value", "money", 4200, 0.25),
      metric("Drafts", "count", 14, 0.4),
      metric("Conversion", "percent", 28, 0.5),
      metric("Stale drafts", "count", 5, 0.55, { invert: true }),
    ],
    trend: { title: "Draft value", description: "Open draft value against the prior year." },
    bars: {
      title: "Age",
      description: "Draft value by how long it has sat.",
      kind: "money",
      base: 1600,
      items: ["Today", "2–3 days", "4–7 days", "Over a week"],
    },
    split: {
      title: "Readiness",
      description: "Whether a draft can be charged.",
      items: [
        { label: "Ready", tone: "positive" },
        { label: "Waiting", tone: "neutral" },
        { label: "Expired", tone: "negative" },
      ],
    },
  },
  Quotations: {
    metrics: [
      metric("Quoted", "money", 9600, 0.4),
      metric("Win rate", "percent", 34, 0.5),
      metric("Sent", "count", 22, 0.15),
      metric("Lost quotes", "count", 6, 0.5, { invert: true }),
    ],
    trend: { title: "Quoted value", description: "Quotes issued against the prior year." },
    bars: {
      title: "By owner",
      description: "Quoted value sitting with each seller.",
      kind: "money",
      base: 2800,
      items: ["Aisha", "Omar", "Leah", "Unassigned"],
    },
    split: {
      title: "Quote outcome",
      description: "Share of quotes by result.",
      items: [
        { label: "Accepted", tone: "positive" },
        { label: "Sent", tone: "neutral" },
        { label: "Declined", tone: "negative" },
      ],
    },
  },
  "Online Payments": {
    metrics: [
      metric("Collected", "money", 7400, 0.55),
      metric("Success rate", "percent", 94, 0.35),
      metric("Failed", "count", 4, -0.5, { invert: true }),
      metric("Refunds", "money", 380, 0.55, { invert: true }),
    ],
    trend: { title: "Collections", description: "Captured payments against the prior year." },
    bars: {
      title: "Method",
      description: "Collected amount by tender.",
      kind: "money",
      base: 2600,
      items: ["Card", "Wallet", "Bank", "Cash on delivery"],
    },
    split: {
      title: "Payment result",
      description: "Share of attempts by result.",
      items: [
        { label: "Captured", tone: "positive", weight: 4 },
        { label: "Pending", tone: "neutral" },
        { label: "Failed", tone: "negative", weight: 0.5 },
      ],
    },
  },
  "Bill History": {
    metrics: [
      metric("Billed", "money", 15200, 0.4),
      metric("Collected", "money", 12100, 0.5),
      metric("Outstanding", "money", 3100, -0.45, { invert: true }),
      metric("Overdue", "count", 5, 0.55, { invert: true }),
    ],
    trend: { title: "Billed", description: "Invoice totals against the prior year." },
    bars: {
      title: "Aging",
      description: "Outstanding amount by age.",
      kind: "money",
      base: 1400,
      items: ["Current", "1–30", "31–60", "61+"],
    },
    split: {
      title: "Bill status",
      description: "Share of bills by collection state.",
      items: [
        { label: "Paid", tone: "positive", weight: 3 },
        { label: "Partial", tone: "neutral" },
        { label: "Overdue", tone: "negative", weight: 0.7 },
      ],
    },
  },
  CRM: {
    metrics: [
      metric("Pipeline", "money", 22400, 0.5),
      metric("Win rate", "percent", 29, 0.45),
      metric("New customers", "count", 11, 0.4),
      metric("Churn", "percent", 4.2, 0.5, { invert: true }),
    ],
    trend: { title: "Pipeline", description: "Open pipeline against the prior year." },
    bars: {
      title: "Stage value",
      description: "Pipeline amount by stage.",
      kind: "money",
      base: 6200,
      items: ["New", "Qualified", "Proposal", "Verbal"],
    },
    split: {
      title: "Deal result",
      description: "Share of deals closed in the period.",
      items: [
        { label: "Won", tone: "positive" },
        { label: "Open", tone: "neutral", weight: 1.6 },
        { label: "Lost", tone: "negative" },
      ],
    },
  },
  Locations: {
    metrics: [
      metric("Location sales", "money", 9000, 0.45),
      metric("Active", "count", 4, 0.1),
      metric("Utilization", "percent", 71, 0.3),
      metric("Stockouts", "count", 3, 0.55, { invert: true }),
    ],
    trend: { title: "Location sales", description: "Sales across locations against the prior year." },
    bars: {
      title: "By location",
      description: "Sales ranked by site.",
      kind: "money",
      base: 4800,
      items: ["Main Store", "North Yard", "Warehouse", "Kiosk"],
    },
    split: {
      title: "Site health",
      description: "Locations by stock position.",
      items: [
        { label: "Healthy", tone: "positive", weight: 2.4 },
        { label: "Watch", tone: "neutral" },
        { label: "Stockout", tone: "negative", weight: 0.5 },
      ],
    },
  },
  "Shipment Tracker": {
    metrics: [
      metric("On time", "percent", 91, 0.4),
      metric("In transit", "count", 16, 0.2),
      metric("Delivered", "count", 42, 0.45),
      metric("Delayed", "count", 5, 0.55, { invert: true }),
    ],
    trend: { title: "On-time rate", description: "Deliveries on time against the prior year." },
    bars: {
      title: "Lane",
      description: "Shipments by route.",
      kind: "count",
      base: 14,
      items: ["City", "Regional", "Export", "Pickup"],
    },
    split: {
      title: "Shipment status",
      description: "Share of shipments by state.",
      items: [
        { label: "Delivered", tone: "positive", weight: 3 },
        { label: "Transit", tone: "neutral" },
        { label: "Delayed", tone: "negative", weight: 0.6 },
      ],
    },
  },
  Buying: {
    metrics: [
      metric("Fill rate", "percent", 86, 0.45),
      metric("Open requests", "count", 9, -0.4),
      metric("Spend", "money", 5400, 0.35),
      metric("Late orders", "count", 3, 0.5, { invert: true }),
    ],
    trend: { title: "Fill rate", description: "Request fill rate against the prior year." },
    bars: {
      title: "Supplier",
      description: "Spend by supplier.",
      kind: "money",
      base: 1800,
      items: ["Atlas Supply", "Kin Goods", "Local Mill", "Imports"],
    },
    split: {
      title: "Request status",
      description: "Share of requests by state.",
      items: [
        { label: "Received", tone: "positive" },
        { label: "Ordered", tone: "neutral" },
        { label: "Late", tone: "negative" },
      ],
    },
  },
  Inventory: {
    metrics: [
      metric("Stock value", "money", 48200, 0.25),
      metric("Sell-through", "percent", 62, 0.45),
      metric("Units on hand", "count", 1280, 0.15),
      metric("Low stock", "count", 8, 0.55, { invert: true }),
    ],
    trend: { title: "Stock value", description: "Inventory value against the prior year." },
    bars: {
      title: "Value by class",
      description: "On-hand value ranked by class.",
      kind: "money",
      base: 14000,
      items: ["Finished", "Raw", "Packaging", "Spare"],
    },
    split: {
      title: "Stock position",
      description: "SKUs by replenishment need.",
      items: [
        { label: "Healthy", tone: "positive", weight: 3 },
        { label: "Reorder", tone: "neutral" },
        { label: "Low", tone: "negative", weight: 0.7 },
      ],
    },
  },
  Products: {
    metrics: [
      metric("Product sales", "money", 10100, 0.5),
      metric("Active SKUs", "count", 86, 0.2),
      metric("Margin", "percent", 33, 0.4),
      metric("Dead stock", "count", 9, 0.5, { invert: true }),
    ],
    trend: { title: "Product sales", description: "Product revenue against the prior year." },
    bars: {
      title: "Top sellers",
      description: "Revenue by product.",
      kind: "money",
      base: 2400,
      items: ["Filter kit", "Bulk grain", "Case pack", "Service plan", "Sample"],
    },
    split: {
      title: "Velocity",
      description: "SKUs by how fast they sell.",
      items: [
        { label: "Fast", tone: "positive" },
        { label: "Steady", tone: "neutral", weight: 1.5 },
        { label: "Slow", tone: "negative" },
      ],
    },
  },
  "Product Catalog": {
    metrics: [
      metric("Published", "percent", 81, 0.45),
      metric("Listed", "count", 74, 0.25),
      metric("Views", "count", 640, 0.35),
      metric("Unpublished", "count", 14, 0.5, { invert: true }),
    ],
    trend: { title: "Published share", description: "Catalog published rate against the prior year." },
    bars: {
      title: "Views",
      description: "Catalog views by channel.",
      kind: "count",
      base: 220,
      items: ["Storefront", "Sales link", "POS lookup", "Partner"],
    },
    split: {
      title: "Listing state",
      description: "Entries by publish state.",
      items: [
        { label: "Live", tone: "positive", weight: 3 },
        { label: "Draft", tone: "neutral" },
        { label: "Hidden", tone: "negative", weight: 0.6 },
      ],
    },
  },
  Categories: {
    metrics: [
      metric("Category sales", "money", 12840, 0.4),
      metric("Categories", "count", 12, 0.1),
      metric("Top share", "percent", 28, -0.2),
      metric("Empty", "count", 2, 0.5, { invert: true }),
    ],
    trend: { title: "Category sales", description: "Sales by category rollup against the prior year." },
    bars: {
      title: "Category rank",
      description: "Sales by category.",
      kind: "money",
      base: 3600,
      items: ["Grocery", "Hardware", "Care", "Seasonal"],
    },
    split: {
      title: "Mix",
      description: "Share of sales by category.",
      items: [
        { label: "Grocery", tone: "neutral", weight: 2 },
        { label: "Hardware", tone: "neutral" },
        { label: "Care", tone: "neutral" },
        { label: "Other", tone: "neutral", weight: 0.6 },
      ],
    },
  },
  Batches: {
    metrics: [
      metric("Batch value", "money", 6700, 0.2),
      metric("Yield", "percent", 93, 0.35),
      metric("Waste", "percent", 2.4, -0.5, { invert: true }),
      metric("Expiring", "count", 4, 0.55, { invert: true }),
    ],
    trend: { title: "Batch value", description: "Open batch value against the prior year." },
    bars: {
      title: "By lot",
      description: "Value sitting in active lots.",
      kind: "money",
      base: 1800,
      items: ["Lot A", "Lot B", "Lot C", "Hold"],
    },
    split: {
      title: "Lot state",
      description: "Batches by quality state.",
      items: [
        { label: "Released", tone: "positive", weight: 3 },
        { label: "Quarantine", tone: "neutral" },
        { label: "Expiring", tone: "negative", weight: 0.5 },
      ],
    },
  },
  Purchasing: {
    metrics: [
      metric("Savings", "money", 640, 0.55),
      metric("Spend", "money", 8900, 0.3),
      metric("Cost variance", "percent", 4.2, 0.5, { invert: true }),
      metric("Open POs", "count", 7, -0.2),
    ],
    trend: { title: "Savings", description: "Purchase savings against the prior year." },
    bars: {
      title: "Buyer",
      description: "Spend by buyer.",
      kind: "money",
      base: 2600,
      items: ["Central", "North Yard", "Projects", "Spot"],
    },
    split: {
      title: "PO status",
      description: "Purchase orders by state.",
      items: [
        { label: "Received", tone: "positive" },
        { label: "Open", tone: "neutral", weight: 1.4 },
        { label: "Over budget", tone: "negative", weight: 0.5 },
      ],
    },
  },
  Expenses: {
    metrics: [
      metric("Spend", "money", 4100, 0.55, { invert: true }),
      metric("Budget used", "percent", 78, 0.45, { invert: true }),
      metric("On-time approval", "percent", 88, 0.45),
      metric("Exceptions", "count", 3, 0.5, { invert: true }),
    ],
    trend: { title: "Spend", description: "Expense spend against the prior year. Up is unfavorable." },
    bars: {
      title: "Category",
      description: "Spend by expense category.",
      kind: "money",
      base: 1200,
      items: ["Rent", "Payroll", "Utilities", "Travel", "Other"],
    },
    split: {
      title: "Budget",
      description: "Lines against the plan.",
      items: [
        { label: "Within plan", tone: "positive", weight: 2.6 },
        { label: "Watch", tone: "neutral" },
        { label: "Over", tone: "negative", weight: 0.7 },
      ],
    },
  },
  Capital: {
    metrics: [
      metric("Balance", "money", 36000, 0.3),
      metric("Burn", "money", 2800, 0.5, { invert: true }),
      metric("Runway (months)", "count", 14, -0.5),
      metric("Contributions", "money", 5000, 0.4),
    ],
    trend: { title: "Balance", description: "Capital balance against the prior year." },
    bars: {
      title: "Source",
      description: "Capital by source.",
      kind: "money",
      base: 12000,
      items: ["Owner", "Retained", "Facility", "Grant"],
    },
    split: {
      title: "Position",
      description: "How the balance is held.",
      items: [
        { label: "Available", tone: "positive", weight: 2.4 },
        { label: "Reserved", tone: "neutral" },
        { label: "Drawn", tone: "negative", weight: 0.8 },
      ],
    },
  },
  Accounting: {
    metrics: [
      metric("Revenue", "money", 19800, 0.55),
      metric("Expenses", "money", 12400, 0.4, { invert: true }),
      metric("Net margin", "percent", 31, 0.45),
      metric("Unreconciled", "count", 6, 0.5, { invert: true }),
    ],
    trend: { title: "Revenue", description: "Recognized revenue against the prior year." },
    bars: {
      title: "Account",
      description: "Movement by ledger group.",
      kind: "money",
      base: 5400,
      items: ["Sales", "COGS", "Operating", "Tax"],
    },
    split: {
      title: "Books",
      description: "Journal lines by review state.",
      items: [
        { label: "Reconciled", tone: "positive", weight: 3 },
        { label: "Pending", tone: "neutral" },
        { label: "Exception", tone: "negative", weight: 0.5 },
      ],
    },
  },
  Reporting: {
    metrics: [
      metric("Net sales", "money", 17600, 0.6),
      metric("Growth", "percent", 12, 0.45),
      metric("Gross profit", "money", 6100, 0.4),
      metric("Return rate", "percent", 2.8, 0.5, { invert: true }),
    ],
    trend: { title: "Net sales", description: "Net sales against the prior year." },
    bars: {
      title: "Weekpart",
      description: "Net sales by day group.",
      kind: "money",
      base: 3200,
      items: ["Mon–Tue", "Wed–Thu", "Friday", "Weekend"],
    },
    split: {
      title: "Result",
      description: "Share of sales after returns.",
      items: [
        { label: "Kept", tone: "positive", weight: 4 },
        { label: "Exchanged", tone: "neutral", weight: 0.5 },
        { label: "Returned", tone: "negative", weight: 0.4 },
      ],
    },
  },
  Settings: {
    metrics: [
      metric("Today's sales", "money", 12840, 0.55, { anchor: "sales" }),
      metric("Staff", "count", 4, 0.15, { anchor: "staff" }),
      metric("Collection", "percent", 97, 0.25),
      metric("Open issues", "count", 3, 0.5, { invert: true }),
    ],
    trend: { title: "Sales", description: "Sales for this business against the prior year." },
    bars: {
      title: "Work",
      description: "Where staff time went.",
      kind: "count",
      base: 18,
      items: ["Floor", "Back office", "Delivery", "Admin"],
    },
    split: {
      title: "Billing",
      description: "Invoice collection for this business.",
      items: [
        { label: "Current", tone: "positive", weight: 4 },
        { label: "Grace", tone: "neutral", weight: 0.4 },
        { label: "Past due", tone: "negative", weight: 0.3 },
      ],
    },
  },
  "Staff management": {
    metrics: [
      metric("Payroll", "money", 6400, 0.2),
      metric("Headcount", "count", 4, 0.1, { anchor: "staff" }),
      metric("Active", "percent", 94, 0.3),
      metric("Open roles", "count", 2, 0.55, { invert: true }),
    ],
    trend: { title: "Payroll", description: "Payroll against the prior year." },
    bars: {
      title: "Role",
      description: "People by role.",
      kind: "count",
      base: 3,
      items: ["Cashier", "Supervisor", "Buyer", "Owner"],
    },
    split: {
      title: "Coverage",
      description: "Shifts by fill state.",
      items: [
        { label: "Covered", tone: "positive", weight: 3 },
        { label: "Swap", tone: "neutral" },
        { label: "Open", tone: "negative", weight: 0.5 },
      ],
    },
  },
  "Business config": {
    metrics: [
      metric("Completeness", "percent", 76, 0.45),
      metric("Locations", "count", 3, 0.1),
      metric("Tax rules", "count", 4, 0.2),
      metric("Missing steps", "count", 3, 0.5, { invert: true }),
    ],
    trend: { title: "Completeness", description: "Setup completeness against the prior year." },
    bars: {
      title: "Section",
      description: "Configured items by section.",
      kind: "count",
      base: 6,
      items: ["Identity", "Tax", "Tender", "Documents"],
    },
    split: {
      title: "Setup",
      description: "Required settings by state.",
      items: [
        { label: "Done", tone: "positive", weight: 2.5 },
        { label: "Optional", tone: "neutral" },
        { label: "Missing", tone: "negative", weight: 0.7 },
      ],
    },
  },
  "Payment & billing": {
    metrics: [
      metric("Amount due", "money", 890, -0.45, { invert: true }),
      metric("Invoices paid", "count", 6, 0.4),
      metric("Days to renewal", "count", 18, -0.5),
      metric("Failed charges", "count", 1, 0.5, { invert: true }),
    ],
    trend: { title: "Amount due", description: "Balance due against the prior year. Down is favorable." },
    bars: {
      title: "Invoice",
      description: "Recent platform invoices.",
      kind: "money",
      base: 320,
      items: ["Subscription", "Seats", "Usage", "Tax"],
    },
    split: {
      title: "Charges",
      description: "Billing attempts by result.",
      items: [
        { label: "Paid", tone: "positive", weight: 4 },
        { label: "Scheduled", tone: "neutral" },
        { label: "Failed", tone: "negative", weight: 0.4 },
      ],
    },
  },
  POS: {
    metrics: [
      metric("Today's sales", "money", 12840, 0.6, { anchor: "sales" }),
      metric("Tickets", "count", 37, 0.45),
      metric("Avg. ticket", "money", 34, 0.25),
      metric("Voids", "count", 2, 0.55, { invert: true }),
    ],
    trend: { title: "POS sales", description: "POS sales against the prior year." },
    bars: {
      title: "Hour",
      description: "Tickets by daypart.",
      kind: "count",
      base: 12,
      items: ["Morning", "Midday", "Afternoon", "Evening"],
    },
    split: {
      title: "Tender",
      description: "Tickets by payment type.",
      items: [
        { label: "Card", tone: "neutral", weight: 2 },
        { label: "Cash", tone: "neutral" },
        { label: "Other", tone: "neutral", weight: 0.4 },
        { label: "Void", tone: "negative", weight: 0.25 },
      ],
    },
  },
  "Business portfolio": {
    metrics: [
      metric("Sales", "money", 21260, 0.55, { anchor: "platformSales" }),
      metric("Open orders", "count", 9, 0.3, { anchor: "platformOrders" }),
      metric("Staff", "count", 11, 0.15, { anchor: "platformStaff" }),
      metric("Low-stock alerts", "count", 11, 0.55, { invert: true }),
    ],
    trend: { title: "Portfolio sales", description: "Combined sales against the prior year." },
    bars: {
      title: "By business",
      description: "Sales by business.",
      kind: "money",
      base: 10000,
      items: [businesses[0].name, businesses[1].name],
    },
    split: {
      title: "Billing",
      description: "Businesses by billing state.",
      items: [
        { label: "Current", tone: "positive", weight: 5 },
        { label: "Grace", tone: "neutral", weight: 0.4 },
        { label: "Past due", tone: "negative", weight: 0.25 },
      ],
    },
  },
  Admin: {
    metrics: [
      metric("Portfolio sales", "money", 21260, 0.5, { anchor: "platformSales" }),
      metric("Businesses", "count", 2, 0.1, { anchor: "businesses" }),
      metric("Coverage", "percent", 84, 0.4),
      metric("Incidents", "count", 2, 0.5, { invert: true }),
    ],
    trend: { title: "Portfolio sales", description: "Platform sales against the prior year." },
    bars: {
      title: "Business",
      description: "Sales by business.",
      kind: "money",
      base: 10000,
      items: [businesses[0].name, businesses[1].name],
    },
    split: {
      title: "Platform",
      description: "Businesses by operating state.",
      items: [
        { label: "Nominal", tone: "positive", weight: 3 },
        { label: "Watch", tone: "neutral" },
        { label: "Incident", tone: "negative", weight: 0.4 },
      ],
    },
  },
  Features: {
    metrics: [
      metric("Enabled", "percent", 78, 0.45),
      metric("Features", "count", 24, 0.2),
      metric("New", "count", 4, 0.4),
      metric("Deprecated", "count", 3, 0.5, { invert: true }),
    ],
    trend: { title: "Enabled share", description: "Enabled features against the prior year." },
    bars: {
      title: "Family",
      description: "Features by family.",
      kind: "count",
      base: 8,
      items: ["Sell", "Inventory", "Finance", "Identity"],
    },
    split: {
      title: "Lifecycle",
      description: "Features by lifecycle.",
      items: [
        { label: "Stable", tone: "positive", weight: 3 },
        { label: "Preview", tone: "neutral" },
        { label: "Deprecated", tone: "negative", weight: 0.5 },
      ],
    },
  },
  "Enabled features": {
    metrics: [
      metric("Adoption", "percent", 67, 0.5),
      metric("Adopted", "count", 16, 0.35),
      metric("Trials", "count", 3, -0.2),
      metric("Unused", "count", 6, 0.5, { invert: true }),
    ],
    trend: { title: "Adoption", description: "Feature adoption against the prior year." },
    bars: {
      title: "Business uptake",
      description: "Enabled features by business.",
      kind: "count",
      base: 12,
      items: [businesses[0].name, businesses[1].name, "Shared"],
    },
    split: {
      title: "Grant state",
      description: "Features by grant.",
      items: [
        { label: "On", tone: "positive", weight: 2.2 },
        { label: "Trial", tone: "neutral" },
        { label: "Off", tone: "negative" },
      ],
    },
  },
  Plans: {
    metrics: [
      metric("Attach rate", "percent", 46, 0.45),
      metric("Plans", "count", 4, 0.1),
      metric("ARPU", "money", 79, 0.3),
      metric("Churn", "percent", 3.6, 0.5, { invert: true }),
    ],
    trend: { title: "Attach rate", description: "Plan attach rate against the prior year." },
    bars: {
      title: "Plan",
      description: "Businesses by plan.",
      kind: "count",
      base: 2,
      items: ["Starter", "Retail", "Beverage", "Custom"],
    },
    split: {
      title: "Subscription",
      description: "Plans by commercial state.",
      items: [
        { label: "Active", tone: "positive", weight: 3 },
        { label: "Trial", tone: "neutral" },
        { label: "Churned", tone: "negative", weight: 0.4 },
      ],
    },
  },
  "POS registers": {
    metrics: [
      metric("Uptime", "percent", 97.5, 0.25),
      metric("Registers", "count", 5, 0.1),
      metric("Open now", "count", 3, 0.2),
      metric("Variance", "money", 120, 0.55, { invert: true }),
    ],
    trend: { title: "Uptime", description: "POS register uptime against the prior year." },
    bars: {
      title: "Counter",
      description: "POS sessions by counter.",
      kind: "count",
      base: 8,
      items: ["Front 1", "Front 2", "Yard", "Spare"],
    },
    split: {
      title: "Drawer",
      description: "POS registers by drawer state.",
      items: [
        { label: "Balanced", tone: "positive", weight: 3 },
        { label: "Open", tone: "neutral" },
        { label: "Short", tone: "negative", weight: 0.4 },
      ],
    },
  },
  "POS sessions": {
    metrics: [
      metric("Sessions", "count", 46, 0.4),
      metric("Avg. ticket", "money", 28, 0.25),
      metric("Cash variance", "money", 40, -0.5, { invert: true }),
      metric("Voids", "count", 3, 0.5, { invert: true }),
    ],
    trend: { title: "Sessions", description: "Closed sessions against the prior year." },
    bars: {
      title: "Cashier",
      description: "Sessions by cashier.",
      kind: "count",
      base: 14,
      items: ["Aisha", "Omar", "Leah", "Shared"],
    },
    split: {
      title: "Closeout",
      description: "Sessions by closeout result.",
      items: [
        { label: "Clean", tone: "positive", weight: 3 },
        { label: "Reviewed", tone: "neutral" },
        { label: "Voided", tone: "negative", weight: 0.4 },
      ],
    },
  },
  Health: {
    metrics: [
      metric("Uptime", "percent", 97.4, 0.35),
      metric("Errors / 1k", "count", 14, -0.55, { invert: true }),
      metric("Latency (ms)", "count", 180, 0.55, { invert: true }),
      metric("Failed checks", "count", 2, 0.5, { invert: true }),
    ],
    trend: { title: "Uptime", description: "Service uptime against the prior year." },
    bars: {
      title: "Check",
      description: "Passing checks by surface.",
      kind: "count",
      base: 12,
      items: ["API", "Auth", "Database", "Storage"],
    },
    split: {
      title: "Checks",
      description: "Health checks by result.",
      items: [
        { label: "Passing", tone: "positive", weight: 4 },
        { label: "Degraded", tone: "neutral", weight: 0.6 },
        { label: "Failing", tone: "negative", weight: 0.35 },
      ],
    },
  },
  Audit: {
    metrics: [
      metric("Pass rate", "percent", 96, -0.45),
      metric("Violations", "count", 7, 0.5, { invert: true }),
      metric("Open findings", "count", 4, -0.5, { invert: true }),
      metric("Resolved", "count", 11, 0.4),
    ],
    trend: { title: "Pass rate", description: "Audit pass rate against the prior year." },
    bars: {
      title: "Rule family",
      description: "Findings by rule family.",
      kind: "count",
      base: 4,
      items: ["Ledger", "Stock", "Access", "Billing"],
    },
    split: {
      title: "Findings",
      description: "Findings by severity.",
      items: [
        { label: "Clear", tone: "positive", weight: 3 },
        { label: "Warning", tone: "neutral" },
        { label: "Breach", tone: "negative", weight: 0.45 },
      ],
    },
  },
  Users: {
    metrics: [
      metric("Signups", "count", 9, 0.55),
      metric("Users", "count", 38, 0.45),
      metric("Active", "percent", 71, 0.3),
      metric("Disabled", "count", 2, 0.5, { invert: true }),
    ],
    trend: { title: "Signups", description: "New users against the prior year." },
    bars: {
      title: "Business",
      description: "Users by business.",
      kind: "count",
      base: 16,
      items: [businesses[0].name, businesses[1].name, "Platform"],
    },
    split: {
      title: "Account state",
      description: "Users by access state.",
      items: [
        { label: "Active", tone: "positive", weight: 3 },
        { label: "Invited", tone: "neutral" },
        { label: "Disabled", tone: "negative", weight: 0.35 },
      ],
    },
  },
  "Profile Overview": {
    metrics: [
      metric("Sign-ins", "count", 18, 0.45),
      metric("Businesses", "count", 2, 0.15, { anchor: "businesses" }),
      metric("Security score", "percent", 74, -0.5),
      metric("Open alerts", "count", 3, 0.5, { invert: true }),
    ],
    trend: { title: "Sign-ins", description: "Sign-ins against the prior year." },
    bars: {
      title: "Device",
      description: "Sign-ins by device.",
      kind: "count",
      base: 8,
      items: ["Desktop", "Phone", "Tablet"],
    },
    split: {
      title: "Sign-in result",
      description: "Attempts by result.",
      items: [
        { label: "Success", tone: "positive", weight: 4 },
        { label: "Challenged", tone: "neutral", weight: 0.5 },
        { label: "Failed", tone: "negative", weight: 0.35 },
      ],
    },
  },
  "Security & Privacy": {
    metrics: [
      metric("Failed sign-ins", "count", 6, -0.55, { invert: true }),
      metric("Active sessions", "count", 1, 0.2),
      metric("Recovery codes", "count", 8, -0.15),
      metric("Risky attempts", "count", 2, 0.5, { invert: true }),
    ],
    trend: { title: "Failed sign-ins", description: "Failed attempts against the prior year. Down is favorable." },
    bars: {
      title: "Source",
      description: "Failed attempts by source.",
      kind: "count",
      base: 3,
      items: ["Password", "Link", "Unknown device"],
    },
    split: {
      title: "Sessions",
      description: "Sessions by trust.",
      items: [
        { label: "Trusted", tone: "positive", weight: 3 },
        { label: "New", tone: "neutral" },
        { label: "Risky", tone: "negative", weight: 0.4 },
      ],
    },
  },
  "Account Settings": {
    metrics: [
      metric("Alerts sent", "count", 24, 0.4),
      metric("Delivery", "percent", 98, 0.2),
      metric("Digest open", "percent", 41, -0.45),
      metric("Muted", "count", 3, 0.45, { invert: true }),
    ],
    trend: { title: "Alerts sent", description: "Notifications sent against the prior year." },
    bars: {
      title: "Channel",
      description: "Alerts by channel.",
      kind: "count",
      base: 10,
      items: ["Email", "In app", "Audit"],
    },
    split: {
      title: "Delivery",
      description: "Alerts by delivery result.",
      items: [
        { label: "Delivered", tone: "positive", weight: 4 },
        { label: "Digest", tone: "neutral" },
        { label: "Bounced", tone: "negative", weight: 0.3 },
      ],
    },
  },
}

function genericSpec(title: string): ModuleSpec {
  return {
    metrics: [
      metric("Volume", "count", 40, 0.4),
      metric("Value", "money", 8000, 0.45),
      metric("Rate", "percent", 72, 0.3),
      metric("Exceptions", "count", 6, 0.5, { invert: true }),
    ],
    trend: { title: title, description: "Last year against the prior year." },
    bars: {
      title: "Breakdown",
      description: "Where the period concentrated.",
      kind: "count",
      base: 16,
      items: ["Primary", "Secondary", "Hold", "Closed"],
    },
    split: {
      title: "Status",
      description: "Share by result.",
      items: [
        { label: "Healthy", tone: "positive" },
        { label: "Watch", tone: "neutral" },
        { label: "At risk", tone: "negative" },
      ],
    },
  }
}

export function buildInsights(title: string, businessId: string): Insights {
  const spec = modules[title] ?? genericSpec(title)
  const scale = scaleFor(businessId)
  const labels = dayLabels()
  const metrics = spec.metrics.map((item) => {
    const values = seriesFor(item, businessId, title, scale)
    const target = item.kind === "percent" ? (values[values.length - 1] ?? item.base) : resolveTarget(item, businessId, scale)
    const delta = target <= 0 && item.kind !== "percent" ? 0 : round1(deltaFrom(values))
    return {
      label: item.label,
      display: formatMetric(item.kind, target),
      delta,
      invert: item.invert,
      values,
    }
  })
  const primary = spec.metrics[0]
  const primaryMetric = metrics[0]
  const barWeights = spec.bars.items.map(
    (label) => 0.45 + unit(`${businessId}:${title}:bar:${label}`) * 0.9,
  )
  const barTotal =
    spec.bars.kind === "percent"
      ? 100
      : spec.bars.kind === primary.kind
        ? Math.max(0, Math.round(resolveTarget(primary, businessId, scale)))
        : Math.max(0, Math.round(spec.bars.base * scale))
  const barValues =
    spec.bars.kind === "percent"
      ? barWeights.map((weight) => round1(clamp(spec.bars.base * weight, 1, 99)))
      : distribute(barTotal, barWeights)
  const bars = spec.bars.items
    .map((label, index) => {
      const value = barValues[index] ?? 0
      return { label, value, display: formatMetric(spec.bars.kind, value) }
    })
    .sort((a, b) => b.value - a.value)
  const splitWeights = spec.split.items.map(
    (item) => (item.weight ?? 1) * (0.65 + unit(`${businessId}:${title}:split:${item.label}`) * 0.7),
  )

  const insights: Insights = {
    metrics,
    trend: {
      title: spec.trend.title,
      description: spec.trend.description,
      labels,
      format: primary.kind,
      series: [
        {
          name: primary.label,
          values: primaryMetric.values,
          tone: accentTone(primaryMetric.delta, primary.invert),
        },
        {
          name: "Prior period",
          values: seriesFor(primary, businessId, title, scale, true),
          tone: "muted",
        },
      ],
    },
    bars: {
      title: spec.bars.title,
      description: spec.bars.description,
      items: bars,
    },
    split: {
      title: spec.split.title,
      description: spec.split.description,
      items: spec.split.items.map((item, index) => ({
        label: item.label,
        value: splitWeights[index] ?? 0,
        tone: item.tone,
      })),
    },
  }

  if (title === "Business portfolio" || title === "Admin") {
    insights.bars.items = [...businesses]
      .sort((a, b) => b.sales - a.sales)
      .map((business) => ({
        label: business.name,
        value: business.sales,
        display: formatMoney(business.sales),
      }))
    insights.bars.description = "Sales by business."
  }

  return insights
}
