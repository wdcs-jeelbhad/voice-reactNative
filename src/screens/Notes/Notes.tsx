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
    if (Platform.OS !== 'android') {
      return true;
    }

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
        // iOS: Record as Linear PCM (WAV format) for Vosk
        const timestamp = Date.now();
        path = `note_${timestamp}.wav`;
        
        audioSet = {
          AVFormatIDKeyIOS: 'lpcm' as const, // Linear PCM
          AVSampleRateKeyIOS: 16000, // 16kHz for Vosk
          AVNumberOfChannelsKeyIOS: 1, // Mono
          AVLinearPCMBitDepthKeyIOS: 16, // 16-bit
          AVLinearPCMIsBigEndianKeyIOS: false, // Little endian
          AVLinearPCMIsFloatKeyIOS: false, // Integer PCM
          AVEncoderAudioQualityKeyIOS: AVEncoderAudioQualityIOSType.high,
        };
      }

      // Log to verify audioSet is being created
      console.log('Starting recorder with audioSet:', JSON.stringify(audioSet));
      console.log('Platform:', Platform.OS);
      console.log('Path:', path);

      // For iOS, try with minimal config or undefined
      // Version 3.x sometimes works better without explicit audioSet on iOS
      if (Platform.OS === 'ios') {
        // Try with minimal config first
        const result = await player.startRecorder(path, audioSet);
        console.log('iOS recording started, result:', result);
      } else {
        // Android: use full audioSet
        await player.startRecorder(path, audioSet);
      }

      setIsRecording(true);
      setAudioPath(path);
    } catch (error: any) {
      console.error('Error starting recording:', error);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);
      
      // For iOS, if the error persists, try without audioSet
      if (Platform.OS === 'ios' && error?.message?.includes('initiating recorder')) {
        try {
          console.log('Retrying iOS recording without audioSet...');
          const player = getAudioRecorderPlayer();
          if (player) {
            await player.startRecorder(path, undefined);
            setIsRecording(true);
            setAudioPath(path);
            return;
          }
        } catch (retryError) {
          console.error('Retry also failed:', retryError);
        }
      }
      
      Alert.alert('Recording Error', `Failed to start recording: ${error?.message || error}`);
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
        // Remove any file:// prefix that might be added
        finalPath = finalPath.replace(/^file:\/\//, '');
        // Fix double slashes at the start
        finalPath = finalPath.replace(/^\/+/, '/');
        setAudioPath(finalPath);
        console.log('Recording stopped. File path:', finalPath);
        
        // Automatically transcribe after recording stops
        await transcribeAudio(finalPath);
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

    try {
      // Import native module dynamically
      const { NativeModules } = await import('react-native');
      const VoskFileRecognition = NativeModules.VoskFileRecognition;

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

      // Verify file exists before attempting transcription
      const fileExists = await RNFS.exists(cleanAudioPath);
      console.log('Audio file exists:', fileExists);
      
      if (!fileExists) {
        throw new Error(`Audio file not found at: ${cleanAudioPath}`);
      }

      // Get file info for debugging
      const fileInfo = await RNFS.stat(cleanAudioPath);
      console.log('Audio file info:', {
        size: fileInfo.size,
        path: fileInfo.path,
        isFile: fileInfo.isFile(),
      });

      // Call native module to transcribe
      console.log('Calling native transcription module...');
      const result = await VoskFileRecognition.transcribeFile(cleanAudioPath, modelPath);
      
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
            // Append with proper spacing
            return `${prevText} ${transcribedText}`;
          });
          
          // Focus the text input to show the new transcription
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
      Alert.alert('Transcription Error', errorMessage);
    } finally {
      setIsTranscribing(false);
    }
  };

  const playRecording = async () => {
    if (!audioPath) return;

    try {
      const player = getAudioRecorderPlayer();
      if (!player) {
        console.error('AudioRecorderPlayer not available');
        return;
      }
      await player.startPlayer(audioPath);
      player.addPlayBackListener((e: PlayBackType) => {
        if (e.currentPosition >= e.duration) {
          player.stopPlayer();
          player.removePlayBackListener();
        }
      });
    } catch (error) {
      console.error('Error playing recording:', error);
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
              <Text style={styles.transcribingText}>🔄 Transcribing audio...</Text>
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
