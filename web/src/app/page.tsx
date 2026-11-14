import type { Metadata } from "next"
import { cookies } from "next/headers"

import { LandingPage } from "@/components/landing/landing-page"

export const metadata: Metadata = {
  title: "ComeraOS",
  description:
    "The operating system a business should run on. Sell, stock, buy, and close the books from one desk.",
}

export default async function Home() {
  const jar = await cookies()
  const seen = jar.get("comera-intro")?.value === "1"
  return <LandingPage skipIntro={seen} />
}
