import { requireOptionalNativeModule } from 'expo';

export interface HDRCapabilities {
  hdr10Display: boolean;
  hlgDisplay: boolean;
  hevcMain10HDR10Decoder: boolean;
  hevcMain10Decoder: boolean;
  // Dolby Atmos (E-AC-3 JOC): decoded on the device, or passed through to a
  // TV or receiver over HDMI.
  atmosDecoder: boolean;
  atmosPassthrough: boolean;
}

const unsupported: HDRCapabilities = { hdr10Display: false, hlgDisplay: false, hevcMain10HDR10Decoder: false, hevcMain10Decoder: false, atmosDecoder: false, atmosPassthrough: false };

// Optional: builds made before this module existed simply report no HDR.
const native = requireOptionalNativeModule<{ getCapabilities(): HDRCapabilities }>('GiltubeHdr');

export function getHDRCapabilities(): HDRCapabilities {
  try {
    return native ? { ...unsupported, ...native.getCapabilities() } : unsupported;
  } catch {
    return unsupported;
  }
}

// GilTube's HDR ladder is HDR10 (PQ) or HLG; either needs an HDR screen and a
// HEVC Main10 decoder. The exact transfer is checked against the playlist.
export function canPlayHDR(videoRange: 'PQ' | 'HLG' = 'PQ'): boolean {
  const caps = getHDRCapabilities();
  return videoRange === 'HLG'
    ? caps.hlgDisplay && caps.hevcMain10Decoder
    : caps.hdr10Display && caps.hevcMain10HDR10Decoder;
}

export function deviceSupportsHDR(): boolean {
  return canPlayHDR('PQ') || canPlayHDR('HLG');
}

// Builds made before Atmos support report neither field, so they stay on AAC.
export function deviceSupportsAtmos(): boolean {
  const caps = getHDRCapabilities();
  return caps.atmosDecoder || caps.atmosPassthrough;
}
