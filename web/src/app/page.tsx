import type { Metadata } from "next"
import { Suspense } from "react"
import { cookies } from "next/headers"

import { LandingPage } from "@/components/landing/landing-page"

export const metadata: Metadata = {
  title: "ComeraOS",
  description:
    "The operating system a business should run on. Sell, stock, buy, and close the books from one desk.",
}

export default function Home() {
  return (
    <Suspense fallback={<LandingPage skipIntro />}>
      <PersonalizedLanding />
    </Suspense>
  )
}

async function PersonalizedLanding() {
  const jar = await cookies()
  const seen = jar.get("comera-intro")?.value === "1"
  return <LandingPage skipIntro={seen} />
}
