import { ChevronDown, Languages, Laptop, Moon, Sun, type LucideIcon } from "lucide-react"

import { usePreferences, type Locale, type ThemeMode } from "@/lib/preferences"

export function PreferenceControls() {
  const { locale, setLocale, theme, setTheme, t } = usePreferences()

  return (
    <>
      <PreferenceSelect
        icon={Languages}
        label={t("language")}
        value={locale}
        onChange={(value) => setLocale(value as Locale)}
        options={[{ value: "zh-CN", label: "中文" }, { value: "en", label: "English" }]}
      />
      <PreferenceSelect
        icon={theme === "dark" ? Moon : theme === "light" ? Sun : Laptop}
        label={t("theme")}
        value={theme}
        onChange={(value) => setTheme(value as ThemeMode)}
        options={[
          { value: "system", label: t("followSystem") },
          { value: "dark", label: t("dark") },
          { value: "light", label: t("light") },
        ]}
      />
    </>
  )
}

function PreferenceSelect({ icon: Icon, label, value, onChange, options }: {
  icon: LucideIcon
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="relative flex h-7.5 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] pl-2 pr-1 text-[11px] text-[var(--muted)] shadow-sm transition hover:border-[var(--border-strong)] hover:text-[var(--foreground)]" title={label}>
      <Icon className="size-3 shrink-0" />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="h-full max-w-20 appearance-none bg-transparent pr-4 text-[11px] font-medium text-[var(--foreground)] outline-none"
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1 size-2.5 text-[var(--subtle)]" />
    </label>
  )
}
