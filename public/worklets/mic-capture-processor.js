class MicCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunkSize = 2048;
    this.buffer = new Float32Array(this.chunkSize);
    this.writeIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];

    if (!channel || channel.length === 0) {
      return true;
    }

    let offset = 0;

    while (offset < channel.length) {
      const available = this.chunkSize - this.writeIndex;
      const copySize = Math.min(available, channel.length - offset);

      this.buffer.set(channel.subarray(offset, offset + copySize), this.writeIndex);
      this.writeIndex += copySize;
      offset += copySize;

      if (this.writeIndex === this.chunkSize) {
        const chunk = new Float32Array(this.buffer);
        this.port.postMessage(chunk, [chunk.buffer]);
        this.writeIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor("mic-capture-processor", MicCaptureProcessor);
