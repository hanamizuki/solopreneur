# Workflow: Debug an Existing iOS App

<required_reading>
**Read these reference files NOW:**
1. references/cli-observability.md
2. references/testing.md
</required_reading>

<philosophy>
Debugging is iterative. Use whatever gets you to root cause fastest:
- Small app, obvious symptom → read relevant code
- Large codebase, unclear cause → use tools to narrow down
- Code looks correct but fails → tools reveal runtime behavior
- After fixing → tools verify the fix
</philosophy>

<process>
## Step 1: Understand the Symptom

Ask:
- What's happening vs expected?
- When? (startup, after action, under load)
- Reproducible?
- Any error messages?

## Step 2: Build and Check for Compile Errors

```bash
xcodebuild -scheme AppName -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | xcsift
```

Fix compile errors first.

## Step 3: Choose Your Approach

**Know where problem is:** → Read that code
**No idea where to start:** → Use tools (Step 4)
**Code looks correct but fails:** → Runtime observation (Step 4)

## Step 4: Runtime Diagnostics

**Launch with logging:**
```bash
xcrun simctl boot "iPhone 16" 2>/dev/null || true
xcrun simctl install booted ./build/Build/Products/Debug-iphonesimulator/AppName.app
xcrun simctl launch --console booted com.company.AppName
```

**Match symptom to tool:**

| Symptom | Tool | Command |
|---------|------|---------|
| Memory leak | leaks | `leaks AppName` (on simulator process) |
| UI freeze | spindump | `spindump AppName` |
| Crash | crash report | Check Console.app or `~/Library/Logs/DiagnosticReports/` |
| Slow | profiler | `xcrun xctrace record --template 'Time Profiler'` |
| Silent failure | console | `xcrun simctl launch --console booted ...` |

## Step 5: Interpret & Read Relevant Code

Tool output tells you WHERE. Now read THAT code.

## Step 6: Fix the Root Cause

Not the symptom. The actual cause.

## Step 7: Verify

```bash
# Rebuild
xcodebuild build ...

# Run same diagnostic
# Confirm issue is resolved
```

## Step 8: Regression Test

Write a test that would catch this bug in future.
</process>

<common_patterns>
## Memory Leaks
**Cause:** Strong reference cycles in closures
**Fix:** `[weak self]` capture

## UI Freezes
**Cause:** Sync work on main thread
**Fix:** `Task { }` or `Task.detached { }`

## Crashes
**Cause:** Force unwrap, index out of bounds
**Fix:** `guard let`, bounds checking

## Silent Failures
**Cause:** Error swallowed, async not awaited
**Fix:** Add logging, check async chains
</common_patterns>

<ios_specific_tools>
```bash
# Console output from simulator
xcrun simctl spawn booted log stream --predicate 'subsystem == "com.company.AppName"'

# Install and launch
xcrun simctl install booted ./App.app
xcrun simctl launch --console booted com.company.AppName

# Screenshot
xcrun simctl io booted screenshot /tmp/screenshot.png

# Video recording
xcrun simctl io booted recordVideo /tmp/video.mp4
```
</ios_specific_tools>
