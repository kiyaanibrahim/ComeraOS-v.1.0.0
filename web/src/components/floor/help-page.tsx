"use client"

import { PosScreen } from "@/components/pos/pos-screen"
import { Card, CardContent } from "@/components/ui/card"

export function HelpPage({ businessKey }: { businessKey: string }) {
  return (
    <PosScreen businessKey={businessKey} title="Help" description="How the counter and the register work.">
      {({ business }) => (
        <Card>
          <CardContent className="flex max-w-xl flex-col gap-3 px-4 text-sm">
            <p>Sell charges a cart only while this login holds an open register session. A finished sale shows Completed on the logo.</p>
            <p>Open the register from the header. Count the drawer when you close it. Cash in and cash out live on the session, and they change the expected cash.</p>
            <p>
              {business.name} support:{" "}
              <a className="underline" href="mailto:support@comeraos.app">
                support@comeraos.app
              </a>
            </p>
          </CardContent>
        </Card>
      )}
    </PosScreen>
  )
}
