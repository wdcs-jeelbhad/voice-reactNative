import Foundation
import AVFoundation
import Speech
import React

@objc(VoskFileRecognitionModule)
class VoskFileRecognitionModule: NSObject {
  // Speech recognition request (cached for performance)
  private static var speechRecognizer: SFSpeechRecognizer?
  private static let recognizerLock = NSLock()
  
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }
  
  @objc
  func transcribeFile(_ audioFilePath: String, modelPath: String, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    // Process in background queue for better performance
    DispatchQueue.global(qos: .userInitiated).async {
      print("VoskFileRecognition: Starting transcription for: \(audioFilePath)")
      print("VoskFileRecognition: Using model: \(modelPath) (Note: iOS uses Apple Speech framework)")
      
      // Clean up file path
      var cleanPath = audioFilePath
      if cleanPath.hasPrefix("file://") {
        cleanPath = String(cleanPath.dropFirst(7))
      }
      
      let fileURL = URL(fileURLWithPath: cleanPath)
      
      // Check if file exists
      guard FileManager.default.fileExists(atPath: cleanPath) else {
        let errorMsg = "Audio file not found at: \(cleanPath)"
        print("VoskFileRecognition: ERROR - \(errorMsg)")
        DispatchQueue.main.async {
          rejecter("AUDIO_ERROR", errorMsg, nil)
        }
        return
      }
      
      print("VoskFileRecognition: Audio file exists: true")
      
      // Request speech recognition authorization
      SFSpeechRecognizer.requestAuthorization { authStatus in
        guard authStatus == .authorized else {
          let errorMsg = "Speech recognition authorization denied. Please enable in Settings."
          print("VoskFileRecognition: ERROR - \(errorMsg)")
          DispatchQueue.main.async {
            rejecter("AUTHORIZATION_ERROR", errorMsg, nil)
          }
          return
        }
        
        // Get or create speech recognizer
        Self.recognizerLock.lock()
        if Self.speechRecognizer == nil {
          // Use English locale (can be customized based on modelPath)
          Self.speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
        }
        let recognizer = Self.speechRecognizer!
        Self.recognizerLock.unlock()
        
        guard recognizer.isAvailable else {
          let errorMsg = "Speech recognizer is not available"
          print("VoskFileRecognition: ERROR - \(errorMsg)")
          DispatchQueue.main.async {
            rejecter("RECOGNIZER_ERROR", errorMsg, nil)
          }
          return
        }
        
        // Create recognition request
        let request = SFSpeechURLRecognitionRequest(url: fileURL)
        request.shouldReportPartialResults = false // Get final results only for better performance
        request.taskHint = .dictation // Optimize for dictation
        
        print("VoskFileRecognition: Starting speech recognition...")
        let startTime = Date()
        var hasResolved = false
        
        // Perform recognition
        let task = recognizer.recognitionTask(with: request) { result, error in
          // Prevent multiple resolutions
          guard !hasResolved else { return }
          
          if let error = error {
            hasResolved = true
            let nsError = error as NSError
            // Ignore cancellation errors (user cancelled)
            if nsError.domain == "kAFAssistantErrorDomain" && nsError.code == 216 {
              print("VoskFileRecognition: Recognition was cancelled")
              DispatchQueue.main.async {
                rejecter("TRANSCRIPTION_CANCELLED", "Recognition was cancelled", error)
              }
            } else {
              print("VoskFileRecognition: Recognition error: \(error.localizedDescription)")
              DispatchQueue.main.async {
                rejecter("TRANSCRIPTION_ERROR", error.localizedDescription, error)
              }
            }
            return
          }
          
          if let result = result {
            let transcribedText = result.bestTranscription.formattedString
            
            if result.isFinal {
              hasResolved = true
              let transcriptionTime = Date().timeIntervalSince(startTime)
              
              print("VoskFileRecognition: Transcription completed in \(transcriptionTime)s")
              print("VoskFileRecognition: Final result text: '\(transcribedText)'")
              
              // Post-process result
              let processedResult = self.postProcessTranscription(text: transcribedText)
              
              // Return result
              let resultDict: [String: Any] = ["text": processedResult]
              print("VoskFileRecognition: Returning transcription result: '\(processedResult)' (length: \(processedResult.count))")
              
              DispatchQueue.main.async {
                resolver(resultDict)
              }
            } else {
              // Partial result - log for debugging
              print("VoskFileRecognition: Partial result: '\(transcribedText)'")
            }
          }
        }
        
        // Set a timeout to prevent hanging (30 seconds max)
        DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + 30) {
          if !hasResolved {
            hasResolved = true
            task.cancel()
            print("VoskFileRecognition: Recognition timeout after 30 seconds")
            DispatchQueue.main.async {
              rejecter("TRANSCRIPTION_TIMEOUT", "Transcription timed out after 30 seconds", nil)
            }
          }
        }
      }
    }
  }
  
  private func postProcessTranscription(text: String) -> String {
    if text.isEmpty { return text }
    
    var processed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    
    // Capitalize first letter
    if !processed.isEmpty {
      processed = processed.prefix(1).uppercased() + processed.dropFirst()
    }
    
    // Add period at end if missing
    if !processed.isEmpty && !processed.hasSuffix(".") && !processed.hasSuffix("!") && !processed.hasSuffix("?") {
      processed += "."
    }
    
    // Remove extra spaces
    processed = processed.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    
    return processed.trimmingCharacters(in: .whitespacesAndNewlines)
  }
}

// Note: iOS implementation uses Apple's Speech framework (SFSpeechRecognizer)
// This is the native iOS solution for offline speech recognition
// No external Vosk framework needed - uses built-in iOS capabilities
