import Link from "next/link"

import { LoginForm } from "@/components/login-form"

export default function LoginPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-4xl">
        <Link href="/" className="mb-6 flex justify-center">
          <img
            src="/brand/logo-horizontal.png"
            alt="ComeraOS"
            width={1024}
            height={284}
            className="h-8 w-auto dark:invert"
          />
        </Link>
        <LoginForm />
      </div>
    </div>
  )
}
