# iOS Transcription Setup Instructions

## Overview

iOS transcription uses **Apple's native Speech framework** (SFSpeechRecognizer), which provides:
- ✅ Built-in offline speech recognition (no external frameworks needed)
- ✅ High accuracy with Apple's trained models
- ✅ Automatic language detection
- ✅ No model files required (models downloaded automatically by iOS)

## Setup Steps

### 1. Permissions

The `Info.plist` already includes the required permissions:
- `NSMicrophoneUsageDescription` - For recording
- `NSSpeechRecognitionUsageDescription` - For transcription

### 2. Install Dependencies

```bash
cd ios
pod install
cd ..
```

**Note:** No additional pods needed - uses built-in iOS frameworks!

### 3. Build and Run

```bash
yarn ios
```

## How It Works

1. **First Use**: iOS will prompt for speech recognition permission
2. **Model Download**: iOS automatically downloads language models when needed (first time only)
3. **Offline Support**: Once downloaded, models work offline
4. **Performance**: Optimized for iOS with background processing

## Supported Audio Formats

- M4A (default iOS recording format)
- WAV
- Other formats supported by AVFoundation

## Language Support

The implementation uses `en-US` locale by default. To support other languages:

1. Modify `VoskFileRecognitionModule.swift`
2. Change the locale identifier:
   ```swift
   Self.speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "fr-FR")) // French
   ```

## Testing

1. Record audio on iOS device
2. Stop recording
3. Transcription will start automatically
4. First time: Grant speech recognition permission
5. Result will appear in the text input

## Troubleshooting

**"Speech recognition authorization denied"**
- Go to Settings > Privacy & Security > Speech Recognition
- Enable for your app

**"Speech recognizer is not available"**
- Check internet connection (for first-time model download)
- Ensure device supports speech recognition (iOS 10+)

**No transcription result**
- Check console logs for errors
- Verify audio file exists and is readable
- Ensure audio contains speech (not silence)

## Advantages Over Vosk

- ✅ No external framework integration needed
- ✅ No model files to bundle (saves app size)
- ✅ Automatic model updates via iOS updates
- ✅ Better integration with iOS ecosystem
- ✅ Optimized for Apple devices
