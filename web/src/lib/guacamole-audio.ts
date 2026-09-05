import type { InputStream, RawAudioFormat } from "guacamole-common-js"

import type { GuacamoleSDK } from "./guacamole-sdk"

export class GuacamoleAudioPlayer {
  private enabled = false
  private nextStart = 0
  private readonly sources = new Set<AudioBufferSourceNode>()

  constructor(
    sdk: GuacamoleSDK,
    stream: InputStream,
    private readonly format: RawAudioFormat,
    private readonly context: AudioContext,
    onData: () => void = () => undefined,
  ) {
    context.createBuffer(format.channels, 1, format.rate)
    let received = false
    const reader = new sdk.ArrayBufferReader(stream)
    reader.ondata = (data) => {
      if (data.byteLength < format.bytesPerSample * format.channels) return
      if (!received) {
        received = true
        onData()
      }
      if (!this.enabled || context.state !== "running") return
      const samples = format.bytesPerSample === 1 ? new Int8Array(data) : new Int16Array(data)
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
      }
      this.sources.add(source)
      this.nextStart = Math.max(this.nextStart, context.currentTime)
      source.start(this.nextStart)
      this.nextStart += frames / this.format.rate
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    if (enabled) return
    for (const source of this.sources) {
      source.onended = null
      source.stop()
      source.disconnect()
    }
    this.sources.clear()
    this.nextStart = 0
  }

  sync() {
    this.nextStart = Math.min(this.nextStart, this.context.currentTime + 0.3)
  }
}
