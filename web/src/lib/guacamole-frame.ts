import type { KeyEventSender } from "@/lib/guacamole-keys"

interface GuacamoleDisplay {
  getHeight: () => number
  getScale: () => number
  getWidth: () => number
  scale: (value: number) => void
}

interface GuacamoleClient extends KeyEventSender {
  getDisplay: () => GuacamoleDisplay
}

interface GuacamoleScope {
  client?: {
    client?: GuacamoleClient
    clientProperties?: {
      autoFit: boolean
      maxScale: number
      minScale: number
      scale: number
    }
  }
  mainElementResized?: () => void
}

export function findGuacamoleClient(iframe: HTMLIFrameElement | null): KeyEventSender | undefined {
  return findGuacamoleScope(iframe)?.client?.client
}

export function fitGuacamoleDisplay(iframe: HTMLIFrameElement) {
  const main = iframe.contentDocument?.querySelector<HTMLElement>(".client-main")
  const scope = findGuacamoleScope(iframe)
  const properties = scope?.client?.clientProperties
  const display = scope?.client?.client?.getDisplay()
  if (!main || !properties || !display || !main.offsetWidth || !main.offsetHeight) return

  const minScale = Math.min(
    main.offsetWidth / Math.max(display.getWidth(), 1),
    main.offsetHeight / Math.max(display.getHeight(), 1),
  )
  const maxScale = Math.max(minScale, 3)
  const currentScale = display.getScale()
  const scale = currentScale < minScale || properties.autoFit
    ? minScale
    : Math.min(currentScale, maxScale)

  properties.minScale = minScale
  properties.maxScale = maxScale
  properties.scale = scale
  display.scale(scale)
}

export function resizeGuacamoleRemote(iframe: HTMLIFrameElement) {
  try {
    const scope = findGuacamoleScope(iframe)
    if (scope?.mainElementResized) {
      scope.mainElementResized()
      return
    }
    iframe.contentWindow?.dispatchEvent(new Event("resize"))
  } catch {
    return
  }
}

function findGuacamoleScope(iframe: HTMLIFrameElement | null): GuacamoleScope | undefined {
  if (!iframe) return undefined
  const main = iframe.contentDocument?.querySelector(".client-main")
  if (!main) return undefined
  const frameWindow = iframe.contentWindow as (Window & {
    angular?: {
      element: (element: Element) => {
        isolateScope: () => GuacamoleScope
      }
    }
  }) | null
  return frameWindow?.angular?.element(main).isolateScope()
}
