# App Store Submission

App Review guidelines, privacy requirements, and submission checklist.

## Pre-Submission Checklist

### App Completion
- [ ] All features working
- [ ] No crashes or major bugs
- [ ] Performance optimized
- [ ] Memory leaks resolved

### Content Requirements
- [ ] App icon (1024x1024)
- [ ] Screenshots for all device sizes
- [ ] App preview videos (optional)
- [ ] Description and keywords
- [ ] Privacy policy URL
- [ ] Support URL

### Technical Requirements
- [ ] Minimum iOS version set correctly
- [ ] Privacy manifest (`PrivacyInfo.xcprivacy`)
- [ ] All permissions have usage descriptions
- [ ] Export compliance answered
- [ ] Content rights declared

## Screenshots

### Required Sizes

```
iPhone 6.9" (iPhone 16 Pro Max): 1320 x 2868
iPhone 6.7" (iPhone 15 Plus): 1290 x 2796
iPhone 6.5" (iPhone 11 Pro Max): 1284 x 2778
iPhone 5.5" (iPhone 8 Plus): 1242 x 2208

iPad Pro 13" (6th gen): 2064 x 2752
iPad Pro 12.9" (2nd gen): 2048 x 2732
```

### Automating Screenshots

With fastlane:

```ruby
# Fastfile
lane :screenshots do
  capture_screenshots(
    scheme: "MyAppUITests",
    devices: [
      "iPhone 16 Pro Max",
      "iPhone 8 Plus",
      "iPad Pro (12.9-inch) (6th generation)"
    ],
    languages: ["en-US", "es-ES"],
    output_directory: "./screenshots"
  )
end
```

Snapfile:
```ruby
devices([
  "iPhone 16 Pro Max",
  "iPhone 8 Plus",
  "iPad Pro (12.9-inch) (6th generation)"
])

languages(["en-US"])
scheme("MyAppUITests")
output_directory("./screenshots")
clear_previous_screenshots(true)
```

UI Test for screenshots:
```swift
import XCTest

class ScreenshotTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        setupSnapshot(app)
        app.launch()
    }

    func testScreenshots() {
        snapshot("01-HomeScreen")

        // Navigate to feature
        app.buttons["Feature"].tap()
        snapshot("02-FeatureScreen")

        // Show detail
        app.cells.firstMatch.tap()
        snapshot("03-DetailScreen")
    }
}
```

## Privacy Policy

### Required Elements

1. What data is collected
2. How it's used
3. Who it's shared with
4. How long it's retained
5. User rights (access, deletion)
6. Contact information

### Template Structure

```markdown
# Privacy Policy for [App Name]

Last updated: [Date]

## Information We Collect
- Account information (email, name)
- Usage data (features used, session duration)

## How We Use Information
- Provide app functionality
- Improve user experience
- Send notifications (with permission)

## Data Sharing
We do not sell your data. We share with:
- Analytics providers (anonymized)
- Cloud storage providers

## Data Retention
We retain data while your account is active.
Request deletion at [email].

## Your Rights
- Access your data
- Request deletion
- Export your data

## Contact
[email]
```

## App Review Guidelines

### Common Rejections

**1. Incomplete Information**
- Missing demo account credentials
- Unclear functionality

**2. Bugs and Crashes**
- App crashes on launch
- Features don't work

**3. Placeholder Content**
- Lorem ipsum text
- Incomplete UI

**4. Privacy Issues**
- Missing usage descriptions
- Accessing data without permission

**5. Misleading Metadata**
- Screenshots don't match app
- Description claims unavailable features

### Demo Account

In App Store Connect notes:
```
Demo Account:
Username: demo@example.com
Password: Demo123!

Notes:
- Subscription features are enabled
- Push notifications require real device
```

### Review Notes

```
Notes for Review:

1. This app requires camera access for QR scanning (Settings tab > Scan QR).

2. Push notifications are used for:
   - Order status updates
   - New message alerts

3. Background location is used for:
   - Delivery tracking only when order is active

4. Demo account has pre-populated data for testing.

5. In-app purchases can be tested with sandbox account.
```

