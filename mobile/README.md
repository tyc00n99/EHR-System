# EVVora caregiver app (iOS / Android shell)

A Capacitor shell that ships the hosted web app as a store download. The app loads
https://ehr-system-eight.vercel.app in a native webview, so caregivers always run the
same product the office uses — no separate codebase, no app-only release train.

## What is already configured
- `capacitor.config.ts` — app id `com.evvora.caregiver`, name EVVora, pointed at production.
- iOS `Info.plist` carries the location-permission sentence (EVV clock-in/clock-out, no tracking).
- Android manifest carries fine/coarse location permissions.
- `@capacitor/geolocation` is installed for native GPS when we move past the webview API.

## To run it, this Mac still needs
1. **Xcode** from the Mac App Store (free, ~12 GB), then: `sudo xcode-select -s /Applications/Xcode.app`
   and `xcodebuild -runFirstLaunch`. CocoaPods too: `brew install cocoapods`.
2. **Android Studio** (free) for the Android side.

Then, from `mobile/`: `npx cap sync && npx cap run ios` (or `android`).

## To actually distribute
- Apple Developer Program: $99/year, needed for TestFlight and the App Store.
- Google Play Console: $25 once.
- Apple sometimes pushes back on plain webview apps (guideline 4.2). Mitigations when we get
  there: native geolocation plugin for the clock, push notifications for messages and returned
  notes, and Face ID for sign-in — all natural next steps that also make the app better.

## Until the stores are set up
The web app already installs from the browser (Add to Home Screen) — it has the manifest and
icons — which is the same screen real estate without the store wait.
