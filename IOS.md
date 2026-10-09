# iPhone app

The native Capacitor 8 iOS project is `ios/App/App.xcodeproj`, using Swift Package Manager and bundle identifier `com.fmconditionsurvey.app`. It shares the web/Android app, authentication, offline drafts, report generation and owner-only deletion rules.

## Build on macOS

Install Xcode 26 or newer and Node 22 or newer. Copy `.env.example` to `.env.local` with the existing production Supabase URL and public anon key. Never include service-role credentials.

```sh
npm ci
npm run ios:open
```

In Xcode select the App target, choose your Apple development team in Signing & Capabilities, and run on a simulator or connected iPhone. Camera, photo-library and GPS purpose descriptions and required-reason privacy declarations are included. Reports save to the app's Documents directory and open the iOS share sheet. The existing web updater is included; native plugin changes still need a new Apple build.

## Build check from Windows

The manually dispatched **iOS build check** GitHub Actions workflow runs Xcode on macOS. Configure repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the existing public client values. It builds an **unsigned** device app. The artifact proves native compilation; it cannot be installed on an iPhone.

## TestFlight distribution

An Apple Developer Program membership, signing team, App Store Connect app record and Apple signing are still required. In Xcode choose a generic iOS device, Product → Archive, then Distribute App → App Store Connect. Complete Apple privacy disclosures for the actual account, site location, photos and report data, and test camera/GPS, offline restart, photo captions, PDF/Excel sharing, permissions and safe OTA updates on a physical iPhone before inviting testers. Replace the generated placeholder app icon and launch artwork with approved OCS assets before distribution.

No signed IPA or TestFlight release is produced by the unsigned build workflow.