## Export Compliance

### Quick Check

Answer YES to export compliance if your app:
- Only uses HTTPS for network requests
- Only uses Apple's standard encryption APIs
- Only uses encryption for authentication/DRM

Most apps using HTTPS only can answer YES and select that encryption is exempt.

### Full Compliance

If using custom encryption, you need:
- Encryption Registration Number (ERN) from BIS
- Or exemption documentation

## App Privacy Labels

In App Store Connect, declare:

### Data Types

- Contact Info (name, email, phone)
- Health & Fitness
- Financial Info
- Location
- Browsing History
- Search History
- Identifiers (user ID, device ID)
- Usage Data
- Diagnostics

### Data Use

For each data type:
- **Linked to User**: Can identify the user
- **Used for Tracking**: Cross-app/web advertising

### Example Declaration

```
Contact Info - Email Address:
- Used for: App Functionality (account creation)
- Linked to User: Yes
- Used for Tracking: No

Usage Data:
- Used for: Analytics
- Linked to User: No
- Used for Tracking: No
```

## In-App Purchases

### Configuration

1. App Store Connect > Features > In-App Purchases
2. Create products with:
   - Reference name
   - Product ID (com.app.product)
   - Price
   - Localized display name/description

### Review Screenshots

Provide screenshots showing:
- Purchase screen
- Content being purchased
- Restore purchases option

### Subscription Guidelines

- Clear pricing shown before purchase
- Easy cancellation instructions
- Terms of service link
- Restore purchases available

## TestFlight

### Internal Testing

- Up to 100 internal testers
- No review required
- Immediate availability

### External Testing

- Up to 10,000 testers
- Beta App Review required
- Public link option

### Test Notes

```
What to Test:
- New feature: Cloud sync
- Bug fix: Login issues on iOS 18
- Performance improvements

Known Issues:
- Widget may not update immediately
- Dark mode icon pending
```

## Submission Process

### 1. Archive

```bash
xcodebuild archive \
    -project MyApp.xcodeproj \
    -scheme MyApp \
    -archivePath build/MyApp.xcarchive
```

### 2. Export

```bash
xcodebuild -exportArchive \
    -archivePath build/MyApp.xcarchive \
    -exportOptionsPlist ExportOptions.plist \
    -exportPath build/
```

### 3. Upload

```bash
xcrun altool --upload-app \
    --type ios \
    --file build/MyApp.ipa \
    --apiKey YOUR_KEY_ID \
    --apiIssuer YOUR_ISSUER_ID
```

### 4. Submit

1. App Store Connect > Select build
2. Complete all metadata
3. Submit for Review

## Post-Submission

### Review Timeline

- Average: 24-48 hours
- First submission: May take longer
- Complex apps: May need more review

### Responding to Rejection

1. Read rejection carefully
2. Address ALL issues
3. Reply in Resolution Center
4. Resubmit

### Expedited Review

Request for:
- Critical bug fixes
- Time-sensitive events
- Security issues

Submit request at: https://developer.apple.com/contact/app-store/?topic=expedite

## Phased Release

After approval, choose:
- **Immediate**: Available to everyone
- **Phased**: 7 days gradual rollout
  - Day 1: 1%
  - Day 2: 2%
  - Day 3: 5%
  - Day 4: 10%
  - Day 5: 20%
  - Day 6: 50%
  - Day 7: 100%

Can pause or accelerate at any time.

## Version Updates

### What's New

```
Version 2.1

New:
• Cloud sync across devices
• Dark mode support
• Widget for home screen

Improved:
• Faster app launch
• Better search results

Fixed:
• Login issues on iOS 18
• Notification sound not playing
```

### Maintaining Multiple Versions

- Keep previous version available during review
- Test backward compatibility
- Consider forced updates for critical fixes
