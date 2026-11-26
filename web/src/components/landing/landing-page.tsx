import Link from "next/link"

import { HeroField } from "@/components/landing/hero-field"
import { Intro } from "@/components/landing/intro"
import { SiteHeader } from "@/components/landing/site-header"

import "./landing.css"
import {
  BooksPreview,
  BusinessesPreview,
  CrmPreview,
  InventoryPreview,
  OrdersPreview,
  OverviewPreview,
  PosPreview,
  ProductsPreview,
} from "@/components/landing/product-preview"

const desks = [
  {
    title: "Sell what is on hand",
    body: "The register offers only the quantity sitting at the selling location.",
    preview: <PosPreview />,
  },
  {
    title: "Stock follows the shipment",
    body: "A delivery posts the balance. A sale draws it back down.",
    preview: <InventoryPreview />,
  },
  {
    title: "The catalog comes first",
    body: "SKU, price, and cost. Buying uses this list, and POS sells it.",
    preview: <ProductsPreview />,
  },
]

const modules = [
  { name: "POS", href: "#product" },
  { name: "Orders", href: "#features" },
  { name: "Inventory", href: "#product" },
  { name: "Buying", href: "#features" },
  { name: "CRM", href: "#features" },
  { name: "Financials", href: "#features" },
  { name: "Admin", href: "#businesses" },
]

const notes = [
  {
    quote: "The ticket only lists what that location can sell. The charge posts the sale and the stock together.",
    role: "Counter",
  },
  {
    quote: "A shipment is the cart. Marking it delivered is what the floor can sell the next morning.",
    role: "Buying",
  },
  {
    quote: "Spend, capital, and the report sit on the same desk as the day’s sales.",
    role: "Books",
  },
]

const plans = [
  {
    id: "core",
    name: "Starter",
    summary: "The counter and the stock for one business.",
    points: [
      "POS and the order ledger",
      "Products, catalog, and on-hand stock",
      "Quotations and bill history",
    ],
    className: "border border-border bg-card text-card-foreground",
    buttonClass: "bg-foreground text-background",
  },
  {
    id: "colony",
    name: "Complete",
    summary: "The whole business, from buying through the books.",
    points: [
      "Everything in Starter",
      "Buying and the shipment tracker",
      "CRM, locations, and customers",
      "Revenue, expenses, capital, accounting, and reporting",
      "Staff and billing",
    ],
    className: "bg-primary text-primary-foreground",
    buttonClass: "bg-primary-foreground text-primary",
  },
  {
    id: "cosmos",
    name: "Owner",
    summary: "Every business you own, from one owner desk.",
    points: [
      "Everything in Complete",
      "Every business on the account",
      "Features and plans",
      "Health and audit",
      "Users",
    ],
    className: "bg-foreground text-background",
    buttonClass: "bg-background text-foreground",
  },
]

const layers = [
  {
    title: "Home",
    body: "Sales, stock, and orders for the business that is open. POS, the ledger, and the balances live here.",
  },
  {
    title: "Settings",
    body: "The business itself: configuration, staff, and payment. One place for the people who run it.",
  },
  {
    title: "Admin",
    body: "The owner view. Features, plans, POS sessions, health, and audit across the businesses you hold.",
  },
]

