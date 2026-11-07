import type { Metadata } from "next"

import { LandingPage } from "@/components/landing/landing-page"

export const metadata: Metadata = {
  title: "ComeraOS",
  description:
    "The operating system a business should run on. Sell, stock, buy, and close the books from one desk.",
}

export default function Home() {
  return <LandingPage />
}
