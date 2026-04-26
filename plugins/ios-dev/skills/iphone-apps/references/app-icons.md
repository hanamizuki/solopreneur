# App Icons

Complete guide for generating, configuring, and managing iOS app icons from the CLI.

## Quick Start (Xcode 14+)

The simplest approach—provide a single 1024×1024 PNG and let Xcode auto-generate all sizes:

1. Create `Assets.xcassets/AppIcon.appiconset/`
2. Add your 1024×1024 PNG
3. Create `Contents.json` with single-size configuration

```json
{
  "images": [
    {
      "filename": "icon-1024.png",
      "idiom": "universal",
      "platform": "ios",
      "size": "1024x1024"
    }
  ],
  "info": {
    "author": "xcode",
    "version": 1
  }
}
```

The system auto-generates all required device sizes from this single image.

## CLI Icon Generation

### Using sips (Built into macOS)

Generate all required sizes from a 1024×1024 source:

```bash
#!/bin/bash
# generate-app-icons.sh
# Usage: ./generate-app-icons.sh source.png output-dir

SOURCE="$1"
OUTPUT="${2:-AppIcon.appiconset}"

mkdir -p "$OUTPUT"

# Generate all required sizes
sips -z 1024 1024 "$SOURCE" --out "$OUTPUT/icon-1024.png"
sips -z 180 180 "$SOURCE" --out "$OUTPUT/icon-180.png"
sips -z 167 167 "$SOURCE" --out "$OUTPUT/icon-167.png"
sips -z 152 152 "$SOURCE" --out "$OUTPUT/icon-152.png"
sips -z 120 120 "$SOURCE" --out "$OUTPUT/icon-120.png"
sips -z 87 87 "$SOURCE" --out "$OUTPUT/icon-87.png"
sips -z 80 80 "$SOURCE" --out "$OUTPUT/icon-80.png"
sips -z 76 76 "$SOURCE" --out "$OUTPUT/icon-76.png"
sips -z 60 60 "$SOURCE" --out "$OUTPUT/icon-60.png"
sips -z 58 58 "$SOURCE" --out "$OUTPUT/icon-58.png"
sips -z 40 40 "$SOURCE" --out "$OUTPUT/icon-40.png"
sips -z 29 29 "$SOURCE" --out "$OUTPUT/icon-29.png"
sips -z 20 20 "$SOURCE" --out "$OUTPUT/icon-20.png"

echo "Generated icons in $OUTPUT"
```

### Using ImageMagick

```bash
#!/bin/bash
# Requires: brew install imagemagick

SOURCE="$1"
OUTPUT="${2:-AppIcon.appiconset}"

mkdir -p "$OUTPUT"

for size in 1024 180 167 152 120 87 80 76 60 58 40 29 20; do
  convert "$SOURCE" -resize "${size}x${size}!" "$OUTPUT/icon-$size.png"
done
```

## Complete Contents.json (All Sizes)

For manual size control or when not using single-size mode:

```json
{
  "images": [
    {
      "filename": "icon-1024.png",
      "idiom": "ios-marketing",
      "scale": "1x",
      "size": "1024x1024"
    },
    {
      "filename": "icon-180.png",
      "idiom": "iphone",
      "scale": "3x",
      "size": "60x60"
    },
    {
      "filename": "icon-120.png",
      "idiom": "iphone",
      "scale": "2x",
      "size": "60x60"
    },
    {
      "filename": "icon-87.png",
      "idiom": "iphone",
      "scale": "3x",
      "size": "29x29"
    },
    {
      "filename": "icon-58.png",
      "idiom": "iphone",
      "scale": "2x",
      "size": "29x29"
    },
    {
      "filename": "icon-120.png",
      "idiom": "iphone",
      "scale": "3x",
      "size": "40x40"
    },
    {
      "filename": "icon-80.png",
      "idiom": "iphone",
      "scale": "2x",
      "size": "40x40"
    },
    {
      "filename": "icon-60.png",
      "idiom": "iphone",
      "scale": "3x",
      "size": "20x20"
    },
    {
      "filename": "icon-40.png",
      "idiom": "iphone",
      "scale": "2x",
      "size": "20x20"
    },
    {
      "filename": "icon-167.png",
      "idiom": "ipad",
      "scale": "2x",
      "size": "83.5x83.5"
    },
    {
      "filename": "icon-152.png",
      "idiom": "ipad",
      "scale": "2x",
      "size": "76x76"
    },
    {
      "filename": "icon-76.png",
      "idiom": "ipad",
      "scale": "1x",
      "size": "76x76"
    },
    {
      "filename": "icon-80.png",
      "idiom": "ipad",
      "scale": "2x",
      "size": "40x40"
    },
    {
      "filename": "icon-40.png",
      "idiom": "ipad",
      "scale": "1x",
      "size": "40x40"
    },
    {
      "filename": "icon-58.png",
      "idiom": "ipad",
      "scale": "2x",
      "size": "29x29"
    },
    {
      "filename": "icon-29.png",
      "idiom": "ipad",
      "scale": "1x",
      "size": "29x29"
    },
    {
      "filename": "icon-40.png",
      "idiom": "ipad",
      "scale": "2x",
      "size": "20x20"
    },
    {
      "filename": "icon-20.png",
      "idiom": "ipad",
      "scale": "1x",
      "size": "20x20"
    }
  ],
  "info": {
    "author": "xcode",
    "version": 1
  }
}
```

