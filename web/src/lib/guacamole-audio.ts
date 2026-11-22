import type { InputStream, RawAudioFormat } from "guacamole-common-js"

import type { GuacamoleSDK } from "./guacamole-sdk"

export function getAudioContextConstructor() {
  return window.AudioContext ?? window.webkitAudioContext
}

export class GuacamoleAudioPlayer {
  private context?: AudioContext
  private ended = false
  private nextStart = 0
  private readonly sources = new Set<AudioBufferSourceNode>()

  constructor(
    sdk: GuacamoleSDK,
    stream: InputStream,
    private readonly format: RawAudioFormat,
    private readonly onDrained: () => void,
  ) {
    const reader = new sdk.ArrayBufferReader(stream)
    reader.ondata = (data) => {
      const context = this.context
      if (context?.state !== "running") return
      const samples = format.bytesPerSample === 1 ? new Int8Array(data) : new Int16Array(data, 0, Math.floor(data.byteLength / 2))
      const frames = Math.floor(samples.length / format.channels)
      if (!frames) return
      const buffer = context.createBuffer(format.channels, frames, format.rate)
      const scale = format.bytesPerSample === 1 ? 128 : 32768
      for (let channel = 0; channel < format.channels; channel++) {
        const output = buffer.getChannelData(channel)
        for (let frame = 0; frame < frames; frame++) output[frame] = samples[frame * format.channels + channel] / scale
      }
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)
      source.onended = () => {
        source.disconnect()
        this.sources.delete(source)
        if (this.ended && this.sources.size === 0) this.onDrained()
      }
      this.sources.add(source)
      this.nextStart = Math.max(this.nextStart, context.currentTime)
      source.start(this.nextStart)
      this.nextStart += frames / this.format.rate
    }
    reader.onend = () => {
      this.ended = true
      if (this.sources.size === 0) this.onDrained()
    }
  }

  setContext(context?: AudioContext) {
    this.context = context
    if (context) return
    for (const source of this.sources) {
      source.onended = null
      source.stop()
      source.disconnect()
    }
    this.sources.clear()
    this.nextStart = 0
    if (this.ended) this.onDrained()
  }

  sync() {
    if (this.context) this.nextStart = Math.min(this.nextStart, this.context.currentTime + 0.3)
  }
}
