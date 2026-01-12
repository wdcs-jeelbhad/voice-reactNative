# Diagnosing "Available native modules: []" Issue

## Critical Check: Build Errors

The empty array `[]` suggests modules aren't being registered. This usually means **compilation errors**.

### Step 1: Check for Build Errors in Xcode

1. **Open Xcode**: `open ios/voice.xcworkspace`
2. **Build the project**: Product → Build (Cmd+B)
3. **Check Issue Navigator**: Click the triangle icon (⚠️) on the left sidebar
4. **Look for errors related to:**
   - `VoskFileRecognitionModule.swift`
   - `VoskFileRecognitionModule.m`
   - "Cannot find type 'RCTPromiseResolveBlock'"
   - "No such module 'React'"
   - Any Swift compilation errors

### Step 2: Check Build Log

1. **View → Navigators → Report Navigator** (Cmd+9)
2. Select the latest build
3. Search for "VoskFileRecognition" or "error"
4. **Look for:**
   - ✅ "CompileSwift" for VoskFileRecognitionModule.swift (should succeed)
   - ✅ "CompileC" for VoskFileRecognitionModule.m (should succeed)
   - ❌ Any red error messages

### Step 3: Verify File Locations

The files should be in:
- `ios/voice/VoskFileRecognitionModule.swift` ✅
- `ios/voice/VoskFileRecognitionModule.m` ✅

**NOT** in:
- `ios/VoskFileRecognitionModule.swift` ❌ (wrong location)
- `ios/VoskFileRecognitionModule.m` ❌ (wrong location)

### Step 4: Verify Target Membership

For **BOTH** files:
1. Select file in Project Navigator
2. File Inspector (right panel, first tab)
3. **Target Membership** section
4. ✅ **"voice" must be CHECKED**

### Step 5: Check Bridging Header Path

1. Select project "voice" in Navigator
2. Select target "voice"
3. Build Settings tab
4. Search: "Bridging Header"
5. Should be: `voice-Bridging-Header.h` or `voice/voice-Bridging-Header.h`

### Step 6: Clean Everything

```bash
# Delete DerivedData
rm -rf ~/Library/Developer/Xcode/DerivedData

# Clean build
cd ios
xcodebuild clean -workspace voice.xcworkspace -scheme voice

# Reinstall pods
pod install

# Rebuild
cd ..
yarn ios
```

### Step 7: Test Module Compilation

Try building just to check for errors:

```bash
cd ios
xcodebuild -workspace voice.xcworkspace -scheme voice -configuration Debug -sdk iphonesimulator build 2>&1 | grep -A 5 -i "vosk\|error" | head -30
```

## Most Common Issues:

1. **"No such module 'React'"**
   - Fix: Run `cd ios && pod install`

2. **"Cannot find type 'RCTPromiseResolveBlock'"**
   - Fix: Check bridging header includes React headers
   - Verify bridging header path in Build Settings

3. **Swift compilation errors**
   - Fix: Check Swift version compatibility
   - Verify all imports are correct

4. **Files not in target**
   - Fix: Check Target Membership for both files

## If Still Not Working:

Share the **exact build error messages** from Xcode's Issue Navigator or Build Log. The error messages will tell us exactly what's wrong.