## Required Sizes Reference

| Purpose | Size (pt) | Scale | Pixels | Device |
|---------|-----------|-------|--------|--------|
| App Store | 1024×1024 | 1x | 1024 | Marketing |
| Home Screen | 60×60 | 3x | 180 | iPhone |
| Home Screen | 60×60 | 2x | 120 | iPhone |
| Home Screen | 83.5×83.5 | 2x | 167 | iPad Pro |
| Home Screen | 76×76 | 2x | 152 | iPad |
| Spotlight | 40×40 | 3x | 120 | iPhone |
| Spotlight | 40×40 | 2x | 80 | iPhone/iPad |
| Settings | 29×29 | 3x | 87 | iPhone |
| Settings | 29×29 | 2x | 58 | iPhone/iPad |
| Notification | 20×20 | 3x | 60 | iPhone |
| Notification | 20×20 | 2x | 40 | iPhone/iPad |

## iOS 18 Dark Mode & Tinted Icons

iOS 18 adds appearance variants: Any (default), Dark, and Tinted.

### Asset Structure

Create three versions of each icon:
- `icon-1024.png` - Standard (Any appearance)
- `icon-1024-dark.png` - Dark mode variant
- `icon-1024-tinted.png` - Tinted variant

### Dark Mode Design

- Use transparent background (system provides dark fill)
- Keep foreground elements recognizable
- Lighten foreground colors for contrast against dark background
- Or provide full icon with dark-tinted background

### Tinted Design

- Must be grayscale, fully opaque
- System applies user's tint color over the grayscale
- Use gradient background: #313131 (top) to #141414 (bottom)

### Contents.json with Appearances

```json
{
  "images": [
    {
      "filename": "icon-1024.png",
      "idiom": "universal",
      "platform": "ios",
      "size": "1024x1024"
    },
    {
      "appearances": [
        {
          "appearance": "luminosity",
          "value": "dark"
        }
      ],
      "filename": "icon-1024-dark.png",
      "idiom": "universal",
      "platform": "ios",
      "size": "1024x1024"
    },
    {
      "appearances": [
        {
          "appearance": "luminosity",
          "value": "tinted"
        }
      ],
      "filename": "icon-1024-tinted.png",
      "idiom": "universal",
      "platform": "ios",
      "size": "1024x1024"
    }
  ],
  "info": {
    "author": "xcode",
    "version": 1
  }
}
```

## Alternate App Icons

Allow users to choose between different app icons.

### Setup

1. Add alternate icon sets to asset catalog
2. Configure build setting in project.pbxproj:

```
ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = "DarkIcon ColorfulIcon";
```

Or add icons loose in project with @2x/@3x naming and configure Info.plist:

```xml
<key>CFBundleIcons</key>
<dict>
    <key>CFBundleAlternateIcons</key>
    <dict>
        <key>DarkIcon</key>
        <dict>
            <key>CFBundleIconFiles</key>
            <array>
                <string>DarkIcon</string>
            </array>
        </dict>
        <key>ColorfulIcon</key>
        <dict>
            <key>CFBundleIconFiles</key>
            <array>
                <string>ColorfulIcon</string>
            </array>
        </dict>
    </dict>
    <key>CFBundlePrimaryIcon</key>
    <dict>
        <key>CFBundleIconFiles</key>
        <array>
            <string>AppIcon</string>
        </array>
    </dict>
</dict>
```

### SwiftUI Implementation

