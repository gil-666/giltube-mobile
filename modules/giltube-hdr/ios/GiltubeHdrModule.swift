import AVFoundation
import ExpoModulesCore

// AVPlayer.eligibleForHDRPlayback already combines display and decoder
// support, and AVFoundation picks SDR/HDR renditions itself.
public class GiltubeHdrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GiltubeHdr")

    Function("getCapabilities") { () -> [String: Bool] in
      let eligible = AVPlayer.eligibleForHDRPlayback
      return [
        "hdr10Display": eligible,
        "hlgDisplay": eligible,
        "hevcMain10HDR10Decoder": eligible,
        "hevcMain10Decoder": eligible,
      ]
    }
  }
}
