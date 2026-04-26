# CLI Workflow

Build, run, test, and deploy iOS apps entirely from the terminal.

## Prerequisites

```bash
# Ensure Xcode is installed and selected
xcode-select -p
# Should show: /Applications/Xcode.app/Contents/Developer

# If not, run:
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer

# Install XcodeGen for project creation
brew install xcodegen

# Optional: prettier build output
brew install xcbeautify

# Optional: device deployment
brew install ios-deploy
```

## Create Project (XcodeGen)

Create a new iOS project entirely from CLI:

```bash
# Create directory structure
mkdir MyApp && cd MyApp
mkdir -p MyApp/{App,Models,Views,Services,Resources} MyAppTests MyAppUITests

# Create project.yml (Claude generates this - see project-scaffolding.md for full template)
cat > project.yml << 'EOF'
name: MyApp
options:
  bundleIdPrefix: com.yourcompany
  deploymentTarget:
    iOS: "18.0"
targets:
  MyApp:
    type: application
    platform: iOS
    sources: [MyApp]
    settings:
      PRODUCT_BUNDLE_IDENTIFIER: com.yourcompany.myapp
      DEVELOPMENT_TEAM: YOURTEAMID
EOF

# Create app entry point
cat > MyApp/App/MyApp.swift << 'EOF'
import SwiftUI

@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup {
            Text("Hello, World!")
        }
    }
}
EOF

# Generate .xcodeproj
xcodegen generate

# Verify
xcodebuild -list -project MyApp.xcodeproj

# Build
xcodebuild -project MyApp.xcodeproj -scheme MyApp -destination 'platform=iOS Simulator,name=iPhone 16' build
```

See [project-scaffolding.md](project-scaffolding.md) for complete project.yml templates.

## Building

### Basic Build

```bash
# Build for simulator
xcodebuild -project MyApp.xcodeproj \
    -scheme MyApp \
    -destination 'platform=iOS Simulator,name=iPhone 16' \
    build

# Build for device
xcodebuild -project MyApp.xcodeproj \
    -scheme MyApp \
    -destination 'generic/platform=iOS' \
    build
```

### Clean Build

```bash
xcodebuild -project MyApp.xcodeproj \
    -scheme MyApp \
    clean build
```

### Build with Specific SDK

```bash
# List available SDKs
xcodebuild -showsdks

# Build with specific SDK
xcodebuild -project MyApp.xcodeproj \
    -scheme MyApp \
    -sdk iphonesimulator17.0 \
    build
```

## Running on Simulator

### Boot and Launch

```bash
# List available simulators
xcrun simctl list devices

# Boot simulator
xcrun simctl boot "iPhone 16"

# Open Simulator app
open -a Simulator

# Install app
xcrun simctl install booted ~/Library/Developer/Xcode/DerivedData/MyApp-xxx/Build/Products/Debug-iphonesimulator/MyApp.app

# Launch app
xcrun simctl launch booted com.yourcompany.MyApp

# Or install and launch in one step
xcrun simctl install booted MyApp.app && xcrun simctl launch booted com.yourcompany.MyApp
```

### Simulator Management

```bash
# Create simulator
xcrun simctl create "My iPhone 16" "iPhone 16" iOS17.0

# Delete simulator
xcrun simctl delete "My iPhone 16"

# Reset simulator
xcrun simctl erase booted

# Screenshot
xcrun simctl io booted screenshot ~/Desktop/screenshot.png

# Record video
xcrun simctl io booted recordVideo ~/Desktop/recording.mov
```

### Simulate Conditions

```bash
# Set location
xcrun simctl location booted set 37.7749,-122.4194

# Send push notification
xcrun simctl push booted com.yourcompany.MyApp notification.apns

# Set status bar (time, battery, etc.)
xcrun simctl status_bar booted override --time "9:41" --batteryLevel 100
```

## Running on Device

### List Connected Devices

```bash
# List devices
xcrun xctrace list devices

# Or using ios-deploy
ios-deploy --detect
```

### Deploy to Device

```bash
# Install ios-deploy
brew install ios-deploy

# Deploy and run
ios-deploy --bundle MyApp.app --debug

# Just install without launching
ios-deploy --bundle MyApp.app --no-wifi

# Deploy with app data
ios-deploy --bundle MyApp.app --bundle_id com.yourcompany.MyApp
```

### Wireless Debugging

1. Connect device via USB once
2. In Xcode: Window > Devices and Simulators > Connect via network
3. Deploy wirelessly:

```bash
ios-deploy --bundle MyApp.app --wifi
```

