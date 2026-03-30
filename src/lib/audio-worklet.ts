export const MIC_CAPTURE_WORKLET_NAME = "mic-capture-processor";
export const MIC_CAPTURE_WORKLET_PATH = "/worklets/mic-capture-processor.js";

type MicCaptureNodeBundle = {
  processor: AudioWorkletNode;
  silentGain: GainNode;
  source: MediaStreamAudioSourceNode;
};

export async function createMicCaptureNode(
  context: AudioContext,
  stream: MediaStream,
  onChunk: (chunk: Float32Array) => void,
): Promise<MicCaptureNodeBundle> {
  await context.audioWorklet.addModule(MIC_CAPTURE_WORKLET_PATH);

  const source = context.createMediaStreamSource(stream);
  const processor = new AudioWorkletNode(context, MIC_CAPTURE_WORKLET_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
  });
  const silentGain = context.createGain();

  silentGain.gain.value = 0;
  processor.port.onmessage = (event: MessageEvent<Float32Array>) => {
    if (event.data instanceof Float32Array) {
      onChunk(event.data);
    }
  };

  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(context.destination);

  return {
    processor,
    silentGain,
    source,
  };
}
