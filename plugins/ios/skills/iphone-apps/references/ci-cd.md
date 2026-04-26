# CI/CD

Xcode Cloud, fastlane, and automated testing and deployment.

## Xcode Cloud

### Setup

1. Enable in Xcode: Product > Xcode Cloud > Create Workflow
2. Configure in App Store Connect

### Basic Workflow

```yaml
# Configured in Xcode Cloud UI
Workflow: Build and Test
Start Conditions:
  - Push to main
  - Pull Request to main

Actions:
  - Build
  - Test (iOS Simulator)

Post-Actions:
  - Notify (Slack)
```

### Custom Build Scripts

`.ci_scripts/ci_post_clone.sh`:
```bash
#!/bin/bash
set -e

# Install dependencies
brew install swiftlint

# Generate files
cd $CI_PRIMARY_REPOSITORY_PATH
./scripts/generate-assets.sh
```

`.ci_scripts/ci_pre_xcodebuild.sh`:
```bash
#!/bin/bash
set -e

# Run SwiftLint
swiftlint lint --strict --reporter json > swiftlint-report.json || true

# Check for errors
if grep -q '"severity": "error"' swiftlint-report.json; then
    echo "SwiftLint errors found"
    exit 1
fi
```

### Environment Variables

Set in Xcode Cloud:
- `API_BASE_URL`
- `SENTRY_DSN`
- Secrets (automatically masked)

Access in build:
```swift
let apiURL = Bundle.main.infoDictionary?["API_BASE_URL"] as? String
```

## Fastlane

### Installation

```bash
# Install
brew install fastlane

# Or via bundler
bundle init
echo 'gem "fastlane"' >> Gemfile
bundle install
```

### Fastfile

`fastlane/Fastfile`:
```ruby
default_platform(:ios)

platform :ios do
  desc "Run tests"
  lane :test do
    run_tests(
      scheme: "MyApp",
      device: "iPhone 16",
      code_coverage: true
    )
  end

  desc "Build and upload to TestFlight"
  lane :beta do
    # Increment build number
    increment_build_number(
      build_number: latest_testflight_build_number + 1
    )

    # Build
    build_app(
      scheme: "MyApp",
      export_method: "app-store"
    )

    # Upload
    upload_to_testflight(
      skip_waiting_for_build_processing: true
    )

    # Notify
    slack(
      message: "New build uploaded to TestFlight!",
      slack_url: ENV["SLACK_URL"]
    )
  end

  desc "Deploy to App Store"
  lane :release do
    # Ensure clean git
    ensure_git_status_clean

    # Build
    build_app(
      scheme: "MyApp",
      export_method: "app-store"
    )

    # Upload
    upload_to_app_store(
      submit_for_review: true,
      automatic_release: true,
      force: true,
      precheck_include_in_app_purchases: false
    )

    # Tag
    add_git_tag(
      tag: "v#{get_version_number}"
    )
    push_git_tags
  end

  desc "Sync certificates and profiles"
  lane :sync_signing do
    match(
      type: "appstore",
      readonly: true
    )
    match(
      type: "development",
      readonly: true
    )
  end

  desc "Take screenshots"
  lane :screenshots do
    capture_screenshots(
      scheme: "MyAppUITests"
    )
    frame_screenshots(
      white: true
    )
  end
end
```

### Match (Code Signing)

`fastlane/Matchfile`:
```ruby
git_url("https://github.com/yourcompany/certificates")
storage_mode("git")
type("appstore")
app_identifier(["com.yourcompany.app"])
username("developer@yourcompany.com")
```

Setup:
```bash
# Initialize
fastlane match init

# Generate certificates
fastlane match appstore
fastlane match development
```

### Appfile

`fastlane/Appfile`:
```ruby
app_identifier("com.yourcompany.app")
apple_id("developer@yourcompany.com")
itc_team_id("123456")
team_id("ABCDEF1234")
```

## GitHub Actions

### Basic Workflow

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: macos-14

    steps:
    - uses: actions/checkout@v4

    - name: Select Xcode
      run: sudo xcode-select -s /Applications/Xcode_15.4.app

    - name: Cache SPM
      uses: actions/cache@v3
      with:
        path: |
          ~/Library/Caches/org.swift.swiftpm
          .build
        key: ${{ runner.os }}-spm-${{ hashFiles('**/Package.resolved') }}

    - name: Build
      run: |
        xcodebuild build \
          -project MyApp.xcodeproj \
          -scheme MyApp \
          -destination 'platform=iOS Simulator,name=iPhone 16' \
          CODE_SIGNING_REQUIRED=NO

    - name: Test
      run: |
        xcodebuild test \
          -project MyApp.xcodeproj \
          -scheme MyApp \
          -destination 'platform=iOS Simulator,name=iPhone 16' \
          -resultBundlePath TestResults.xcresult \
          CODE_SIGNING_REQUIRED=NO

    - name: Upload Results
      if: always()
      uses: actions/upload-artifact@v3
      with:
        name: test-results
        path: TestResults.xcresult

  deploy:
    needs: test
    runs-on: macos-14
    if: github.ref == 'refs/heads/main'

    steps:
    - uses: actions/checkout@v4

    - name: Install Fastlane
      run: brew install fastlane

    - name: Deploy to TestFlight
      env:
        APP_STORE_CONNECT_API_KEY_KEY_ID: ${{ secrets.ASC_KEY_ID }}
        APP_STORE_CONNECT_API_KEY_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
        APP_STORE_CONNECT_API_KEY_KEY: ${{ secrets.ASC_KEY }}
        MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
        MATCH_GIT_BASIC_AUTHORIZATION: ${{ secrets.MATCH_GIT_AUTH }}
      run: fastlane beta
