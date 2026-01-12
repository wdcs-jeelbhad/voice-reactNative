# Troubleshooting: iOS Module Not Found

## Issue: "Available native modules: []" or "Vosk native module not found"

### Step 1: Verify Files Are in Xcode Project

1. Open `ios/voice.xcworkspace` in Xcode
2. In Project Navigator, verify you see:
   - ✅ `VoskFileRecognitionModule.swift` (with "S" icon)
   - ✅ `VoskFileRecognitionModule.m` (with "M" icon)
3. Both should be under the `voice` folder (blue icon)

### Step 2: Check Target Membership

For **each file** (`VoskFileRecognitionModule.swift` and `VoskFileRecognitionModule.m`):

1. Select the file in Project Navigator
2. Open File Inspector (right panel, first tab)
3. Under "Target Membership", ensure:
   - ✅ `voice` is **CHECKED**

### Step 3: Check Build Settings

1. Select project "voice" in Navigator
2. Select target "voice"
3. Build Settings tab
4. Search for "Bridging Header"
5. Should be: `voice-Bridging-Header.h` or `$(SRCROOT)/voice-Bridging-Header.h`

### Step 4: Clean and Rebuild

**In Xcode:**
1. Product → Clean Build Folder (Shift+Cmd+K)
2. Product → Build (Cmd+B)
3. Check for any build errors in the Issue Navigator (left panel, triangle icon)

**Common Build Errors:**
- "No such module 'React'" → Run `pod install`
- "Cannot find type 'RCTPromiseResolveBlock'" → Check bridging header includes React headers
- Swift compilation errors → Check Swift version compatibility

### Step 5: Verify Module Compiles

After building, check the build log:
1. View → Navigators → Report Navigator (or Cmd+9)
2. Look for `VoskFileRecognitionModule.swift` in the build log
3. Should show "Compile Swift source files" with no errors

### Step 6: Check Runtime

1. Run app: `yarn ios`
2. Check console for: "Available native modules: ..."
3. If still empty, check Xcode console for Swift/Objective-C errors

### Step 7: Manual Verification

If module still not found, try this in Xcode:

1. Product → Scheme → Edit Scheme
2. Run → Arguments → Environment Variables
3. Add: `RCT_DEBUG=1`
4. Run app and check logs

### Common Issues:

**Issue:** Files added but not compiling
- **Fix:** Check Target Membership is checked for both files

**Issue:** Swift/Objective-C interop errors
- **Fix:** Verify bridging header path is correct in Build Settings

**Issue:** Module compiles but not found at runtime
- **Fix:** Clean build folder, delete DerivedData, rebuild

**Issue:** "No such module 'React'"
- **Fix:** Run `cd ios && pod install`

### Nuclear Option (If Nothing Works):

1. Delete DerivedData:
   ```bash
   rm -rf ~/Library/Developer/Xcode/DerivedData
   ```
2. Clean everything:
   ```bash
   cd ios
   xcodebuild clean -workspace voice.xcworkspace -scheme voice
   pod deintegrate
   pod install
   ```
3. Rebuild in Xcode
