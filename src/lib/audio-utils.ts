export const INPUT_SAMPLE_RATE = 16000;
export const OUTPUT_SAMPLE_RATE = 24000;

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
}

function base64ToUint8Array(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function downsampleBuffer(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
) {
  if (inputRate === outputRate) {
    return input;
  }

  const sampleRateRatio = inputRate / outputRate;
  const newLength = Math.round(input.length / sampleRateRatio);
  const result = new Float32Array(newLength);

  let offsetResult = 0;
  let offsetInput = 0;

  while (offsetResult < result.length) {
    const nextOffsetInput = Math.round((offsetResult + 1) * sampleRateRatio);
    let accumulator = 0;
    let count = 0;

    for (let index = offsetInput; index < nextOffsetInput && index < input.length; index += 1) {
      accumulator += input[index];
      count += 1;
    }

    result[offsetResult] = count > 0 ? accumulator / count : 0;
    offsetResult += 1;
    offsetInput = nextOffsetInput;
  }

  return result;
}

export function encodeFloat32ToPcmBase64(
  input: Float32Array,
  inputRate: number,
) {
  const mono = downsampleBuffer(input, inputRate, INPUT_SAMPLE_RATE);
  const output = new ArrayBuffer(mono.length * 2);
  const view = new DataView(output);

  for (let index = 0; index < mono.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, mono[index]));
    view.setInt16(
      index * 2,
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
      true,
    );
  }

  return arrayBufferToBase64(output);
}

export function decodePcmBase64(base64: string) {
  const bytes = base64ToUint8Array(base64);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const output = new Float32Array(bytes.byteLength / 2);

  for (let index = 0; index < output.length; index += 1) {
    output[index] = view.getInt16(index * 2, true) / 0x8000;
  }

  return output;
}
