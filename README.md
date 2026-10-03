# GilTube Mobile

Native iOS and Android client for GilTube, built with React Native and Expo.

## Current foundation

- GILid browser authentication with PKCE and a one-time backend handoff
- persistent guest browsing with public discovery and playback
- encrypted session storage in iOS Keychain / Android Keystore
- native tab and stack navigation
- personalized home rails backed by the existing GilTube API
- native HLS playback with fullscreen, picture-in-picture, and system media controls
- native search, channels, subscriptions, likes, sharing, comments, related videos, notifications, and playlists
- cinematic movie and series catalogs, detail pages, seasons, episodes, and watch-page context
- series intro skipping, next-episode navigation, and adaptive HLS quality selection
- race-free watch-to-watch navigation with native initial-load and buffering feedback
- desktop-parity channel pages with native Videos, Clips, and Music tabs
- collapsible watch descriptions and threaded comments with replies, likes, ownership deletion, and guest reading
- native chunked video uploads and a creator analytics/content dashboard
- offline video downloads with progress, persistent metadata, removal, and local playback
- watch-page downloads live in the three-dot menu instead of the primary action row
- swipe-down player minimization with uninterrupted playback and mini-player controls
- shared GilTube color, spacing, shape, and motion tokens

## Run locally

Node.js 22 or newer is required. This machine did not have Node installed when the project was created.

```bash
cp .env.example .env
npm install
npx expo prebuild
npm run android
```

The GILid callback uses the custom `giltube://` URL scheme, so authentication requires a development build (`expo run:android` / `expo run:ios`) instead of Expo Go.

Set `EXPO_PUBLIC_API_URL` to a reachable backend URL when testing against a local server. A physical phone cannot use the host machine's `localhost` address.

## Related backend work

GilTube backend migration `040_create_mobile_auth_handoffs.sql` adds short-lived, single-use handoff codes. The OAuth client secret remains exclusively on the server.
