export const GUACAMOLE_SDK_VERSION = "1.6.0"
export const GUACAMOLE_SDK_SRC = `/vendor/guacamole/${GUACAMOLE_SDK_VERSION}/all.min.js`

export type GuacamoleSDK = typeof import("guacamole-common-js") & {
  API_VERSION: string
}

declare global {
  interface Window {
    Guacamole?: GuacamoleSDK
    webkitAudioContext?: typeof AudioContext
  }
}

export class GuacamoleSDKError extends Error {}

let sdkPromise: Promise<GuacamoleSDK> | undefined

export function assertGuacamoleSDK(value: GuacamoleSDK | undefined): GuacamoleSDK {
  if (!value) throw new GuacamoleSDKError("Guacamole SDK did not initialize")
  if (value.API_VERSION !== GUACAMOLE_SDK_VERSION) {
    throw new GuacamoleSDKError(`Expected Guacamole SDK ${GUACAMOLE_SDK_VERSION}, received ${value.API_VERSION || "unknown"}`)
  }
  return value
}

export function loadGuacamoleSDK() {
  if (window.Guacamole?.API_VERSION === GUACAMOLE_SDK_VERSION) return Promise.resolve(window.Guacamole)
  Reflect.deleteProperty(window, "Guacamole")
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise<GuacamoleSDK>((resolve, reject) => {
    const script = document.createElement("script")
    const fail = (reason: Error) => {
      if (window.Guacamole?.API_VERSION !== GUACAMOLE_SDK_VERSION) Reflect.deleteProperty(window, "Guacamole")
      script.remove()
      reject(reason)
    }

    script.src = GUACAMOLE_SDK_SRC
    script.async = true
    script.dataset.guacamoleVersion = GUACAMOLE_SDK_VERSION
    script.onload = () => {
      try {
        resolve(assertGuacamoleSDK(window.Guacamole))
      } catch (reason) {
        fail(reason instanceof Error ? reason : new GuacamoleSDKError("Invalid Guacamole SDK"))
      }
    }
    script.onerror = () => fail(new GuacamoleSDKError("Unable to load the official Guacamole SDK"))
    document.head.appendChild(script)
  }).catch((reason) => {
    sdkPromise = undefined
    throw reason
  })

  return sdkPromise
}
