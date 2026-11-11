import { redirect } from "next/navigation"

export default async function Page({
  params,
}: {
  params: Promise<{ businessId: string }>
}) {
  const { businessId } = await params
  redirect(`/app/${businessId}/settings/locations`)
}
