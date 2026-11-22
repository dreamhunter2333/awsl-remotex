import { guacamoleKeys } from "./guacamole-keys"
import type { GuacamoleSDK } from "./guacamole-sdk"

interface DocumentKeyboardTarget {
  isActive: () => boolean
  onkeydown: (keysym: number) => void
  onkeyup: (keysym: number) => void
  onpaste: (text: string) => boolean
  onPasteShortcut: (paste: () => void) => void
}

export interface DocumentKeyboardRegistration {
  capture: (onComplete: (keys: readonly number[]) => void) => () => void
  release: () => void
  unregister: () => void
}

interface KeyboardCapture {
  target: DocumentKeyboardTarget
  keys: number[]
  pressed: Set<number>
  onComplete: (keys: readonly number[]) => void
}

class DocumentKeyboardRouter {
  private capture?: KeyboardCapture
  private pendingPaste?: { target: DocumentKeyboardTarget; keys: readonly number[] }
  private readonly observer?: MutationObserver
  private readonly updateSuspension: () => void
  private readonly owners = new Map<number, DocumentKeyboardTarget>()
  private readonly targets = new Set<DocumentKeyboardTarget>()

  constructor(sdk: GuacamoleSDK, private readonly document: Document) {
    const macPlatform = /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
    document.addEventListener("keydown", (event) => {
      if (this.capture || event.altKey || event.ctrlKey === event.metaKey || event.key.toLowerCase() !== "v") return
      const target = this.getActiveTarget()
      if (!target) return
      event.stopImmediatePropagation()
      if (event.repeat) {
        event.preventDefault()
        return
      }
      const keys = [event.metaKey ? 0xffe7 : guacamoleKeys.control]
      if (event.shiftKey) keys.push(guacamoleKeys.shift)
      keys.push(guacamoleKeys.v)
      if (event.metaKey === macPlatform) {
        this.pendingPaste = { target, keys }
        return
      }
      this.pendingPaste = undefined
      event.preventDefault()
      target.onPasteShortcut(() => this.sendPaste(target, keys))
    }, true)
    document.addEventListener("keyup", (event) => {
      if (event.key.toLowerCase() === "v") this.pendingPaste = undefined
    }, true)
    document.addEventListener("paste", (event) => {
      const pending = this.pendingPaste
      this.pendingPaste = undefined
      if (this.capture || !event.clipboardData?.types.includes("text/plain")) return
      const target = this.getActiveTarget()
      if (!target || (pending && pending.target !== target)) return
      if (!target.onpaste(event.clipboardData.getData("text/plain"))) return
      event.preventDefault()
      if (pending) this.sendPaste(target, pending.keys)
    })

    const keyboard = new sdk.Keyboard(document)
    const onkeydown = (keysym: number) => {
      if (this.capture) {
        if (!this.capture.keys.includes(keysym)) this.capture.keys.push(keysym)
        this.capture.pressed.add(keysym)
        return false
      }
      const target = this.getActiveTarget()
      if (!target) return true
      this.owners.set(keysym, target)
      target.onkeydown(keysym)
      return false
    }
    const onkeyup = (keysym: number) => {
      if (this.capture) {
        const capture = this.capture
        capture.pressed.delete(keysym)
        if (capture.pressed.size === 0 && capture.keys.length > 0) {
          this.capture = undefined
          capture.onComplete(capture.keys)
        }
        return
      }
      const target = this.owners.get(keysym)
      if (!target) return
      this.owners.delete(keysym)
      target.onkeyup(keysym)
    }

    let suspended = true
    this.updateSuspension = () => {
      const next = this.targets.size === 0 || Boolean(this.document.querySelector("dialog[open]"))
      if (next === suspended) return
      suspended = next
      if (suspended) {
        this.capture = undefined
        this.pendingPaste = undefined
        keyboard.reset()
        keyboard.onkeydown = null
        keyboard.onkeyup = null
        return
      }
      keyboard.onkeydown = onkeydown
      keyboard.onkeyup = onkeyup
    }
    const Observer = document.defaultView?.MutationObserver
    if (Observer) this.observer = new Observer(this.updateSuspension)
  }

  register(target: DocumentKeyboardTarget): DocumentKeyboardRegistration {
    this.targets.add(target)
    if (this.targets.size === 1) {
      this.observer?.observe(this.document.documentElement, { attributes: true, attributeFilter: ["open"], subtree: true })
      this.updateSuspension()
    }
    return {
      capture: (onComplete) => this.captureKeys(target, onComplete),
      release: () => this.release(target),
      unregister: () => {
        this.release(target)
        this.targets.delete(target)
        if (this.targets.size === 0) {
          this.observer?.disconnect()
          this.updateSuspension()
        }
      },
    }
  }

  private release(target: DocumentKeyboardTarget) {
    if (this.capture?.target === target) this.capture = undefined
    if (this.pendingPaste?.target === target) this.pendingPaste = undefined
    for (const [keysym, owner] of this.owners) {
      if (owner !== target) continue
      this.owners.delete(keysym)
      target.onkeyup(keysym)
    }
  }

  private sendPaste(target: DocumentKeyboardTarget, keys: readonly number[]) {
    if (this.capture || this.getActiveTarget() !== target) return
    const temporaryKeys = keys.filter((key) => this.owners.get(key) !== target)
    for (const key of temporaryKeys) target.onkeydown(key)
    for (const key of temporaryKeys.reverse()) target.onkeyup(key)
  }

  private captureKeys(target: DocumentKeyboardTarget, onComplete: (keys: readonly number[]) => void) {
    for (const [keysym, owner] of this.owners) owner.onkeyup(keysym)
    this.owners.clear()
    this.pendingPaste = undefined
    const capture: KeyboardCapture = { target, keys: [], pressed: new Set(), onComplete }
    this.capture = capture
    return () => {
      if (this.capture === capture) this.capture = undefined
    }
  }

  private getActiveTarget() {
    if (this.document.querySelector("dialog[open]")) return
    if (this.document.activeElement?.closest("[data-local-keyboard]")) return
    for (const target of this.targets) {
      if (target.isActive()) return target
    }
  }
}

const documentKeyboards = new WeakMap<Document, DocumentKeyboardRouter>()

export function registerDocumentKeyboard(sdk: GuacamoleSDK, document: Document, target: DocumentKeyboardTarget) {
  let keyboard = documentKeyboards.get(document)
  if (!keyboard) {
    keyboard = new DocumentKeyboardRouter(sdk, document)
    documentKeyboards.set(document, keyboard)
  }
  return keyboard.register(target)
}
