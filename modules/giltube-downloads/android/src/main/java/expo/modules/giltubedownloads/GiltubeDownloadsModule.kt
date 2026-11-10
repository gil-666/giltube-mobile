package expo.modules.giltubedownloads

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Download notifications with a real progress bar, which expo-notifications
// cannot draw. A download keeps one notification (keyed by `key`): ongoing
// with progress while it runs, then replaced by a done or failed notice that
// opens `link` when tapped.
class GiltubeDownloadsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("GiltubeDownloads")

    Function("progress") { key: String, title: String, text: String, percent: Int, indeterminate: Boolean, link: String ->
      val context = appContext.reactContext ?: return@Function false
      val builder = base(context, PROGRESS_CHANNEL, title, text, link)
        .setSmallIcon(android.R.drawable.stat_sys_download)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setProgress(100, percent.coerceIn(0, 100), indeterminate)
        .setPriority(NotificationCompat.PRIORITY_LOW)
      post(context, key, builder)
    }

    Function("finish") { key: String, title: String, text: String, failed: Boolean, link: String ->
      val context = appContext.reactContext ?: return@Function false
      val builder = base(context, DONE_CHANNEL, title, text, link)
        .setSmallIcon(if (failed) android.R.drawable.stat_notify_error else android.R.drawable.stat_sys_download_done)
        .setAutoCancel(true)
        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      post(context, key, builder)
    }

    Function("cancel") { key: String ->
      val context = appContext.reactContext ?: return@Function null
      NotificationManagerCompat.from(context).cancel(TAG, idFor(key))
      null
    }
  }

  private fun base(context: Context, channel: String, title: String, text: String, link: String): NotificationCompat.Builder {
    ensureChannels(context)
    return NotificationCompat.Builder(context, channel)
      .setContentTitle(title)
      .setContentText(text)
      .setColor(Color.parseColor("#EF4444"))
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setContentIntent(openIntent(context, link))
  }

  private fun post(context: Context, key: String, builder: NotificationCompat.Builder): Boolean {
    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return false
    return try {
      manager.notify(TAG, idFor(key), builder.build())
      true
    } catch (_: SecurityException) {
      false
    }
  }

  private fun openIntent(context: Context, link: String): PendingIntent? {
    val intent = if (link.isNotEmpty()) {
      Intent(Intent.ACTION_VIEW, Uri.parse(link)).setPackage(context.packageName)
    } else {
      context.packageManager.getLaunchIntentForPackage(context.packageName)
    } ?: return null
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(context, link.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(PROGRESS_CHANNEL) == null) {
      manager.createNotificationChannel(NotificationChannel(PROGRESS_CHANNEL, "Download progress", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Progress of video and music downloads"
        setShowBadge(false)
      })
    }
    if (manager.getNotificationChannel(DONE_CHANNEL) == null) {
      manager.createNotificationChannel(NotificationChannel(DONE_CHANNEL, "Finished downloads", NotificationManager.IMPORTANCE_DEFAULT).apply {
        description = "When a video or music download finishes"
      })
    }
  }

  private fun idFor(key: String) = key.hashCode()

  companion object {
    private const val TAG = "giltube-download"
    private const val PROGRESS_CHANNEL = "giltube-download-progress"
    private const val DONE_CHANNEL = "giltube-downloads"
  }
}
