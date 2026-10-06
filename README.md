# GilTube Mobile

Native iOS and Android client for GilTube, built with React Native and Expo (SDK 57, React Native 0.86, New Architecture, Expo Router with typed routes, React Compiler).

Current version: `0.9.35` (Android `versionCode` 49) in `package.json`, `app.json` and `android/app/build.gradle`.

## Features

- GILid browser authentication with PKCE and a one-time backend handoff
- persistent guest browsing with public discovery and playback
- encrypted session storage in iOS Keychain / Android Keystore
- native tab and stack navigation (Home, Subs, Create, Library, You)
- personalized home rails backed by the existing GilTube API
- native HLS playback with fullscreen, picture-in-picture, background playback, and system media controls
- HLS quality menu loaded from the master playlist, with Auto and per-rendition selection
- HDR playback (HDR10 / HLG) on capable screens and decoders, with an HDR on/off switch and an app-wide HDR setting
- playback intro clip before movies and episodes, with a Skip button (skipped when resuming, in watch parties, and on manual next-episode)
- resume from synced watch progress, with a "Resume where I left off" setting and Start over
- audio language and caption track selection, synced with GilTube desktop preferences
- double-tap seek with a configurable distance
- native search, channels, subscriptions, likes, sharing, comments, related videos, notifications, and playlists
- cinematic movie and series catalogs, detail pages, seasons, episodes, trailers, and watch-page context
- media badges on movie and series pages (max quality, HDR, 5.1 surround, 18+)
- series intro skipping and next-episode navigation
- live streams with live chat and polls, plus a Go Live studio that broadcasts from the camera over WebRTC
- watch parties with synced playback, room chat, member invitations, and host controls
- desktop-parity channel pages with native Videos, Clips, and Music tabs
- channel blocking for comments and notifications
- collapsible watch descriptions and threaded comments with replies, likes, GIF reactions (GIPHY), ownership deletion, and guest reading
- native chunked video uploads and a creator analytics/content dashboard
- multiple channels per account with an active-channel switcher
- offline video downloads with progress, persistent metadata, removal, and local playback (from the watch-page three-dot menu)
- swipe-down player minimization with uninterrupted playback and mini-player controls
- push notifications via Firebase Cloud Messaging (`expo-notifications`)
- Android App Links for `giltube.gilservers.com`, with a prompt to enable "Open by default"
- in-app Play Store update prompt on Android (flexible updates via `sp-react-native-in-app-updates`)
- English and Spanish (es-MX) UI, following the system language or an in-app choice
- GilTube Music: a Music tab with home, release, artist, track, search and downloads screens; a native player (mini player + full screen with synced lyrics and queue, shuffle/repeat, background playback with lock-screen controls); track/release downloads in the account's music quality for offline listening
- a single watch screen at a time: opening a video replaces the current watch screen, Android back always minimizes, and the mini player sits above the tab bar or at the bottom edge
- news panels from GilTube: Markdown announcements shown as a startup panel and/or as news notifications (push for loud ones), a news screen for `/news/<id>` links, call-to-action buttons that open native screens when possible, a "News and announcements" notification toggle, and an admin News screen
- account themes shared with the website: GilTube's built-in themes plus your own and installed ones (Themes screen under You and App settings), applied live across the app including light themes, gradients, background images, corner styles and particle effects; theme share links open in the app. Themes are created and edited in the website editor; WebGL animated backgrounds and custom fonts are web-only and fall back to the theme's gradient and colors
- live color, spacing, shape, and motion tokens (`src/theme/tokens.ts`); styles are built with `makeStyles`, which rebuilds them when the theme changes

## Requirements

- Node.js 22 or newer and npm
- Android: JDK 17 and the Android SDK (for `expo run:android` / Gradle)
- iOS: macOS with Xcode and CocoaPods
- A development build: the app uses custom native code (`modules/giltube-hdr`, WebRTC, in-app updates), so Expo Go is not supported
- `google-services.json` in the project root (referenced by `app.json` for Firebase Cloud Messaging; not documented here)

## Run locally

```bash
cp .env.example .env
npm install          # also applies patches/ via the postinstall patch-package hook
npx expo prebuild    # generates android/ and ios/ (both are gitignored)
npm run android      # or: npm run ios
```

