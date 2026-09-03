import { useEffect, useRef, useState, type FormEvent } from "react"
import { Activity, ChevronDown, FolderPlus, SlidersHorizontal, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api, type Asset, type AssetInput, type ConnectionTest, type CredentialType, type Protocol } from "@/lib/api"
import { defaultPort, displayGroup } from "@/lib/assets"
import { usePreferences } from "@/lib/preferences"
import { cn } from "@/lib/utils"

export function AssetDialog({ asset, open, onClose, onSubmit, onDelete }: {
  asset?: Asset
  open: boolean
  onClose: () => void
  onSubmit: (input: AssetInput) => Promise<void>
  onDelete: (asset: Asset) => Promise<void>
}) {
  const { t } = usePreferences()
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [protocol, setProtocol] = useState<Protocol>(asset?.protocol ?? "ssh")
  const [credentialType, setCredentialType] = useState<CredentialType>(asset?.credentialType ?? "prompt")
  const [customVNCSettings, setCustomVNCSettings] = useState(Boolean(asset?.settings?.vnc))
  const [vncAdvancedOpen, setVNCAdvancedOpen] = useState(Boolean(asset?.settings?.vnc))
  const [submitting, setSubmitting] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ConnectionTest>()
  const [error, setError] = useState("")

  useEffect(() => {
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [dialog, open])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    setSubmitting(true)
    setError("")
    try {
      await onSubmit(readInput(form, protocol, credentialType, customVNCSettings))
      form.reset()
      if (!asset) {
        setProtocol("ssh")
        setCredentialType("prompt")
        setCustomVNCSettings(false)
        setVNCAdvancedOpen(false)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("addAssetFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  const testConnection = async () => {
    const form = formRef.current
    if (!form?.reportValidity()) return
    setTesting(true)
    setTestResult(undefined)
    try {
      setTestResult(await api.testAsset(readInput(form, protocol, credentialType, customVNCSettings), asset?.id))
    } catch (reason) {
      setTestResult({ reachable: false, latencyMs: 0, message: reason instanceof Error ? reason.message : t("connectionFailed") })
    } finally {
      setTesting(false)
    }
  }

  const changeProtocol = (next: Protocol) => {
    setProtocol(next)
    if (next !== "ssh" && credentialType === "private-key") setCredentialType("prompt")
  }

  const credentialTypes: CredentialType[] = protocol === "ssh"
    ? ["prompt", "password", "private-key"]
    : ["prompt", "password"]

  const hasMatchingCredential = Boolean(
    asset?.credentialConfigured && asset.protocol === protocol && asset.credentialType === credentialType,
  )

  return (
    <dialog ref={setDialog} onClose={onClose} className="m-auto w-[min(460px,calc(100%-2rem))] rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] p-0 text-[var(--foreground)] shadow-[0_24px_80px_var(--shadow)] backdrop:bg-[var(--backdrop)]">
      <form ref={formRef} onSubmit={handleSubmit} className="p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold">{asset ? t("editAsset") : t("addRemoteAsset")}</h2>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={t("close")}><X className="size-4" /></Button>
        </div>
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5"><span className="text-xs text-[var(--muted)]">{t("name")}</span><Input name="name" required defaultValue={asset?.name} placeholder="prod-web-01" /></label>
            <label className="block space-y-1.5"><span className="text-xs text-[var(--muted)]">{t("group")}</span><Input name="group" defaultValue={asset && displayGroup(asset.group, "")} placeholder={t("groupPlaceholder")} /></label>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-xs text-[var(--muted)]">{t("protocol")}</legend>
            <div className="grid grid-cols-3 gap-1.5">
              {(["ssh", "rdp", "vnc"] as Protocol[]).map((item) => (
                <button key={item} type="button" onClick={() => changeProtocol(item)} className={cn("h-8 rounded-md border text-[11px] font-semibold uppercase transition", protocol === item ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-hover)]")}>{item}</button>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-3">
            <label className="block space-y-1.5"><span className="text-xs text-[var(--muted)]">{t("host")}</span><Input name="host" required defaultValue={asset?.host} placeholder="10.10.2.18" /></label>
            <label className="block space-y-1.5"><span className="text-xs text-[var(--muted)]">{t("port")}</span><Input key={protocol} name="port" type="number" min="1" max="65535" defaultValue={asset?.protocol === protocol ? asset.port : defaultPort(protocol)} required /></label>
          </div>
          <label className="block space-y-1.5"><span className="text-xs text-[var(--muted)]">{t("username")}</span><Input name="username" defaultValue={asset?.username} autoComplete="off" placeholder={protocol === "rdp" ? "Administrator" : "dream"} /></label>
          <fieldset>
            <legend className="mb-1.5 text-xs text-[var(--muted)]">{t("authentication")}</legend>
            <div className={cn("grid gap-1.5", protocol === "ssh" ? "grid-cols-3" : "grid-cols-2")}>
              {credentialTypes.map((item) => (
                <button key={item} type="button" onClick={() => setCredentialType(item)} className={cn("h-8 rounded-md border px-2 text-[11px] font-medium transition", credentialType === item ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-hover)]")}>
                  {item === "prompt" ? t("noSavedCredential") : item === "password" ? t("passwordCredential") : t("privateKeyCredential")}
                </button>
              ))}
            </div>
          </fieldset>
          {credentialType === "password" && (
            <label className="block space-y-1.5"><span className="text-xs text-[var(--muted)]">{t("connectionPassword")}</span><Input name="password" type="password" autoComplete="new-password" required={!hasMatchingCredential} placeholder={hasMatchingCredential ? t("passwordHint") : t("connectionPassword")} /></label>
          )}
          {credentialType === "private-key" && (
            <>
              <label className="block space-y-1.5"><span className="text-xs text-[var(--muted)]">{t("privateKey")}</span><textarea name="privateKey" required={!hasMatchingCredential} placeholder={hasMatchingCredential ? t("privateKeyHint") : t("privateKeyPlaceholder")} className="h-24 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 font-mono text-xs text-[var(--foreground)] shadow-sm outline-none transition placeholder:text-[var(--subtle)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]" /></label>
              <label className="block space-y-1.5"><span className="text-xs text-[var(--muted)]">{t("passphrase")}</span><Input name="passphrase" type="password" autoComplete="new-password" /></label>
            </>
          )}
          {protocol === "vnc" && (
            <details open={vncAdvancedOpen} onToggle={(event) => setVNCAdvancedOpen(event.currentTarget.open)} className="group rounded-lg border border-[var(--border)] bg-[var(--background)]">
              <summary className="flex h-8 cursor-pointer list-none items-center gap-2 px-2.5 text-xs font-medium text-[var(--muted)] marker:content-none">
                <SlidersHorizontal className="size-3.5" />
                <span>{t("advancedSettings")}</span>
                <ChevronDown className="ml-auto size-3.5 transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-3 border-t border-[var(--border)] px-3 py-3">
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <span>
                    <span className="block text-xs font-medium">{t("customVNCSettings")}</span>
                    <span className="mt-0.5 block text-[11px] text-[var(--muted)]">{t("customVNCSettingsHint")}</span>
                  </span>
                  <input className="peer sr-only" type="checkbox" checked={customVNCSettings} onChange={(event) => setCustomVNCSettings(event.target.checked)} />
                  <span className="relative h-5 w-9 shrink-0 rounded-full bg-[var(--border-strong)] transition-colors peer-checked:bg-[var(--accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent)] peer-focus-visible:ring-offset-2 after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4" />
                </label>
                {customVNCSettings && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1.5">
                      <span className="text-[11px] text-[var(--muted)]">{t("vncEncoding")}</span>
                      <Select name="vncEncodings" defaultValue={asset?.settings?.vnc?.encodings ?? "default"}>
                        <SelectTrigger className="h-8 w-full border border-[var(--border)] bg-[var(--input)]"><SelectValue /></SelectTrigger>
                        <SelectContent container={dialog}>
                          <SelectItem value="default">{t("protocolDefault")}</SelectItem>
                          <SelectItem value="tight">Tight JPEG</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-[11px] text-[var(--muted)]">{t("colorDepth")}</span>
                      <Select name="vncColorDepth" defaultValue={String(asset?.settings?.vnc?.colorDepth ?? "default")}>
                        <SelectTrigger className="h-8 w-full border border-[var(--border)] bg-[var(--input)]"><SelectValue /></SelectTrigger>
                        <SelectContent container={dialog}>
                          <SelectItem value="default">{t("protocolDefault")}</SelectItem>
                          {[32, 24, 16, 8].map((depth) => <SelectItem key={depth} value={String(depth)}>{t("colorDepthBits", { depth })}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-[11px] text-[var(--muted)]">{t("cursorRendering")}</span>
                      <Select name="vncCursor" defaultValue={asset?.settings?.vnc?.cursor ?? "default"}>
                        <SelectTrigger className="h-8 w-full border border-[var(--border)] bg-[var(--input)]"><SelectValue /></SelectTrigger>
                        <SelectContent container={dialog}>
                          <SelectItem value="default">{t("protocolDefault")}</SelectItem>
                          <SelectItem value="remote">{t("serverRenderedCursor")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-[11px] text-[var(--muted)]">{t("wheelDirection")}</span>
                      <Select name="vncWheelDirection" defaultValue={asset?.settings?.vnc?.wheelDirection ?? "default"}>
                        <SelectTrigger className="h-8 w-full border border-[var(--border)] bg-[var(--input)]"><SelectValue /></SelectTrigger>
                        <SelectContent container={dialog}>
                          <SelectItem value="default">{t("normalWheelDirection")}</SelectItem>
                          <SelectItem value="reverse">{t("reverseWheelDirection")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-[11px] text-[var(--muted)]">{t("clipboardEncoding")}</span>
                      <Select name="vncClipboardEncoding" defaultValue={asset?.settings?.vnc?.clipboardEncoding ?? "default"}>
                        <SelectTrigger className="h-8 w-full border border-[var(--border)] bg-[var(--input)]"><SelectValue /></SelectTrigger>
                        <SelectContent container={dialog}>
                          <SelectItem value="default">{t("protocolDefault")}</SelectItem>
                          <SelectItem value="UTF-8">UTF-8</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                  </div>
                )}
              </div>
            </details>
          )}
          {error && <p role="alert" className="text-xs text-[var(--danger)]">{error}</p>}
          {testResult && <p role="status" className={cn("text-xs", testResult.reachable ? "text-[var(--green)]" : "text-[var(--danger)]")}>{testResult.reachable ? t("connectionReachable", { latency: testResult.latencyMs }) : t("connectionUnreachable", { message: testResult.message })}</p>}
        </div>
        <div className="mt-5 flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={testing} onClick={testConnection}><Activity className="size-3.5" />{testing ? t("testingConnection") : t("testConnection")}</Button>
          {asset && (
            <>
              <Button type="button" variant="danger" size="sm" onClick={async () => { if (window.confirm(t("confirmDelete", { name: asset.name }))) await onDelete(asset) }}><Trash2 className="size-3.5" />{t("deleteAsset")}</Button>
            </>
          )}
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>{t("cancel")}</Button>
            <Button type="submit" size="sm" disabled={submitting}><FolderPlus className="size-3.5" />{submitting ? (asset ? t("saving") : t("adding")) : (asset ? t("saveChanges") : t("addAsset"))}</Button>
          </div>
        </div>
      </form>
    </dialog>
  )
}

function readInput(form: HTMLFormElement, protocol: Protocol, credentialType: CredentialType, customVNCSettings: boolean): AssetInput {
  const values = new FormData(form)
  const input: AssetInput = {
    name: String(values.get("name") || ""),
    group: String(values.get("group") || ""),
    protocol,
    host: String(values.get("host") || ""),
    port: Number(values.get("port") || defaultPort(protocol)),
    username: String(values.get("username") || ""),
    credentialType,
    password: String(values.get("password") || ""),
    privateKey: String(values.get("privateKey") || ""),
    passphrase: String(values.get("passphrase") || ""),
  }
  if (protocol !== "vnc" || !customVNCSettings) return input

  const encodings = String(values.get("vncEncodings") || "default")
  const colorDepth = Number(values.get("vncColorDepth"))
  const cursor = String(values.get("vncCursor") || "default")
  const wheelDirection = String(values.get("vncWheelDirection") || "default")
  const clipboardEncoding = String(values.get("vncClipboardEncoding") || "default")
  input.settings = {
    vnc: {
      ...(encodings === "tight" ? { encodings } : {}),
      ...([8, 16, 24, 32].includes(colorDepth) ? { colorDepth: colorDepth as 8 | 16 | 24 | 32 } : {}),
      ...(cursor === "remote" ? { cursor } : {}),
      ...(wheelDirection === "reverse" ? { wheelDirection } : {}),
      ...(clipboardEncoding === "UTF-8" ? { clipboardEncoding } : {}),
    },
  }
  return input
}
