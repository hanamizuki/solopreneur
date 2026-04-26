# Workflow: Ship iOS App

<required_reading>
**Read NOW:**
1. references/app-store.md
2. references/ci-cd.md
</required_reading>

<process>
## Step 1: Pre-Release Checklist

- [ ] Version/build numbers updated
- [ ] No debug code or test data
- [ ] Privacy manifest complete (PrivacyInfo.xcprivacy)
- [ ] App icons all sizes (see references/app-icons.md)
- [ ] Screenshots prepared
- [ ] Release notes written

## Step 2: Archive

```bash
xcodebuild archive \
  -project AppName.xcodeproj \
  -scheme AppName \
  -archivePath ./build/AppName.xcarchive \
  -destination 'generic/platform=iOS'
```

## Step 3: Export for Distribution

**For TestFlight/App Store:**
```bash
xcodebuild -exportArchive \
  -archivePath ./build/AppName.xcarchive \
  -exportPath ./build/export \
  -exportOptionsPlist ExportOptions.plist
```

ExportOptions.plist:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>signingStyle</key>
    <string>automatic</string>
</dict>
</plist>
```

## Step 4: Upload to App Store Connect

```bash
xcrun altool --upload-app \
  -f ./build/export/AppName.ipa \
  -t ios \
  --apiKey YOUR_KEY_ID \
  --apiIssuer YOUR_ISSUER_ID
```

Or use `xcrun notarytool` with App Store Connect API.

## Step 5: TestFlight

1. Wait for processing in App Store Connect
2. Add testers (internal or external)
3. Gather feedback
4. Iterate

## Step 6: App Store Submission

In App Store Connect:
1. Complete app metadata
2. Add screenshots for all device sizes
3. Set pricing
4. Submit for review

## Step 7: Post-Release

- Monitor crash reports
- Respond to reviews
- Plan next version
</process>

<privacy_manifest>
Required since iOS 17. Create `PrivacyInfo.xcprivacy`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key>
    <false/>
    <key>NSPrivacyCollectedDataTypes</key>
    <array/>
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>CA92.1</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
```
</privacy_manifest>

<common_rejections>
| Reason | Fix |
|--------|-----|
| Crash on launch | Test on real device, check entitlements |
| Missing privacy descriptions | Add all NS*UsageDescription keys |
| Broken links | Verify all URLs work |
| Incomplete metadata | Fill all required fields |
| Guideline 4.3 (spam) | Differentiate from existing apps |
</common_rejections>
