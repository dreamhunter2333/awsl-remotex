import type { Protocol } from "@/lib/api"

export const protocolMeta = {
  ssh: { label: "SSH", color: "text-[var(--green)]", surface: "bg-[var(--green-soft)]" },
  rdp: { label: "RDP", color: "text-[var(--accent)]", surface: "bg-[var(--accent-soft)]" },
  vnc: { label: "VNC", color: "text-[var(--purple)]", surface: "bg-[var(--purple-soft)]" },
} satisfies Record<Protocol, { label: string; color: string; surface: string }>

export function displayGroup(group: string, fallback: string) {
  if (group === "__default__" || group === "默认分组") return fallback
  return group
}

export function defaultPort(protocol: Protocol) {
  if (protocol === "ssh") return 22
  if (protocol === "rdp") return 3389
  return 5900
}
