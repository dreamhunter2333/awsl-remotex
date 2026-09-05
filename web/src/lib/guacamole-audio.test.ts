/// <reference types="node" />
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { describe, expect, it, vi } from "vitest"
import type { InputStream } from "guacamole-common-js"

import { GuacamoleAudioPlayer } from "./guacamole-audio"
import type { GuacamoleSDK } from "./guacamole-sdk"

const sdk = runInNewContext(`${readFileSync(new URL("../../public/vendor/guacamole/1.6.0/all.min.js", import.meta.url), "utf8")}; Guacamole`, {
  window: { atob },
}) as GuacamoleSDK

function createPlayer(mimetype = "audio/L16;rate=44100,channels=2") {
  const sources: Array<{
    buffer: { getChannelData: (channel: number) => Float32Array } | null
    onended: (() => void) | null
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
  }> = []
  const context = {
    currentTime: 10,
    state: "running",
    destination: {},
    createBuffer: (channels: number, frames: number) => {
      const output = Array.from({ length: channels }, () => new Float32Array(frames))
      return { getChannelData: (channel: number) => output[channel] }
    },
    createBufferSource: () => {
      const source = { buffer: null, onended: null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() }
      sources.push(source)
      return source
    },
  }
  const stream = {} as InputStream
  const onData = vi.fn()
  const player = new GuacamoleAudioPlayer(sdk, stream, sdk.RawAudioFormat.parse(mimetype), context as unknown as AudioContext, onData)
  const send = (samples: Int8Array | Int16Array) => stream.onblob?.(Buffer.from(samples.buffer).toString("base64"))
  return { context, onData, player, send, sources }
}

describe("session audio using the bundled Guacamole stream reader", () => {
  it("confirms support only once actual audio data arrives, even while muted", () => {
    const runtime = createPlayer()
    expect(runtime.onData).not.toHaveBeenCalled()
    runtime.send(new Int16Array())
    expect(runtime.onData).not.toHaveBeenCalled()
    runtime.send(new Int16Array([1, 2]))
    runtime.send(new Int16Array([3, 4]))
    expect(runtime.onData).toHaveBeenCalledOnce()
    expect(runtime.sources).toHaveLength(0)
  })

  it("discards muted data and decodes newly received stereo PCM after enabling", () => {
    const runtime = createPlayer()
    runtime.send(new Int16Array([1, 2, 3, 4]))
    expect(runtime.sources).toHaveLength(0)
    runtime.player.setEnabled(true)
    expect(runtime.sources).toHaveLength(0)
    runtime.send(new Int16Array([-32768, 16384, 8192, -16384]))
    expect(Array.from(runtime.sources[0].buffer!.getChannelData(0))).toEqual([-1, 0.25])
    expect(Array.from(runtime.sources[0].buffer!.getChannelData(1))).toEqual([0.5, -0.5])
    expect(runtime.sources[0].start).toHaveBeenCalledWith(10)
  })

  it("stops every queued source immediately without affecting another session", () => {
    const first = createPlayer()
    const second = createPlayer()
    for (const runtime of [first, second]) {
      runtime.player.setEnabled(true)
      runtime.send(new Int16Array(88200))
      runtime.send(new Int16Array(88200))
    }
    expect(first.sources[1].start).toHaveBeenCalledWith(11)
    first.player.setEnabled(false)
    for (const source of first.sources) {
      expect(source.stop).toHaveBeenCalledOnce()
      expect(source.disconnect).toHaveBeenCalledOnce()
    }
    for (const source of second.sources) expect(source.stop).not.toHaveBeenCalled()
    first.send(new Int16Array(88200))
    expect(first.sources).toHaveLength(2)
    first.context.currentTime = 20
    first.player.setEnabled(true)
    first.send(new Int16Array(88200))
    expect(first.sources[2].start).toHaveBeenCalledWith(20)
  })

  it("discards suspended-context data and releases finished 8-bit sources", () => {
    const runtime = createPlayer("audio/L8;rate=22050,channels=1")
    runtime.player.setEnabled(true)
    runtime.context.state = "suspended"
    runtime.send(new Int8Array([-128, 64]))
    expect(runtime.sources).toHaveLength(0)
    runtime.context.state = "running"
    runtime.send(new Int8Array([-128, 64]))
    const source = runtime.sources[0]
    expect(Array.from(source.buffer!.getChannelData(0))).toEqual([-1, 0.5])
    source.onended?.()
    expect(source.disconnect).toHaveBeenCalledOnce()
    runtime.player.setEnabled(false)
    expect(source.stop).not.toHaveBeenCalled()
  })
})
