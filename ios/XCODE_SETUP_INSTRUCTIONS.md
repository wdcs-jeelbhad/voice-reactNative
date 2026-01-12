# Xcode Setup Instructions for iOS Transcription

## ⚠️ CRITICAL: Add Files to Xcode Project

The native module files **MUST** be added to your Xcode project for React Native to find them.

### Quick Setup Steps:

1. **Open Xcode Workspace** (NOT .xcodeproj)
   ```bash
   open ios/voice.xcworkspace
   ```

2. **Add Swift Module File**
   - In Xcode Project Navigator, right-click on the `voice` folder (blue icon)
   - Select **"Add Files to 'voice'..."**
   - Navigate to and select: `ios/voice/VoskFileRecognitionModule.swift`
   - **IMPORTANT**: 
     - ✅ Check "Copy items if needed" (if file isn't in project folder)
     - ✅ Select "Create groups" 
     - ✅ Check your target "voice" in "Add to targets"
   - Click **"Add"**

3. **Add Objective-C Bridge File**
   - Repeat step 2 for: `ios/voice/VoskFileRecognitionModule.m`
   - Ensure target "voice" is checked

4. **Verify File Target Membership**
   - Select `VoskFileRecognitionModule.swift` in Project Navigator
   - In File Inspector (right panel), under "Target Membership"
   - ✅ Ensure "voice" is checked

   - Repeat for `VoskFileRecognitionModule.m`

5. **Verify Bridging Header** (if needed)
   - Select project in Navigator → Select "voice" target
   - Build Settings tab → Search "Bridging Header"
   - Should be: `voice/voice-Bridging-Header.h` or `$(SRCROOT)/voice/voice-Bridging-Header.h`

6. **Clean and Rebuild**
   ```bash
   # In Xcode:
   # Product → Clean Build Folder (Shift+Cmd+K)
   # Product → Build (Cmd+B)
   
   # Or from terminal:
   cd ios
   xcodebuild clean -workspace voice.xcworkspace -scheme voice
   ```

### Verify Module Registration

After building successfully:
1. Run the app: `yarn ios`
2. Check console logs - you should see available native modules listed
3. Try recording and transcribing

### Troubleshooting

**"Vosk native module not found"**
- ✅ Files added to Xcode project? (Check Project Navigator)
- ✅ Target membership checked? (File Inspector → Target Membership)
- ✅ No build errors? (Check Xcode build log)
- ✅ Clean rebuild? (Clean Build Folder, then rebuild)

**Build Errors**
- Check if `Speech` framework is linked (should be automatic)
- Verify Swift version compatibility
- Check bridging header path is correct

### Alternative: Verify Files Are in Project

Run this to check if files are referenced:
```bash
grep -r "VoskFileRecognition" ios/voice.xcodeproj/project.pbxproj
```

If no results, the files aren't added to the project yet.
