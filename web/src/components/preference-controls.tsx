import { Languages, Laptop, Moon, Sun, type LucideIcon } from "lucide-react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} title={label}>
        <Icon className="size-3.5 shrink-0 text-[var(--muted)]" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}
