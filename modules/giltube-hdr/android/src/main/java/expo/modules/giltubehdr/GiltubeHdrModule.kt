package expo.modules.giltubehdr

import android.content.Context
import android.hardware.display.DisplayManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import android.os.Build
import android.view.Display
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Reports whether this device can present the HDR10/HLG HEVC ladder: the
// screen must accept HDR and a decoder must handle HEVC Main10 (HDR10 for PQ).
// It also reports Dolby Atmos (E-AC-3 JOC) support: a decoder on the device,
// or passthrough to a TV or receiver that decodes it.
class GiltubeHdrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("GiltubeHdr")

    Function("getCapabilities") {
      val context = appContext.reactContext ?: return@Function emptyCapabilities()
      val display = currentDisplay(context)
      val hdrTypes = display?.let { supportedHdrTypes(it) } ?: intArrayOf()
      val hevc = hevcProfiles()
      mapOf(
        "hdr10Display" to (Display.HdrCapabilities.HDR_TYPE_HDR10 in hdrTypes),
        "hlgDisplay" to (Display.HdrCapabilities.HDR_TYPE_HLG in hdrTypes),
        "hevcMain10HDR10Decoder" to (MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10HDR10 in hevc),
        "hevcMain10Decoder" to (MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10 in hevc),
        "atmosDecoder" to hasDecoder(MIMETYPE_AUDIO_EAC3_JOC),
        "atmosPassthrough" to atmosPassthrough()
      )
    }
  }

  private fun hasDecoder(mime: String): Boolean {
    val codecs = runCatching { MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos }.getOrNull() ?: return false
    return codecs.any { codec -> !codec.isEncoder && codec.supportedTypes.any { it.equals(mime, ignoreCase = true) } }
  }

  // Asked on every playback: passthrough depends on the HDMI/eARC sink
  // currently connected.
  private fun atmosPassthrough(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
    return runCatching {
      val format = AudioFormat.Builder()
        .setEncoding(AudioFormat.ENCODING_E_AC3_JOC)
        .setSampleRate(48000)
        .setChannelMask(AudioFormat.CHANNEL_OUT_5POINT1)
        .build()
      val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE)
        .build()
      AudioTrack.isDirectPlaybackSupported(format, attributes)
    }.getOrDefault(false)
  }

  private fun emptyCapabilities() = mapOf(
    "hdr10Display" to false,
    "hlgDisplay" to false,
    "hevcMain10HDR10Decoder" to false,
    "hevcMain10Decoder" to false,
    "atmosDecoder" to false,
    "atmosPassthrough" to false
  )

  companion object {
    // MediaFormat.MIMETYPE_AUDIO_EAC3_JOC, which needs API 28 as a constant.
    private const val MIMETYPE_AUDIO_EAC3_JOC = "audio/eac3-joc"
  }

  private fun currentDisplay(context: Context): Display? {
    val activityDisplay = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      runCatching { appContext.currentActivity?.display }.getOrNull()
    } else {
      null
    }
    if (activityDisplay != null) return activityDisplay
    val manager = context.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
    return manager?.getDisplay(Display.DEFAULT_DISPLAY)
  }

  @Suppress("DEPRECATION")
  private fun supportedHdrTypes(display: Display): IntArray {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      val modeTypes = display.mode.supportedHdrTypes
      if (modeTypes.isNotEmpty()) return modeTypes
    }
    return display.hdrCapabilities?.supportedHdrTypes ?: intArrayOf()
  }

  private fun hevcProfiles(): Set<Int> {
    val profiles = mutableSetOf<Int>()
    val codecs = runCatching { MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos }.getOrNull() ?: return profiles
    for (codec in codecs) {
      if (codec.isEncoder) continue
      if (codec.supportedTypes.none { it.equals(MediaFormat.MIMETYPE_VIDEO_HEVC, ignoreCase = true) }) continue
      val capabilities = runCatching { codec.getCapabilitiesForType(MediaFormat.MIMETYPE_VIDEO_HEVC) }.getOrNull() ?: continue
      capabilities.profileLevels.forEach { profiles.add(it.profile) }
    }
    return profiles
  }
}
