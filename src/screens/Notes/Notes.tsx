import type { RootScreenProps } from '@/navigation/types';

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  PermissionsAndroid,
  Alert,
} from 'react-native';

import { Paths } from '@/navigation/paths';
import { useTheme } from '@/theme';
import { SafeScreen } from '@/components/templates';

import AudioRecorderPlayer, {
  AudioSourceAndroidType,
  AudioEncoderAndroidType,
  AVEncoderAudioQualityIOSType,
  AudioSet,
  type PlayBackType,
} from 'react-native-audio-recorder-player';

import RNFS from 'react-native-fs';

function Notes({}: RootScreenProps<Paths.Notes>) {
  const { layout } = useTheme();

  const [isRecording, setIsRecording] = useState(false);
  const [audioPath, setAudioPath] = useState<string | null>(null);

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
        path = `${RNFS.ExternalDirectoryPath}/note_${Date.now()}.mp3`;
        audioSet = {
          // Android-specific configuration
          AudioSourceAndroid: AudioSourceAndroidType.MIC,
          AudioEncoderAndroid: AudioEncoderAndroidType.AAC,
          AudioSamplingRateAndroid: 44100,
          AudioEncodingBitRateAndroid: 128000,
        };
      } else {
        // iOS: Based on the Swift implementation, paths are handled as:
        // - If path starts with http://, https://, or file:// → uses URL(string: path)
        // - Otherwise → treats as relative path, appends to caches directory
        // The error occurs when audioRecorder.record() returns false
        // Let's try the simplest approach: use just filename (saves to caches)
        const timestamp = Date.now();
        path = `note_${timestamp}.m4a`;
        
        // Minimal iOS configuration - just format and quality
        audioSet = {
          AVFormatIDKeyIOS: 'aac' as const,
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
      await player.stopRecorder();
      player.removeRecordBackListener();
      setIsRecording(false);
    } catch (error) {
      console.error('Error stopping recording:', error);
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
      <View style={[layout.flex_1, styles.container]}>
        <Text style={styles.title}>Voice Notes</Text>

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

        {audioPath && (
          <Text style={styles.pathText} numberOfLines={2}>
            Saved at: {audioPath}
          </Text>
        )}
      </View>
    </SafeScreen>
  );
}

export default Notes;

const styles = StyleSheet.create({
  container: {
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 30,
    textAlign: 'center',
  },
  button: {
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  recordButton: {
    backgroundColor: '#2563eb',
  },
  stopButton: {
    backgroundColor: '#dc2626',
  },
  playButton: {
    marginTop: 20,
    backgroundColor: '#16a34a',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  pathText: {
    marginTop: 16,
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
});