## Testing

### Run Unit Tests

```bash
xcodebuild test \
    -project MyApp.xcodeproj \
    -scheme MyApp \
    -destination 'platform=iOS Simulator,name=iPhone 16' \
    -resultBundlePath TestResults.xcresult
```

### Run UI Tests

```bash
xcodebuild test \
    -project MyApp.xcodeproj \
    -scheme MyAppUITests \
    -destination 'platform=iOS Simulator,name=iPhone 16' \
    -resultBundlePath UITestResults.xcresult
```

### Run Specific Tests

```bash
# Single test
xcodebuild test \
    -project MyApp.xcodeproj \
    -scheme MyApp \
    -destination 'platform=iOS Simulator,name=iPhone 16' \
    -only-testing:MyAppTests/NetworkServiceTests/testFetchItems

# Test class
xcodebuild test \
    ... \
    -only-testing:MyAppTests/NetworkServiceTests
```

### View Test Results

```bash
# Open results in Xcode
open TestResults.xcresult

# Export to JSON (for CI)
xcrun xcresulttool get --path TestResults.xcresult --format json
```

## Debugging

### Console Logs

```bash
# Stream logs from simulator
xcrun simctl spawn booted log stream --predicate 'subsystem == "com.yourcompany.MyApp"'

# Stream logs from device
idevicesyslog | grep MyApp
```

### LLDB

```bash
# Attach to running process
lldb -n MyApp

# Debug app on launch
ios-deploy --bundle MyApp.app --debug
```

### Crash Logs

```bash
# Simulator crash logs
ls ~/Library/Logs/DiagnosticReports/

# Device crash logs (via Xcode)
# Window > Devices and Simulators > View Device Logs
```

## Archiving and Export

### Create Archive

```bash
xcodebuild archive \
    -project MyApp.xcodeproj \
    -scheme MyApp \
    -archivePath build/MyApp.xcarchive \
    -destination 'generic/platform=iOS'
```

### Export IPA

Create `ExportOptions.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store</string>
    <key>teamID</key>
    <string>YOUR_TEAM_ID</string>
    <key>uploadSymbols</key>
    <true/>
    <key>uploadBitcode</key>
    <false/>
</dict>
</plist>
```

Export:

```bash
xcodebuild -exportArchive \
    -archivePath build/MyApp.xcarchive \
    -exportOptionsPlist ExportOptions.plist \
    -exportPath build/
```

## App Store Connect

### Upload to TestFlight

```bash
xcrun altool --upload-app \
    --type ios \
    --file build/MyApp.ipa \
    --apiKey YOUR_KEY_ID \
    --apiIssuer YOUR_ISSUER_ID
```

Or use `xcrun notarytool` for newer workflows:

```bash
xcrun notarytool submit build/MyApp.ipa \
    --key ~/.appstoreconnect/AuthKey_XXXXX.p8 \
    --key-id YOUR_KEY_ID \
    --issuer YOUR_ISSUER_ID \
    --wait
```

### App Store Connect API Key

1. App Store Connect > Users and Access > Keys
2. Generate API Key
3. Download and store securely

## Useful Aliases

Add to `.zshrc`:

```bash
# iOS development
alias ios-build="xcodebuild -project *.xcodeproj -scheme \$(basename *.xcodeproj .xcodeproj) -destination 'platform=iOS Simulator,name=iPhone 16' build"
alias ios-test="xcodebuild test -project *.xcodeproj -scheme \$(basename *.xcodeproj .xcodeproj) -destination 'platform=iOS Simulator,name=iPhone 16'"
alias ios-run="xcrun simctl launch booted"
alias ios-log="xcrun simctl spawn booted log stream --level debug"
alias sim-boot="xcrun simctl boot 'iPhone 16' && open -a Simulator"
alias sim-screenshot="xcrun simctl io booted screenshot ~/Desktop/sim-\$(date +%Y%m%d-%H%M%S).png"
```

## Troubleshooting

### Build Failures

```bash
# Clear derived data
rm -rf ~/Library/Developer/Xcode/DerivedData

# Reset package caches
rm -rf ~/Library/Caches/org.swift.swiftpm

# Resolve packages
xcodebuild -resolvePackageDependencies
```

### Simulator Issues

```bash
# Kill all simulators
killall Simulator

# Reset all simulators
xcrun simctl shutdown all && xcrun simctl erase all
```

### Code Signing

```bash
# List identities
security find-identity -v -p codesigning

# Check provisioning profiles
ls ~/Library/MobileDevice/Provisioning\ Profiles/
```
