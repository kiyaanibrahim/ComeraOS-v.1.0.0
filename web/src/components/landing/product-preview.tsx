function Shell({
  section,
  title,
  children,
}: {
  section: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full bg-[#fafafa] text-left text-neutral-950">
      <aside className="flex w-[22%] min-w-24 shrink-0 flex-col border-r border-neutral-200 bg-white p-3">
        <div className="rounded-lg bg-neutral-100 px-2 py-2">
          <p className="text-[11px] font-medium">Your business</p>
          <p className="text-[10px] text-neutral-500">Home</p>
        </div>
        <p className="mt-4 px-2 text-[10px] font-medium text-neutral-400">Home</p>
        <p className="mt-1 rounded-md bg-neutral-100 px-2 py-1.5 text-[11px]">{section}</p>
        <p className="mt-auto px-2 text-[10px] text-neutral-400">You</p>
      </aside>
      <div className="min-w-0 flex-1 p-4">
        <p className="text-[10px] text-neutral-400">{section}</p>
        <h3 className="mt-1 text-sm font-medium">{title}</h3>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <p className="text-[10px] text-neutral-500">{label}</p>
      <p className="mt-1 text-sm font-medium tabular-nums">{value}</p>
    </div>
  )
}

export function OverviewPreview() {
  return (
    <Shell section="Overview" title="Home">
      <p className="text-[11px] text-neutral-500">Sales, stock, and orders for your business.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric label="Today's sales" value="$0" />
        <Metric label="Open orders" value="0" />
        <Metric label="Gross margin" value="—" />
        <Metric label="Low stock" value="0" />
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-5">
        <div className="rounded-xl border border-neutral-200 bg-white p-3 lg:col-span-3">
          <p className="text-[11px] font-medium">Sales</p>
          <p className="text-[10px] text-neutral-500">The line starts with the first sale.</p>
          <div className="mt-6 h-24 rounded-lg border border-dashed border-neutral-200" />
        </div>
        <div className="flex flex-col justify-center rounded-xl border border-neutral-200 bg-white p-3 lg:col-span-2">
          <p className="text-[11px] font-medium">Tender</p>
          <p className="mt-2 text-[11px] text-neutral-500">Paid, open, and refunded shares appear here.</p>
        </div>
      </div>
    </Shell>
  )
}

export function PosPreview() {
  return (
    <Shell section="POS" title="POS">
      <p className="text-[11px] text-neutral-500">Sell stock that is on hand at the counter.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <p className="text-[11px] font-medium">Active stock</p>
          <p className="mt-2 text-[11px] text-neutral-500">Add a product, receive it, then it can be sold.</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <p className="text-[11px] font-medium">Ticket</p>
          <p className="mt-2 text-lg font-medium tabular-nums">$0.00</p>
          <div className="mt-3 rounded-lg bg-neutral-900 px-3 py-2 text-center text-[11px] text-white">Charge</div>
        </div>
      </div>
    </Shell>
  )
}

export function InventoryPreview() {
  return (
    <Shell section="Inventory" title="Inventory">
      <div className="rounded-xl border border-neutral-200 bg-white p-3">
        <p className="text-[11px] font-medium">On hand</p>
        <div className="mt-3 grid grid-cols-3 text-[10px] text-neutral-400">
          <span>Product</span>
          <span>Location</span>
          <span>On hand</span>
        </div>
        <p className="mt-4 text-center text-[11px] text-neutral-500">Deliver a shipment to post stock.</p>
      </div>
    </Shell>
  )
}

export function ProductsPreview() {
  return (
    <Shell section="Products" title="Products">
      <div className="rounded-xl border border-neutral-200 bg-white p-3">
        <p className="text-[11px] font-medium">New product</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="h-7 rounded-md border border-neutral-200" />
          <div className="h-7 rounded-md border border-neutral-200" />
        </div>
        <div className="mt-3 h-7 w-24 rounded-lg bg-neutral-900" />
      </div>
    </Shell>
  )
}

export function OrdersPreview() {
  return (
    <Shell section="Orders" title="Orders">
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Order value" value="$0" />
        <Metric label="Orders" value="0" />
      </div>
      <p className="mt-3 text-[11px] text-neutral-500">Live and completed orders list here after the first charge.</p>
    </Shell>
  )
}

export function BooksPreview() {
  return (
    <Shell section="Expenses" title="Expenses">
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Spend" value="$0" />
        <Metric label="On approval" value="0" />
      </div>
      <p className="mt-3 text-[11px] text-neutral-500">Operating spend sits beside the sale.</p>
    </Shell>
  )
}

export function CrmPreview() {
  return (
    <Shell section="CRM" title="CRM">
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Pipeline" value="$0" />
        <Metric label="Customers" value="0" />
      </div>
      <p className="mt-3 text-[11px] text-neutral-500">Customers and the pipeline, next to the counter.</p>
    </Shell>
  )
}

export function BusinessesPreview() {
  return (
    <div className="bg-white p-4 text-left text-neutral-950">
      <p className="text-[10px] text-neutral-400">Portfolio</p>
      <h3 className="mt-1 text-sm font-medium">Business portfolio</h3>
      <p className="mt-1 text-[11px] text-neutral-500">Every business you open appears on this desk.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-dashed border-neutral-300 p-4">
          <p className="text-[11px] font-medium">Your first business</p>
          <p className="mt-1 text-[10px] text-neutral-500">Waiting for signup</p>
        </div>
        <div className="rounded-xl border border-dashed border-neutral-300 p-4">
          <p className="text-[11px] font-medium">Another business</p>
          <p className="mt-1 text-[10px] text-neutral-500">Add it when you are ready</p>
        </div>
      </div>
    </div>
  )
}