```

### Code Signing in CI

```yaml
- name: Import Certificate
  env:
    CERTIFICATE_BASE64: ${{ secrets.CERTIFICATE_BASE64 }}
    CERTIFICATE_PASSWORD: ${{ secrets.CERTIFICATE_PASSWORD }}
    KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}
  run: |
    # Create keychain
    security create-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
    security default-keychain -s build.keychain
    security unlock-keychain -p "$KEYCHAIN_PASSWORD" build.keychain

    # Import certificate
    echo "$CERTIFICATE_BASE64" | base64 --decode > certificate.p12
    security import certificate.p12 \
      -k build.keychain \
      -P "$CERTIFICATE_PASSWORD" \
      -T /usr/bin/codesign

    # Allow codesign access
    security set-key-partition-list \
      -S apple-tool:,apple:,codesign: \
      -s -k "$KEYCHAIN_PASSWORD" build.keychain

- name: Install Provisioning Profile
  env:
    PROVISIONING_PROFILE_BASE64: ${{ secrets.PROVISIONING_PROFILE_BASE64 }}
  run: |
    mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles
    echo "$PROVISIONING_PROFILE_BASE64" | base64 --decode > profile.mobileprovision
    cp profile.mobileprovision ~/Library/MobileDevice/Provisioning\ Profiles/
```

## Version Management

### Automatic Versioning

```ruby
# In Fastfile
lane :bump_version do |options|
  # Get version from tag or parameter
  version = options[:version] || git_tag_last_match(pattern: "v*").gsub("v", "")

  increment_version_number(
    version_number: version
  )

  increment_build_number(
    build_number: number_of_commits
  )
end
```

### Semantic Versioning Script

```bash
#!/bin/bash
# scripts/bump-version.sh

TYPE=$1  # major, minor, patch
CURRENT=$(agvtool what-marketing-version -terse1)

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case $TYPE in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
agvtool new-marketing-version $NEW_VERSION
echo "Version bumped to $NEW_VERSION"
```

## Test Reporting

### JUnit Format

```bash
xcodebuild test \
    -project MyApp.xcodeproj \
    -scheme MyApp \
    -destination 'platform=iOS Simulator,name=iPhone 16' \
    -resultBundlePath TestResults.xcresult

# Convert to JUnit
xcrun xcresulttool get --format json --path TestResults.xcresult > results.json
# Use xcresult-to-junit or similar tool
```

### Code Coverage

```bash
# Generate coverage
xcodebuild test \
    -enableCodeCoverage YES \
    -resultBundlePath TestResults.xcresult

# Export coverage report
xcrun xccov view --report --json TestResults.xcresult > coverage.json
```

### Slack Notifications

```ruby
# In Fastfile
after_all do |lane|
  slack(
    message: "Successfully deployed to TestFlight",
    success: true,
    default_payloads: [:git_branch, :git_author]
  )
end

error do |lane, exception|
  slack(
    message: "Build failed: #{exception.message}",
    success: false
  )
end
```

## App Store Connect API

### Key Setup

1. App Store Connect > Users and Access > Keys
2. Generate Key with App Manager role
3. Download `.p8` file

### Fastlane Configuration

`fastlane/Appfile`:
```ruby
# Use API Key instead of password
app_store_connect_api_key(
  key_id: ENV["ASC_KEY_ID"],
  issuer_id: ENV["ASC_ISSUER_ID"],
  key_filepath: "./AuthKey.p8",
  in_house: false
)
```

### Upload with altool

```bash
xcrun altool --upload-app \
    --type ios \
    --file build/MyApp.ipa \
    --apiKey $KEY_ID \
    --apiIssuer $ISSUER_ID
```

## Best Practices

### Secrets Management

- Never commit secrets to git
- Use environment variables or secret managers
- Rotate keys regularly
- Use match for certificate management

### Build Caching

```yaml
# Cache derived data
- uses: actions/cache@v3
  with:
    path: |
      ~/Library/Developer/Xcode/DerivedData
      ~/Library/Caches/org.swift.swiftpm
    key: ${{ runner.os }}-build-${{ hashFiles('**/*.swift') }}
```

### Parallel Testing

```ruby
run_tests(
  devices: ["iPhone 16", "iPad Pro (12.9-inch)"],
  parallel_testing: true,
  concurrent_workers: 4
)
```

### Conditional Deploys

```yaml
# Only deploy on version tags
on:
  push:
    tags:
      - 'v*'
```
