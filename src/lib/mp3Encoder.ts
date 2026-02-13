import { Mp3Encoder } from '@breezystack/lamejs';

export interface Mp3EncodingOptions {
  bitrateKbps?: number;
}

const floatTo16BitPcm = (input: Float32Array): Int16Array => {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    output[i] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
  }
  return output;
};

export const bufferToMp3 = (buffer: AudioBuffer, options: Mp3EncodingOptions = {}): Blob => {
  const bitrateKbps = options.bitrateKbps ?? 128;
  const numChannels = Math.min(Math.max(buffer.numberOfChannels, 1), 2);
  const sampleRate = buffer.sampleRate;
  const encoder = new Mp3Encoder(numChannels, sampleRate, bitrateKbps);

  const mp3Chunks: Uint8Array[] = [];
  const blockSize = 1152;
  const totalSamples = buffer.length;

  if (numChannels === 1) {
    const mono = buffer.getChannelData(0);
    for (let offset = 0; offset < totalSamples; offset += blockSize) {
      const chunk = floatTo16BitPcm(mono.subarray(offset, offset + blockSize));
      const encoded = encoder.encodeBuffer(chunk);
      if (encoded.length > 0) mp3Chunks.push(encoded);
    }
  } else {
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    for (let offset = 0; offset < totalSamples; offset += blockSize) {
      const leftChunk = floatTo16BitPcm(left.subarray(offset, offset + blockSize));
      const rightChunk = floatTo16BitPcm(right.subarray(offset, offset + blockSize));
      const encoded = encoder.encodeBuffer(leftChunk, rightChunk);
      if (encoded.length > 0) mp3Chunks.push(encoded);
    }
  }

  const flushed = encoder.flush();
  if (flushed.length > 0) mp3Chunks.push(flushed);

  return new Blob(mp3Chunks, { type: 'audio/mpeg' });
};