function Check() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="mt-0.5 size-4 shrink-0">
      <path
        d="M3.5 8.2 6.4 11l6.1-6.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function LandingPage({ skipIntro = false }: { skipIntro?: boolean }) {
  return (
    <div className="overflow-x-hidden bg-background text-foreground">
      {skipIntro ? null : <Intro />}
      <SiteHeader />

      <main>
        <section
          id="hero"
          className="relative isolate overflow-hidden bg-neutral-950 px-5 pb-16 pt-28 text-white sm:pb-20 sm:pt-32"
        >
          <HeroField />
          <div className="relative z-10 mx-auto max-w-5xl">
            <div className="lift-card overflow-hidden rounded-2xl border border-white/10 bg-white text-neutral-950 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.65)]">
              <div className="lift-media">
                <OverviewPreview />
              </div>
            </div>
          </div>

          <div className="copy relative z-10 mx-auto mt-14 max-w-3xl text-center">
            <h1 className="text-4xl font-medium tracking-tight text-balance sm:text-6xl sm:leading-[1.05]">
              The operating system a business should run on.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-white/70 sm:text-lg">
              Sell at the counter, post the stock that arrived, and read the business from one desk.
              Your numbers stay with that business.
            </p>
            <div className="mt-8 flex justify-center">
              <Link href="/signup" className="button-02">
                <div className="inner">Get started</div>
                <div className="circle" aria-hidden="true">
                  <span>→</span>
                </div>
              </Link>
            </div>
            <p className="mt-6 text-sm text-white/60">A new account opens an empty desk.</p>
          </div>
        </section>

        <section id="product" className="scroll-mt-28 px-5 py-20 sm:py-28">
          <h2 className="mx-auto max-w-3xl text-center text-3xl font-medium tracking-tight text-balance sm:text-5xl sm:leading-[1.1]">
            Unobtrusive design that blends into the working day.
          </h2>
          <div className="mx-auto mt-14 grid max-w-6xl gap-5 md:grid-cols-3">
            {desks.map((desk) => (
              <article
                key={desk.title}
                className="lift-card overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-xl"
              >
                <div className="lift-media h-64 bg-muted sm:h-72">{desk.preview}</div>
                <div className="p-6">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-medium tracking-tight">{desk.title}</h3>
                    <span className="lift-arrow text-muted-foreground" aria-hidden="true">
                      →
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{desk.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-border px-5 py-10">
          <ul className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm font-medium tracking-wide text-muted-foreground">
            {modules.map((item) => (
              <li key={item.name}>
                <a href={item.href} className="module-link">
                  {item.name}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section id="features" className="scroll-mt-28 px-5 py-20 sm:py-28">
          <h2 className="mx-auto max-w-3xl text-center text-3xl font-medium tracking-tight text-balance sm:text-5xl sm:leading-[1.1]">
            Powerful features to run the business.
          </h2>

          <div className="mx-auto mt-14 grid max-w-6xl gap-4 lg:grid-cols-6">
            <figure className="lift-card overflow-hidden rounded-3xl border border-border bg-card shadow-xl lg:col-span-4 lg:row-span-2">
              <div className="lift-media h-full min-h-72">
                <OverviewPreview />
              </div>
            </figure>

            <article className="lift-card flex flex-col justify-between rounded-3xl bg-foreground p-7 text-background lg:col-span-2">
              <p className="text-sm font-medium opacity-80">Settings</p>
              <div>
                <h3 className="text-2xl font-medium tracking-tight">Staff belong to the business.</h3>
                <p className="mt-3 text-sm leading-6 opacity-80">
                  Configuration, people, and billing stay with the business. Admin is the owner layer above it.
                </p>
              </div>
            </article>

            <article className="lift-card flex flex-col justify-between rounded-3xl bg-primary p-7 text-primary-foreground lg:col-span-2">
              <p className="text-sm font-medium opacity-80">Business portfolio</p>
              <div>
                <h3 className="text-2xl font-medium tracking-tight">Every business, one view.</h3>
                <p className="mt-3 text-sm leading-6 opacity-80">
                  Each business you open sits on the same list, with its own sales, orders, and staff.
                </p>
              </div>
            </article>

            <figure className="lift-card overflow-hidden rounded-3xl border border-border bg-card shadow-sm lg:col-span-2">
              <div className="lift-media h-56">
                <OrdersPreview />
              </div>
              <figcaption className="px-5 py-4">
                <p className="text-sm font-medium">Orders</p>
                <p className="mt-1 text-sm text-muted-foreground">The live ledger and the completed one.</p>
              </figcaption>
            </figure>

            <figure className="lift-card overflow-hidden rounded-3xl border border-border bg-card shadow-sm lg:col-span-2">
              <div className="lift-media h-56">
                <BooksPreview />
              </div>
              <figcaption className="px-5 py-4">
                <p className="text-sm font-medium">Expenses</p>
                <p className="mt-1 text-sm text-muted-foreground">Spend against the plan, on the same desk.</p>
              </figcaption>
            </figure>

            <figure className="lift-card overflow-hidden rounded-3xl border border-border bg-card shadow-sm lg:col-span-2">
              <div className="lift-media h-56">
                <CrmPreview />
              </div>
              <figcaption className="px-5 py-4">
                <p className="text-sm font-medium">CRM</p>
                <p className="mt-1 text-sm text-muted-foreground">Customers and the pipeline, beside the sale.</p>
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="businesses" className="scroll-mt-28 bg-foreground px-5 py-20 text-background sm:py-28">
          <div className="mx-auto max-w-6xl">
            <h2 className="mx-auto max-w-3xl text-center text-3xl font-medium tracking-tight text-balance sm:text-5xl sm:leading-[1.1]">
              A better desk for every business.
            </h2>
            <div className="mx-auto mt-12 max-w-4xl">
              <div className="rounded-t-2xl bg-neutral-800 p-2 shadow-2xl sm:p-3">
                <div className="mb-2 flex gap-1.5 px-2 pt-1">
                  <span className="size-2.5 rounded-full bg-neutral-600" />
                  <span className="size-2.5 rounded-full bg-neutral-600" />
                  <span className="size-2.5 rounded-full bg-neutral-600" />
                </div>
                <div className="overflow-hidden rounded-lg">
                  <BusinessesPreview />
                </div>
              </div>
            </div>
            <div className="mt-14 grid gap-10 border-t border-background/15 pt-10 md:grid-cols-3">
              {layers.map((layer) => (
                <article key={layer.title} className="lift-card rounded-3xl border border-background/15 p-6">
                  <h3 className="text-lg font-medium">{layer.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-background/70">{layer.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-20 sm:py-28">
          <h2 className="mx-auto max-w-3xl text-center text-3xl font-medium tracking-tight text-balance sm:text-5xl">
            How the desk is used.
          </h2>
          <div className="mx-auto mt-14 grid max-w-6xl gap-5 md:grid-cols-3">
            {notes.map((note) => (
              <article key={note.role} className="lift-card rounded-3xl bg-muted p-7">
                <p className="text-base leading-7">“{note.quote}”</p>
                <p className="mt-8 text-sm font-medium">{note.role}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="pricing" className="scroll-mt-28 px-5 pb-24">
          <h2 className="mx-auto max-w-3xl text-center text-3xl font-medium tracking-tight text-balance sm:text-5xl">
            Three plans. One account.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-muted-foreground">
            Starter runs the counter. Complete runs the whole business. Owner is the view across every business you have. Each plan is $0 a month.
          </p>
          <div className="mx-auto mt-12 grid max-w-6xl gap-5 lg:grid-cols-3">
            {plans.map((plan) => (
              <article key={plan.id} className={`lift-card flex flex-col rounded-[2rem] p-8 ${plan.className}`}>
                <h3 className="text-2xl font-medium">{plan.name}</h3>
                <p className="mt-3 text-3xl font-medium tracking-tight">
                  $0 <span className="text-base font-normal opacity-70">/ month</span>
                </p>
                <p className="mt-2 text-sm opacity-80">{plan.summary}</p>
                <ul className="mt-8 flex flex-col gap-3 text-sm leading-6">
                  {plan.points.map((point) => (
                    <li key={point} className="flex gap-2">
                      <Check />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/signup?plan=${plan.id}`}
                  className={`mt-10 inline-flex h-11 items-center justify-center rounded-full text-sm font-medium transition-transform duration-500 ease-[cubic-bezier(0.165,0.84,0.44,1)] hover:-translate-y-0.5 ${plan.buttonClass}`}
                >
                  Start {plan.name}
                </Link>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-5 py-14">
        <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <img
              src="/brand/mark.png"
              alt="ComeraOS"
              width={980}
              height={1024}
              className="size-9 dark:invert"
            />
            <p className="mt-4 max-w-xs text-sm leading-6 text-muted-foreground">
              Business operating system for businesses, commerce, and the books.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Product</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
              <li><a href="#product" className="hover:text-foreground">Desks</a></li>
              <li><a href="#features" className="hover:text-foreground">Features</a></li>
              <li><a href="#pricing" className="hover:text-foreground">Plans</a></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium">Plans</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
              <li><Link href="/signup?plan=core" className="hover:text-foreground">Starter</Link></li>
              <li><Link href="/signup?plan=colony" className="hover:text-foreground">Complete</Link></li>
              <li><Link href="/signup?plan=cosmos" className="hover:text-foreground">Owner</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium">Account</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
              <li><Link href="/signup" className="hover:text-foreground">Sign up</Link></li>
              <li><Link href="/login" className="hover:text-foreground">Log in</Link></li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  )
}
