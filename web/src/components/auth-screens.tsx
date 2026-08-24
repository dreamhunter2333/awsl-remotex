import { useState, type FormEvent } from "react"
import { LockKeyhole } from "lucide-react"

import { PreferenceControls } from "@/components/preference-controls"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api"
import { usePreferences } from "@/lib/preferences"
import { cn } from "@/lib/utils"

export function LoadingScreen({ message, error }: { message: string; error: boolean }) {
  return (
    <main className="grid h-dvh place-items-center bg-[var(--background)] text-[var(--foreground)]">
      <p className={cn("text-sm", error ? "text-[var(--danger)]" : "text-[var(--muted)]")}>{message}</p>
    </main>
  )
}

export function LoginScreen({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const { t } = usePreferences()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError("")
    const values = new FormData(event.currentTarget)
    const username = String(values.get("username") || "")
    const password = String(values.get("password") || "")
    try {
      await api.login(username, password)
      await onAuthenticated()
    } catch {
      setError(t("invalidPassword"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex h-dvh flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="flex h-11 items-center gap-2 border-b border-[var(--border)] bg-[var(--panel)] px-3.5">
        <span className="flex-1 text-sm font-semibold tracking-[-0.025em]">Awsl RemoteX</span>
        <PreferenceControls />
      </header>
      <div className="grid min-h-0 flex-1 place-items-center p-6">
        <form onSubmit={login} className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_20px_60px_var(--shadow)]">
          <div className="mb-5 grid size-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><LockKeyhole className="size-5" /></div>
          <h1 className="text-lg font-semibold tracking-[-0.025em]">{t("signIn")}</h1>
          <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">{t("signInDescription")}</p>
          <label className="mt-5 block space-y-1.5">
            <span className="text-xs text-[var(--muted)]">{t("username")}</span>
            <Input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus required defaultValue="admin" />
          </label>
          <label className="mt-3 block space-y-1.5">
            <span className="text-xs text-[var(--muted)]">{t("password")}</span>
            <Input name="password" type="password" autoComplete="current-password" required placeholder={t("passwordPlaceholder")} />
          </label>
          {error && <p role="alert" className="mt-3 text-xs text-[var(--danger)]">{error}</p>}
          <Button type="submit" className="mt-5 w-full" disabled={submitting}>{submitting ? t("signingIn") : t("signIn")}</Button>
        </form>
      </div>
    </main>
  )
}
