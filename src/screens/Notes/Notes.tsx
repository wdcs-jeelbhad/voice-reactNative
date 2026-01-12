import type { RootScreenProps } from '@/navigation/types';

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  PermissionsAndroid,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';

import { Paths } from '@/navigation/paths';
import { useTheme } from '@/theme';
import { SafeScreen } from '@/components/templates';

import AudioRecorderPlayer, {
  AudioSourceAndroidType,
  AudioEncoderAndroidType,
  OutputFormatAndroidType,
  AVEncoderAudioQualityIOSType,
  AudioSet,
  type PlayBackType,
} from 'react-native-audio-recorder-player';

import RNFS from 'react-native-fs';

function Notes({}: RootScreenProps<Paths.Notes>) {
  const { layout } = useTheme();

  const [isRecording, setIsRecording] = useState(false);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState<string>('');
  const textInputRef = useRef<TextInput>(null);

  // Initialize AudioRecorderPlayer using useRef for lazy initialization
  // Version 3.x doesn't use Nitro modules, so simple initialization works
  const audioRecorderPlayerRef = useRef<any>(null);

  const getAudioRecorderPlayer = () => {
    // Lazy initialization - only create when first needed
    if (!audioRecorderPlayerRef.current) {
      try {
        // Version 3.x uses standard class constructor
        audioRecorderPlayerRef.current = new AudioRecorderPlayer();
        audioRecorderPlayerRef.current.setSubscriptionDuration(0.1);
      } catch (error) {
        console.error('Failed to initialize AudioRecorderPlayer:', error);
        return null;
      }
    }
    return audioRecorderPlayerRef.current;
  };

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (audioRecorderPlayerRef.current) {
        try {
          audioRecorderPlayerRef.current.removeRecordBackListener();
          audioRecorderPlayerRef.current.removePlayBackListener();
        } catch (error) {
          console.error('Error cleaning up AudioRecorderPlayer:', error);
        }
      }
    };
  }, []);

  const requestAudioPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message: 'This app needs access to your microphone to record audio.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn('Permission request error:', err);
        return false;
      }
    } else {
      // iOS: Permissions are handled automatically via Info.plist
      // The native module will request permission when starting recording
      // We just need to check if we can proceed
      return true;
    }
  };

  const startRecording = async () => {
    try {
      // Request permission first
      const hasPermission = await requestAudioPermission();
      if (!hasPermission) {
        Alert.alert('Permission Denied', 'Microphone permission is required to record audio.');
        return;
      }

      const player = getAudioRecorderPlayer();
      if (!player) {
        console.error('AudioRecorderPlayer not available');
        return;
      }
      
      let path: string;
      let audioSet: AudioSet | undefined;

      if (Platform.OS === 'android') {
        // Record in WAV/PCM format for Vosk compatibility
        // Vosk requires: 16kHz, mono, 16-bit PCM
        path = `${RNFS.ExternalDirectoryPath}/note_${Date.now()}.wav`;
        audioSet = {
          AudioSourceAndroid: AudioSourceAndroidType.MIC,
          OutputFormatAndroid: OutputFormatAndroidType.WAVE, // WAV format
          AudioEncoderAndroid: AudioEncoderAndroidType.PCM_16BIT, // 16-bit PCM
          AudioSamplingRateAndroid: 16000, // Vosk recommended: 16kHz
          AudioChannelsAndroid: 1, // Mono
          AudioEncodingBitRateAndroid: 256000, // 16kHz * 16-bit = 256kbps
        };
      } else {
        // iOS: Use just filename - library handles the path internally
        // iOS prefers .m4a format, but we'll try .wav first
        const timestamp = Date.now();
        path = `note_${timestamp}.m4a`;
        // Don't set audioSet for iOS - let it use defaults first
        audioSet = undefined;
      }

      // Log to verify configuration
      console.log('Starting recorder with audioSet:', JSON.stringify(audioSet));
      console.log('Platform:', Platform.OS);
      console.log('Path:', path);

      // Start recording with platform-specific handling
      if (Platform.OS === 'ios') {
        // iOS: Try with no config first (most compatible)
        let recordingStarted = false;
        let actualPath = path;
        
        try {
          // First try: No audioSet at all (default iOS settings)
          const result = await player.startRecorder(path, undefined);
          actualPath = result || path;
          console.log('iOS recording started with default settings, result:', result);
          recordingStarted = true;
        } catch (defaultError: any) {
          console.warn('iOS default recording failed, trying with audioSet:', defaultError?.message);
          
          // Second try: With minimal audioSet
          try {
            const minimalAudioSet: AudioSet = {
              AVSampleRateKeyIOS: 16000,
              AVNumberOfChannelsKeyIOS: 1,
            };
            const result = await player.startRecorder(path, minimalAudioSet);
            actualPath = result || path;
            console.log('iOS recording started with minimal config, result:', result);
            recordingStarted = true;
          } catch (minimalError: any) {
            console.warn('iOS minimal config failed, trying with quality setting:', minimalError?.message);
            
            // Third try: With quality setting
            try {
              const qualityAudioSet: AudioSet = {
                AVEncoderAudioQualityKeyIOS: AVEncoderAudioQualityIOSType.high,
              };
              const result = await player.startRecorder(path, qualityAudioSet);
              actualPath = result || path;
              console.log('iOS recording started with quality config, result:', result);
              recordingStarted = true;
            } catch (qualityError: any) {
              console.error('All iOS recording attempts failed:', qualityError);
              throw qualityError;
            }
          }
        }
        
        if (!recordingStarted) {
          throw new Error('Failed to start iOS recording with any configuration');
        }
        
        // Add record back listener for iOS (prevents "no listeners" warning)
        try {
          player.addRecordBackListener((e: any) => {
            // iOS recording progress callback
            // We can use this for UI updates if needed
            console.log('Recording progress:', e.currentPosition, e.duration);
          });
        } catch (listenerError) {
          console.warn('Could not add record back listener:', listenerError);
        }
        
        // Only set state after successful recording start
        setIsRecording(true);
        setAudioPath(actualPath);
      } else {
        // Android: use full audioSet (unchanged - working correctly)
        await player.startRecorder(path, audioSet);
        setIsRecording(true);
        setAudioPath(path);
      }
    } catch (error: any) {
      console.error('Error starting recording:', error);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);
      
      Alert.alert(
        'Recording Error', 
        `Failed to start recording: ${error?.message || error}\n\nPlease ensure microphone permission is granted in Settings.`
      );
    }
  };

  const stopRecording = async () => {
    try {
      const player = getAudioRecorderPlayer();
      if (!player) {
        console.error('AudioRecorderPlayer not available');
        return;
      }
      const result = await player.stopRecorder();
      player.removeRecordBackListener();
      setIsRecording(false);
      
      // Get the actual file path
      // stopRecorder() returns the file path as a string
      let finalPath = result || audioPath;
      
      // Ensure we have a valid path
      if (finalPath) {
        // Platform-specific path handling
        if (Platform.OS === 'ios') {
          // iOS: Store the path exactly as returned by stopRecorder()
          // This is the path the player expects for playback
          // Don't modify it - use it as-is for playback
          setAudioPath(finalPath);
          console.log('Recording stopped. File path (iOS, stored as-is):', finalPath);
        } else {
          // Android: Remove file:// prefix and fix slashes
          finalPath = finalPath.replace(/^file:\/\//, '');
          finalPath = finalPath.replace(/^\/+/, '/');
          setAudioPath(finalPath);
          console.log('Recording stopped. File path:', finalPath);
        }
        
        // Automatically transcribe after recording stops (Android only for now)
        if (Platform.OS === 'android') {
          await transcribeAudio(finalPath);
        } else {
          // iOS: Show message that transcription is Android-only for now
          console.log('iOS recording saved. Transcription is currently Android-only.');
          Alert.alert(
            'Recording Saved',
            'Your recording has been saved. Transcription is currently only available on Android. iOS support coming soon!',
            [{ text: 'OK' }]
          );
        }
      } else {
        console.error('No audio path available after stopping recording');
        Alert.alert('Error', 'Could not determine audio file path');
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
    }
  };

  const transcribeAudio = async (audioFilePath: string) => {
    setIsTranscribing(true);
    setTranscription(null);
    setTranscriptionError(null);

    const startTime = Date.now();

    try {
      // Check if we're on iOS - Vosk module is Android-only for now
      if (Platform.OS === 'ios') {
        throw new Error('Transcription is currently only available on Android. iOS transcription support coming soon.');
      }
      
      // Import native module dynamically (lazy load for better initial performance)
      // Use require instead of dynamic import to avoid module initialization issues
      const ReactNative = require('react-native');
      const VoskFileRecognition = ReactNative.NativeModules?.VoskFileRecognition;

      if (!VoskFileRecognition) {
        throw new Error('Vosk native module not found. Please rebuild the app.');
      }

      // Model path in assets/bundle
      const modelPath = 'model-en-us-0.15';

      console.log('Starting transcription...');
      console.log('Audio file:', audioFilePath);
      console.log('Model path:', modelPath);

      // Clean up file path - remove file:// prefix if present
      let cleanAudioPath = audioFilePath;
      if (cleanAudioPath.startsWith('file://')) {
        cleanAudioPath = cleanAudioPath.replace(/^file:\/\/+/, '');
      }
      // Fix double slashes at the start (e.g., //storage -> /storage)
      cleanAudioPath = cleanAudioPath.replace(/^\/+/, '/');

      console.log('Cleaned audio path:', cleanAudioPath);

      // Verify file exists before attempting transcription (async check)
      const fileExists = await RNFS.exists(cleanAudioPath);
      console.log('Audio file exists:', fileExists);
      
      if (!fileExists) {
        throw new Error(`Audio file not found at: ${cleanAudioPath}`);
      }

      // Get file info for debugging (only in dev mode for performance)
      if (__DEV__) {
        const fileInfo = await RNFS.stat(cleanAudioPath);
        console.log('Audio file info:', {
          size: fileInfo.size,
          path: fileInfo.path,
          isFile: fileInfo.isFile(),
        });
      }

      // Call native module to transcribe (runs in background thread)
      console.log('Calling native transcription module...');
      const result = await VoskFileRecognition.transcribeFile(cleanAudioPath, modelPath);
      
      const transcriptionTime = Date.now() - startTime;
      console.log(`Transcription completed in ${transcriptionTime}ms`);
      console.log('Transcription result received:', result);

      if (result && result.text) {
        const transcribedText = result.text.trim();
        if (transcribedText.length > 0) {
          setTranscription(transcribedText);
          console.log('Transcription successful:', transcribedText);
          
          // Append transcription to note text
          // If noteText is empty, set it; otherwise append with a space
          setNoteText((prevText) => {
            if (prevText.trim().length === 0) {
              return transcribedText;
            }
            // Append with proper spacing and newline for better readability
            return `${prevText}\n\n${transcribedText}`;
          });
          
          // Focus the text input to show the new transcription (debounced)
          setTimeout(() => {
            textInputRef.current?.focus();
          }, 100);
        } else {
          console.warn('Transcription returned empty text');
          setTranscription('No speech detected in the recording.');
        }
      } else if (result && result.error) {
        throw new Error(result.error);
      } else {
        console.warn('Transcription returned no result or empty text');
        setTranscription('No speech detected in the recording.');
      }
    } catch (error: any) {
      console.error('Transcription error:', error);
      const errorMessage = error?.message || 'Failed to transcribe audio. Please try again.';
      setTranscriptionError(errorMessage);
      // Only show alert for critical errors, not for empty transcriptions
      if (!errorMessage.includes('No speech detected')) {
        Alert.alert('Transcription Error', errorMessage);
      }
    } finally {
      setIsTranscribing(false);
    }
  };

  const playRecording = async () => {
    if (!audioPath) {
      Alert.alert('No Recording', 'No audio file available to play.');
      return;
    }

    try {
      const player = getAudioRecorderPlayer();
      if (!player) {
        console.error('AudioRecorderPlayer not available');
        Alert.alert('Playback Error', 'Audio player not available.');
        return;
      }

      // Format path for playback (platform-specific)
      let playPath = audioPath;
      
      if (Platform.OS === 'ios') {
        // iOS: Use path exactly as stored (from stopRecorder result)
        // The library handles the path format internally
        playPath = audioPath;
        console.log('iOS: Playing audio from stored path:', playPath);
      } else {
        // Android: Remove file:// if present, player handles it (unchanged)
        playPath = playPath.replace(/^file:\/\//, '');
        console.log('Android: Playing audio from path:', playPath);
      }

      // Verify file exists before playing (remove file:// for check)
      const pathForCheck = playPath.replace(/^file:\/\//, '');
      const fileExists = await RNFS.exists(pathForCheck);
      if (!fileExists) {
        Alert.alert('File Not Found', `Audio file not found at: ${pathForCheck}`);
        console.error('Audio file does not exist:', pathForCheck);
        return;
      }

      // Stop any existing playback first
      try {
        await player.stopPlayer();
        player.removePlayBackListener();
      } catch (stopError) {
        // Ignore if nothing was playing
        console.log('No previous playback to stop');
      }
      
      // Start playback - use path exactly as stored for iOS
      const result = await player.startPlayer(playPath);
      console.log('Playback started, result:', result);
      
      // Add playback listener
      player.addPlayBackListener((e: PlayBackType) => {
        console.log('Playback progress:', e.currentPosition, '/', e.duration);
        if (e.currentPosition >= e.duration) {
          player.stopPlayer();
          player.removePlayBackListener();
          console.log('Playback finished');
        }
      });
    } catch (error: any) {
      console.error('Error playing recording:', error);
      console.error('Error details:', error?.message, error?.stack);
      Alert.alert(
        'Playback Error', 
        `Failed to play recording: ${error?.message || 'Unknown error'}\n\nPath: ${audioPath}`
      );
    }
  };

  return (
    <SafeScreen>
      <KeyboardAvoidingView
        style={[layout.flex_1]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <View style={[layout.flex_1, styles.container]}>
          <Text style={styles.title}>Voice Notes</Text>

          {/* Recording Controls */}
          <View style={styles.controlsContainer}>
            <TouchableOpacity
              style={[
                styles.button,
                isRecording ? styles.stopButton : styles.recordButton,
              ]}
              onPress={isRecording ? stopRecording : startRecording}>
              <Text style={styles.buttonText}>
                {isRecording ? 'Stop Recording' : 'Start Recording'}
              </Text>
            </TouchableOpacity>

            {audioPath && (
              <TouchableOpacity style={styles.playButton} onPress={playRecording}>
                <Text style={styles.buttonText}>Play Last Recording</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Status Messages */}
          {isTranscribing && (
            <View style={styles.transcribingContainer}>
              <Text style={styles.transcribingText}>🔄 Processing audio transcription...</Text>
              <Text style={styles.transcribingSubtext}>This may take a few seconds</Text>
            </View>
          )}

          {transcriptionError && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>❌ {transcriptionError}</Text>
            </View>
          )}

          {/* Multiline Text Input for Notes */}
          <View style={styles.textInputContainer}>
            <Text style={styles.textInputLabel}>📝 Your Notes:</Text>
            <TextInput
              ref={textInputRef}
              style={styles.textInput}
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Start recording or type your notes here..."
              placeholderTextColor="#9ca3af"
              multiline={true}
              textAlignVertical="top"
              scrollEnabled={true}
              returnKeyType="default"
              blurOnSubmit={false}
              autoCapitalize="sentences"
              autoCorrect={true}
              spellCheck={true}
              keyboardType="default"
            />
            {noteText.length > 0 && (
              <Text style={styles.characterCount}>
                {noteText.length} {noteText.length === 1 ? 'character' : 'characters'}
              </Text>
            )}
          </View>

       

          {audioPath && (
            <Text style={styles.pathText} numberOfLines={1}>
              💾 Saved at: {audioPath.split('/').pop()}
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}

export default Notes;

const styles = StyleSheet.create({
  container: {
    padding: 16,
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
    color: '#111827',
  },
  controlsContainer: {
    marginBottom: 16,
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  recordButton: {
    backgroundColor: '#2563eb',
  },
  stopButton: {
    backgroundColor: '#dc2626',
  },
  playButton: {
    backgroundColor: '#16a34a',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  transcribingContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#f0f9ff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bae6fd',
    alignItems: 'center',
  },
  transcribingText: {
    fontSize: 14,
    color: '#0369a1',
    fontWeight: '500',
    marginBottom: 4,
  },
  transcribingSubtext: {
    fontSize: 12,
    color: '#0284c7',
    fontStyle: 'italic',
  },
  textInputContainer: {
    flex: 1,
    marginBottom: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'hidden',
  },
  textInputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 200,
    lineHeight: 24,
  },
  characterCount: {
    fontSize: 12,
    color: '#6b7280',
    paddingHorizontal: 16,
    paddingBottom: 8,
    textAlign: 'right',
    backgroundColor: '#f9fafb',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  transcriptionPreviewContainer: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  transcriptionPreviewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
    marginBottom: 4,
  },
  transcriptionPreviewText: {
    fontSize: 14,
    color: '#15803d',
    lineHeight: 20,
  },
  errorContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    fontSize: 14,
    color: '#991b1b',
    textAlign: 'center',
  },
  pathText: {
    marginTop: 8,
    fontSize: 11,
    color: '#9ca3af',
    textAlign: 'center',
  },
});