After the first native build, start Metro for the dev client with `npm start`.

The GILid callback uses the custom `giltube://` URL scheme (`giltube://auth/callback`), so authentication requires a development build (`expo run:android` / `expo run:ios`) instead of Expo Go.

### Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | `https://giltube.gilservers.com/api/v1` | GilTube API base URL; media URLs are resolved against its origin |
| `EXPO_PUBLIC_GIPHY_API_KEY` | built-in fallback key | GIPHY search for GIF comments |

Set `EXPO_PUBLIC_API_URL` to a reachable backend URL when testing against a local server. A physical phone cannot use the host machine's `localhost` address.

## Scripts

| Script | Command |
| --- | --- |
| `npm start` | `expo start --dev-client` |
| `npm run android` | `expo run:android` |
| `npm run ios` | `expo run:ios` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` |
| `postinstall` | `patch-package` (runs automatically) |

## Android release builds

Release builds produce a Play Store app bundle from the generated `android/` project:

```bash
cd android
./gradlew bundleRelease    # output: android/app/build/outputs/bundle/release/
```

The `release` build type is signed with an `upload` signing config that reads `android/app/giltube-upload-key.jks` and `android/app/giltube-upload-key.password`. That signing config lives in the generated `android/app/build.gradle`, so re-running `npx expo prebuild --clean` drops it and it must be re-added. Keystores and password files are gitignored and must never be committed.

Bump the version in `app.json` (`expo.version` and `android.versionCode`) before a release. Frozen release snapshots (AABs, APKs, listing text, store graphics) are kept in `dist/`, which is gitignored and should not be edited.

## Project structure

```
app/                 Expo Router screens
  (tabs)/            Home, Subs, Create (sheet), Library, You, and the hidden Search tab
  video/[id]         watch page (player, intro, quality/HDR, comments, related)
  movies/, series/   catalogs and detail pages
  channel/[id], channels/, my-channels, create-channel
  live/[channelId], go-live
  watch-parties/, watch-party/[id]
  playlist/[id], playlists/, category/[slug]
  upload, dashboard, notifications, notification-settings
  settings, playback-settings, account-settings, login, auth/callback
  admin/             admin tools (in progress)
src/
  api/               API client, GilTube endpoints, chunked upload, GIPHY
  auth/              GILid PKCE auth and secure session storage
  player/            PlayerProvider (HLS sources, quality, HDR, mini player, watch-party sync)
  downloads/         offline downloads
  live/              live chat and live stream cards
  watch-parties/     watch party panel and event subscription
  notifications/     FCM registration, presentation, deep-link navigation
  app-links/         Android App Links verification prompt and web-route mapping
  updates/           Play Store in-app update prompt
  channels/, playlists/, settings/, i18n/, theme/, components/, utils/, types/, config/
  admin/             admin screens' API and components (in progress)
modules/giltube-hdr/ local Expo module for HDR capability detection
patches/             patch-package patches applied on install
play-store/          Play Store listing text and asset generator
```

## Native modules

- `modules/giltube-hdr` — local Expo module (`GiltubeHdr`) exposing `getCapabilities()`: HDR10/HLG display support and HEVC Main10 decoder support on Android; `AVPlayer.eligibleForHDRPlayback` on iOS. Loaded with `requireOptionalNativeModule`, so builds without it report no HDR support.
- Third-party native dependencies include `expo-video`, `react-native-webrtc` (with `@config-plugins/react-native-webrtc`), `sp-react-native-in-app-updates`, `react-native-device-info`, and `expo-notifications`.

## Patches

- `patches/expo-video+57.0.2.patch` — sets a bottom padding fraction on the Android subtitle view so captions stay clear of the seek bar, gesture area, and display edge.

## Play Store assets

`play-store/listing-en-US.md` holds the store listing text (short description ≤ 80 characters, full description ≤ 4000). `play-store/GenerateStoreAssets.java` renders the 512 px icon and 1024×500 feature graphic into `play-store/generated/`:

```bash
java play-store/GenerateStoreAssets.java .
```

## Related backend work

GilTube backend migration `040_create_mobile_auth_handoffs.sql` adds short-lived, single-use handoff codes. The OAuth client secret remains exclusively on the server.