```swift
import SwiftUI

enum AppIcon: String, CaseIterable, Identifiable {
    case primary = "AppIcon"
    case dark = "DarkIcon"
    case colorful = "ColorfulIcon"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .primary: return "Default"
        case .dark: return "Dark"
        case .colorful: return "Colorful"
        }
    }

    var iconName: String? {
        self == .primary ? nil : rawValue
    }
}

@Observable
class IconManager {
    var currentIcon: AppIcon = .primary

    init() {
        if let iconName = UIApplication.shared.alternateIconName,
           let icon = AppIcon(rawValue: iconName) {
            currentIcon = icon
        }
    }

    func setIcon(_ icon: AppIcon) async throws {
        guard UIApplication.shared.supportsAlternateIcons else {
            throw IconError.notSupported
        }

        try await UIApplication.shared.setAlternateIconName(icon.iconName)
        currentIcon = icon
    }

    enum IconError: LocalizedError {
        case notSupported

        var errorDescription: String? {
            "This device doesn't support alternate icons"
        }
    }
}

struct IconPickerView: View {
    @Environment(IconManager.self) private var iconManager
    @State private var error: Error?

    var body: some View {
        List(AppIcon.allCases) { icon in
            Button {
                Task {
                    do {
                        try await iconManager.setIcon(icon)
                    } catch {
                        self.error = error
                    }
                }
            } label: {
                HStack {
                    // Preview image (add to asset catalog)
                    Image("\(icon.rawValue)-preview")
                        .resizable()
                        .frame(width: 60, height: 60)
                        .clipShape(RoundedRectangle(cornerRadius: 12))

                    Text(icon.displayName)

                    Spacer()

                    if iconManager.currentIcon == icon {
                        Image(systemName: "checkmark")
                            .foregroundStyle(.blue)
                    }
                }
            }
            .buttonStyle(.plain)
        }
        .navigationTitle("App Icon")
        .alert("Error", isPresented: .constant(error != nil)) {
            Button("OK") { error = nil }
        } message: {
            if let error {
                Text(error.localizedDescription)
            }
        }
    }
}
```

## Design Guidelines

### Technical Requirements

- **Format**: PNG, non-interlaced
- **Transparency**: Not allowed (fully opaque)
- **Shape**: Square with 90° corners
- **Color Space**: sRGB or Display P3
- **Minimum**: 1024×1024 for App Store

### Design Constraints

1. **No rounded corners** - System applies mask automatically
2. **No text** unless essential to brand identity
3. **No photos or screenshots** - Too detailed at small sizes
4. **No drop shadows or gloss** - System may add effects
5. **No Apple hardware** - Copyright protected
6. **No SF Symbols** - Prohibited in icons/logos

### Safe Zone

The system mask cuts corners using a superellipse shape. Keep critical elements away from edges.

Corner radius formula: `10/57 × icon_size`
- 57px icon = 10px radius
- 1024px icon ≈ 180px radius

### Test at Small Sizes

Your icon must be recognizable at 29×29 pixels (Settings icon size). If details are lost, simplify the design.

## Troubleshooting

### "Missing Marketing Icon" Error

Ensure you have a 1024×1024 icon with idiom `ios-marketing` in Contents.json.

### Icon Has Transparency

App Store rejects icons with alpha channels. Check with:

```bash
sips -g hasAlpha icon-1024.png
```

Remove alpha channel:

```bash
sips -s format png -s formatOptions 0 icon-1024.png --out icon-1024-opaque.png
```

Or with ImageMagick:

```bash
convert icon-1024.png -background white -alpha remove -alpha off icon-1024-opaque.png
```

### Interlaced PNG Error

Convert to non-interlaced:

```bash
convert icon-1024.png -interlace none icon-1024.png
```

### Rounded Corners Look Wrong

Never pre-round your icon. Provide square corners and let iOS apply the mask. Pre-rounding causes visual artifacts where the mask doesn't align.

## Complete Generation Script

One-command generation for a new project:

```bash
#!/bin/bash
# setup-app-icon.sh
# Usage: ./setup-app-icon.sh source.png project-path

SOURCE="$1"
PROJECT="${2:-.}"
ICONSET="$PROJECT/Assets.xcassets/AppIcon.appiconset"

mkdir -p "$ICONSET"

# Generate 1024x1024 (single-size mode)
sips -z 1024 1024 "$SOURCE" --out "$ICONSET/icon-1024.png"

# Remove alpha channel if present
sips -s format png -s formatOptions 0 "$ICONSET/icon-1024.png" --out "$ICONSET/icon-1024.png"

# Generate Contents.json for single-size mode
cat > "$ICONSET/Contents.json" << 'EOF'
{
  "images": [
    {
      "filename": "icon-1024.png",
      "idiom": "universal",
      "platform": "ios",
      "size": "1024x1024"
    }
  ],
  "info": {
    "author": "xcode",
    "version": 1
  }
}
EOF

echo "App icon configured at $ICONSET"
```
