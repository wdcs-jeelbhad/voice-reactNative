# Quick Check: Is Module Compiling?

## Step 1: Build in Xcode and Check for Errors

1. Open `ios/voice.xcworkspace`
2. Product → Build (Cmd+B)
3. Check the Issue Navigator (triangle icon on left)
4. **Look for any errors related to:**
   - `VoskFileRecognitionModule.swift`
   - `VoskFileRecognitionModule.m`
   - "Cannot find type 'RCTPromiseResolveBlock'"
   - "No such module 'React'"

## Step 2: Check Build Log

1. View → Navigators → Report Navigator (Cmd+9)
2. Select the latest build
3. Search for "VoskFileRecognition"
4. Should see:
   - ✅ "CompileSwift normal arm64" for VoskFileRecognitionModule.swift
   - ✅ "CompileC normal arm64" for VoskFileRecognitionModule.m
   - ❌ If you see errors, fix them first

## Step 3: Verify Module Registration

After a successful build, the module should be registered. If still not found:

1. **Check if React Native is finding modules at all:**
   - Look at console: "Available native modules: [...]"
   - If it's completely empty `[]`, there might be a React Native setup issue
   - If it has other modules but not VoskFileRecognition, it's a module-specific issue

2. **Common causes:**
   - Swift compilation errors (check build log)
   - Missing target membership
   - Bridging header not configured
   - Module not linked properly

## Step 4: Manual Test

Try building from command line to see full error output:

```bash
cd ios
xcodebuild -workspace voice.xcworkspace -scheme voice -configuration Debug -sdk iphonesimulator build 2>&1 | grep -i "vosk\|error\|warning" | head -20
```

This will show any compilation errors related to the module.
