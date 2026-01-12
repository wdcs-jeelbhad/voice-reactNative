package com.voice

import android.content.res.AssetManager
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.util.Log
import com.facebook.react.bridge.*
import org.vosk.Model
import org.vosk.Recognizer
import java.io.*
import java.nio.ByteBuffer

class VoskFileRecognitionModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "VoskFileRecognition"
        private const val SAMPLE_RATE = 16000.0f
        
        init {
            // Initialize JNA native library loading
            try {
                // Force JNA to extract and load native libraries
                System.setProperty("jna.nosys", "false")
                System.setProperty("jna.nounpack", "false")
                Log.d(TAG, "JNA initialization attempted")
            } catch (e: Exception) {
                Log.e(TAG, "JNA initialization error", e)
            }
        }
    }

    private var model: Model? = null
    private var recognizer: Recognizer? = null

    override fun getName(): String {
        return "VoskFileRecognition"
    }

    @ReactMethod
    fun transcribeFile(audioFilePath: String, modelPath: String, promise: Promise) {
        try {
            Log.d(TAG, "Starting transcription for: $audioFilePath")
            Log.d(TAG, "Using model: $modelPath")

            // Load model from assets
            val modelLoaded = loadModel(modelPath)
            if (!modelLoaded) {
                promise.reject("MODEL_ERROR", "Failed to load Vosk model from assets. Check if model-en-us-0.15 exists in assets folder.")
                return
            }
            
            if (model == null) {
                promise.reject("MODEL_ERROR", "Model loaded but instance is null")
                return
            }
            
            Log.d(TAG, "Model loaded successfully")

            // Read and convert audio file to PCM
            Log.d(TAG, "Attempting to read audio file: $audioFilePath")
            val pcmData = readAudioFile(audioFilePath)
            if (pcmData == null || pcmData.isEmpty()) {
                val errorMsg = "Failed to read or convert audio file: $audioFilePath. Check logs for details."
                Log.e(TAG, errorMsg)
                promise.reject("AUDIO_ERROR", errorMsg)
                return
            }

            Log.d(TAG, "Audio data size: ${pcmData.size} bytes")
            Log.d(TAG, "Expected duration: ${pcmData.size / (SAMPLE_RATE * 2)} seconds") // 16-bit = 2 bytes per sample

            // Create recognizer
            recognizer = Recognizer(model, SAMPLE_RATE)
            recognizer?.setWords(true)
            recognizer?.setPartialWords(true)
            
            Log.d(TAG, "Recognizer created successfully")

            // Process audio in chunks
            val chunkSize = 4096
            var offset = 0
            var partialResults = mutableListOf<String>()
            var chunksProcessed = 0

            Log.d(TAG, "Starting to process ${pcmData.size} bytes in chunks of $chunkSize")

            while (offset < pcmData.size) {
                val chunkEnd = minOf(offset + chunkSize, pcmData.size)
                val chunk = pcmData.copyOfRange(offset, chunkEnd)

                // Process chunk through Vosk
                val accepted = recognizer?.acceptWaveForm(chunk, chunk.size) == true
                
                if (accepted) {
                    val result = recognizer?.result
                    if (result != null) {
                        val text = extractTextFromJson(result)
                        if (text.isNotEmpty()) {
                            partialResults.add(text)
                            Log.d(TAG, "Partial result [$chunksProcessed]: $text")
                        }
                    }
                }
                
                chunksProcessed++
                offset = chunkEnd
                
                // Log progress every 10 chunks
                if (chunksProcessed % 10 == 0) {
                    Log.d(TAG, "Processed $chunksProcessed chunks (${offset * 100 / pcmData.size}%)")
                }
            }

            Log.d(TAG, "Finished processing all chunks. Total chunks: $chunksProcessed")

            // Always get final result - this is crucial!
            val finalResultJson = recognizer?.finalResult
            Log.d(TAG, "Final result JSON: $finalResultJson")
            
            var finalResult = ""
            if (finalResultJson != null && finalResultJson.isNotEmpty()) {
                finalResult = extractTextFromJson(finalResultJson)
                Log.d(TAG, "Final result text: '$finalResult'")
            } else {
                Log.w(TAG, "Final result is null or empty")
            }
            
            // If no final result, check if we have partial results
            if (finalResult.isEmpty() && partialResults.isNotEmpty()) {
                finalResult = partialResults.last()
                Log.d(TAG, "Using last partial result: '$finalResult'")
            }

            // Cleanup
            recognizer?.close()
            recognizer = null

            // Return result (even if empty, so we know it processed)
            val resultMap = Arguments.createMap()
            val resultText = finalResult.trim()
            resultMap.putString("text", resultText)
            
            Log.d(TAG, "Returning transcription result: '$resultText' (length: ${resultText.length})")
            promise.resolve(resultMap)

        } catch (e: Exception) {
            Log.e(TAG, "Transcription error", e)
            promise.reject("TRANSCRIPTION_ERROR", e.message ?: "Unknown error", e)
        }
    }

    private fun loadModel(modelPath: String): Boolean {
        return try {
            val context = reactApplicationContext
            val assetManager = context.assets

            // Check if model exists in assets
            val modelFiles = assetManager.list(modelPath)
            if (modelFiles == null || modelFiles.isEmpty()) {
                Log.e(TAG, "Model not found in assets: $modelPath")
                Log.e(TAG, "Available assets: ${assetManager.list("")?.joinToString()}")
                return false
            }

            Log.d(TAG, "Model files found in assets: ${modelFiles.joinToString()}")

            // Extract model to internal storage if needed
            val modelDir = File(context.filesDir, modelPath)
            if (!modelDir.exists() || modelDir.listFiles()?.isEmpty() == true) {
                Log.d(TAG, "Extracting model from assets to: ${modelDir.absolutePath}")
                modelDir.mkdirs()
                copyAssetsFolder(assetManager, modelPath, modelDir)
            } else {
                Log.d(TAG, "Model already extracted, using existing: ${modelDir.absolutePath}")
            }

            // Verify model files exist
            val requiredFiles = listOf("am/final.mdl", "graph/HCLr.fst", "graph/Gr.fst")
            var allFilesExist = true
            for (file in requiredFiles) {
                val modelFile = File(modelDir, file)
                if (!modelFile.exists()) {
                    Log.e(TAG, "Required model file missing: $file")
                    allFilesExist = false
                }
            }
            
            if (!allFilesExist) {
                Log.e(TAG, "Some model files are missing, re-extracting...")
                modelDir.deleteRecursively()
                modelDir.mkdirs()
                copyAssetsFolder(assetManager, modelPath, modelDir)
            }

            Log.d(TAG, "Loading Vosk model from: ${modelDir.absolutePath}")
            model = Model(modelDir.absolutePath)
            Log.d(TAG, "Model loaded successfully! Model instance: $model")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Error loading model", e)
            Log.e(TAG, "Error details: ${e.message}", e)
            e.printStackTrace()
            false
        }
    }

    private fun copyAssetsFolder(assetManager: AssetManager, path: String, targetDir: File) {
        val files = assetManager.list(path) ?: return

        for (file in files) {
            val assetPath = if (path.isEmpty()) file else "$path/$file"
            val targetFile = File(targetDir, file)

            try {
                val list = assetManager.list(assetPath)
                if (list != null && list.isNotEmpty()) {
                    // It's a directory
                    targetFile.mkdirs()
                    copyAssetsFolder(assetManager, assetPath, targetFile)
                } else {
                    // It's a file
                    val inputStream = assetManager.open(assetPath)
                    val outputStream = FileOutputStream(targetFile)
                    inputStream.copyTo(outputStream)
                    inputStream.close()
                    outputStream.close()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error copying asset: $assetPath", e)
            }
        }
    }

    private fun readAudioFile(filePath: String): ByteArray? {
        var fileInputStream: FileInputStream? = null
        return try {
            // Handle file:/// prefix if present
            var cleanPath = filePath.trim()
            if (cleanPath.startsWith("file://")) {
                cleanPath = cleanPath.replace("file://", "")
                // Remove leading slashes but keep at least one
                while (cleanPath.startsWith("/") && cleanPath.length > 1 && !cleanPath.startsWith("//")) {
                    cleanPath = cleanPath.substring(1)
                }
            }
            
            // Try multiple path variations
            var file = File(cleanPath)
            
            // If file doesn't exist, try without leading slash
            if (!file.exists() && cleanPath.startsWith("/")) {
                val altPath = cleanPath.substring(1)
                val altFile = File(altPath)
                if (altFile.exists()) {
                    file = altFile
                    cleanPath = altPath
                    Log.d(TAG, "Found file using alternative path: $altPath")
                }
            }
            
            Log.d(TAG, "Reading audio file")
            Log.d(TAG, "  Original path: '$filePath'")
            Log.d(TAG, "  Clean path: '$cleanPath'")
            Log.d(TAG, "  File exists: ${file.exists()}")
            Log.d(TAG, "  File can read: ${file.canRead()}")
            Log.d(TAG, "  File size: ${file.length()} bytes")
            Log.d(TAG, "  Absolute path: ${file.absolutePath}")
            
            if (!file.exists()) {
                Log.e(TAG, "Audio file not found: $cleanPath")
                Log.e(TAG, "Tried absolute path: ${file.absolutePath}")
                // List parent directory to help debug
                val parent = file.parentFile
                if (parent != null && parent.exists()) {
                    Log.e(TAG, "Parent directory exists. Contents: ${parent.listFiles()?.map { it.name }?.joinToString()}")
                } else {
                    Log.e(TAG, "Parent directory does not exist: ${file.parent}")
                }
                return null
            }
            
            if (!file.canRead()) {
                Log.e(TAG, "Audio file exists but cannot be read: $cleanPath")
                return null
            }
            
            if (file.length() == 0L) {
                Log.e(TAG, "Audio file is empty: $cleanPath")
                return null
            }

            fileInputStream = FileInputStream(file)
            
            // Read WAV header (first 44 bytes for standard WAV)
            val header = ByteArray(44)
            val headerBytesRead = fileInputStream.read(header)
            
            if (headerBytesRead < 12) {
                Log.e(TAG, "File too small to contain valid WAV header (read $headerBytesRead bytes)")
                return null
            }
            
            // Verify it's a WAV file and extract format info
            val riff = String(header, 0, 4)
            val wave = String(header, 8, 4)
            
            // Extract audio format info from WAV header
            // Byte 20-21: Audio format (1 = PCM)
            // Byte 22-23: Number of channels
            // Byte 24-27: Sample rate
            // Byte 34-35: Bits per sample
            val audioFormat = ((header[20].toInt() and 0xFF) or ((header[21].toInt() and 0xFF) shl 8))
            val numChannels = ((header[22].toInt() and 0xFF) or ((header[23].toInt() and 0xFF) shl 8))
            val sampleRate = ((header[24].toInt() and 0xFF) or 
                            ((header[25].toInt() and 0xFF) shl 8) or
                            ((header[26].toInt() and 0xFF) shl 16) or
                            ((header[27].toInt() and 0xFF) shl 24))
            val bitsPerSample = ((header[34].toInt() and 0xFF) or ((header[35].toInt() and 0xFF) shl 8))
            
            Log.d(TAG, "WAV header check - RIFF: '$riff', WAVE: '$wave'")
            Log.d(TAG, "Audio format: $audioFormat (1=PCM), Channels: $numChannels, Sample rate: $sampleRate Hz, Bits: $bitsPerSample")
            
            // Warn if format doesn't match Vosk requirements
            if (sampleRate != 16000) {
                Log.w(TAG, "Sample rate is $sampleRate Hz, but Vosk expects 16000 Hz. This may cause issues.")
            }
            if (numChannels != 1) {
                Log.w(TAG, "Audio has $numChannels channels, but Vosk expects mono (1 channel). This may cause issues.")
            }
            if (bitsPerSample != 16) {
                Log.w(TAG, "Audio is $bitsPerSample-bit, but Vosk expects 16-bit. This may cause issues.")
            }
            
            if (riff != "RIFF" || wave != "WAVE") {
                Log.w(TAG, "File does not have standard WAV header (RIFF=$riff, WAVE=$wave)")
                Log.w(TAG, "File appears to be MP4/M4A format. Extracting PCM using MediaExtractor...")
                
                // File is MP4/M4A, extract PCM using Android MediaExtractor
                return extractPCMFromMediaFile(file.absolutePath)
            }
            
            // Find "data" chunk in header
            // Standard WAV has data chunk starting at byte 36 (after "data" identifier at 36-40)
            // But we need to search for it in case of extended headers
            var dataOffset = 44 // Default offset
            
            // Read more bytes to find data chunk if needed
            val searchBuffer = ByteArray(1024)
            fileInputStream.close()
            fileInputStream = FileInputStream(file)
            val bytesSearched = fileInputStream.read(searchBuffer)
            
            if (bytesSearched > 0) {
                // Search for "data" chunk identifier
                for (i in 0 until bytesSearched - 4) {
                    if (searchBuffer[i] == 'd'.code.toByte() &&
                        searchBuffer[i + 1] == 'a'.code.toByte() &&
                        searchBuffer[i + 2] == 't'.code.toByte() &&
                        searchBuffer[i + 3] == 'a'.code.toByte()) {
                        // Found "data" chunk, skip identifier (4 bytes) and size (4 bytes) = 8 bytes
                        dataOffset = i + 8
                        Log.d(TAG, "Found data chunk at offset: $dataOffset")
                        break
                    }
                }
            }
            
            // Read PCM data from data chunk
            val fileSizeLong = file.length()
            if (fileSizeLong > Int.MAX_VALUE) {
                Log.e(TAG, "File too large: ${fileSizeLong} bytes")
                return null
            }
            val fileSize = fileSizeLong.toInt()
            val pcmSize = fileSize - dataOffset
            
            if (pcmSize <= 0) {
                Log.e(TAG, "Invalid PCM data size: $pcmSize (file size: $fileSize, data offset: $dataOffset)")
                return null
            }
            
            if (pcmSize > 50 * 1024 * 1024) { // 50MB limit
                Log.e(TAG, "PCM data too large: $pcmSize bytes (max 50MB)")
                return null
            }
            
            Log.d(TAG, "Reading PCM data: offset=$dataOffset, expected size=$pcmSize bytes")
            
            // Read PCM data
            fileInputStream.close()
            fileInputStream = FileInputStream(file)
            fileInputStream.skip(dataOffset.toLong())
            
            val pcmData = ByteArray(pcmSize)
            var totalRead = 0
            
            // Read in chunks to ensure we get all data
            while (totalRead < pcmSize) {
                val bytesRead = fileInputStream.read(pcmData, totalRead, pcmSize - totalRead)
                if (bytesRead == -1) {
                    Log.w(TAG, "Reached EOF. Read $totalRead of $pcmSize bytes")
                    break
                }
                totalRead += bytesRead
            }
            
            if (totalRead == 0) {
                Log.e(TAG, "No PCM data was read")
                return null
            }
            
            val finalData = if (totalRead < pcmSize) {
                Log.w(TAG, "Read less than expected. Expected: $pcmSize, Got: $totalRead")
                pcmData.copyOf(totalRead)
            } else {
                pcmData
            }
            
            Log.d(TAG, "Successfully read ${finalData.size} bytes of PCM data")
            finalData
            
        } catch (e: Exception) {
            Log.e(TAG, "Error reading audio file: ${e.message}", e)
            e.printStackTrace()
            null
        } finally {
            try {
                fileInputStream?.close()
            } catch (e: Exception) {
                Log.e(TAG, "Error closing file stream", e)
            }
        }
    }

    private fun extractPCMFromMediaFile(filePath: String): ByteArray? {
        var extractor: MediaExtractor? = null
        var decoder: MediaCodec? = null
        
        return try {
            Log.d(TAG, "Extracting PCM from media file: $filePath")
            
            extractor = MediaExtractor()
            extractor.setDataSource(filePath)
            
            // Find audio track
            var audioTrackIndex = -1
            var audioFormat: MediaFormat? = null
            
            for (i in 0 until extractor.trackCount) {
                val format = extractor.getTrackFormat(i)
                val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
                
                if (mime.startsWith("audio/")) {
                    audioTrackIndex = i
                    audioFormat = format
                    Log.d(TAG, "Found audio track: $mime")
                    break
                }
            }
            
            if (audioTrackIndex == -1 || audioFormat == null) {
                Log.e(TAG, "No audio track found in media file")
                return null
            }
            
            extractor.selectTrack(audioTrackIndex)
            
            val sampleRate = audioFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            val channelCount = audioFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            
            Log.d(TAG, "Audio format - Sample rate: $sampleRate Hz, Channels: $channelCount")
            
            // Create decoder for the audio format
            val mimeType = audioFormat.getString(MediaFormat.KEY_MIME) ?: return null
            decoder = MediaCodec.createDecoderByType(mimeType)
            decoder.configure(audioFormat, null, null, 0)
            decoder.start()
            
            val pcmData = mutableListOf<ByteArray>()
            var inputEOS = false
            var outputEOS = false
            
            while (!outputEOS) {
                // Feed input
                if (!inputEOS) {
                    val inputBufferIndex = decoder.dequeueInputBuffer(10000)
                    if (inputBufferIndex >= 0) {
                        val inputBuffer = decoder.getInputBuffer(inputBufferIndex)
                        if (inputBuffer != null) {
                            val sampleSize = extractor.readSampleData(inputBuffer, 0)
                            
                            if (sampleSize < 0) {
                                decoder.queueInputBuffer(inputBufferIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                                inputEOS = true
                            } else {
                                val presentationTimeUs = extractor.sampleTime
                                decoder.queueInputBuffer(inputBufferIndex, 0, sampleSize, presentationTimeUs, 0)
                                extractor.advance()
                            }
                        }
                    }
                }
                
                // Get output
                val bufferInfo = MediaCodec.BufferInfo()
                val outputBufferIndex = decoder.dequeueOutputBuffer(bufferInfo, 10000)
                
                if (outputBufferIndex >= 0) {
                    val outputBuffer = decoder.getOutputBuffer(outputBufferIndex)
                    val outputSize = bufferInfo.size
                    
                    if (outputSize > 0 && outputBuffer != null) {
                        val chunk = ByteArray(outputSize)
                        outputBuffer.get(chunk)
                        outputBuffer.clear()
                        pcmData.add(chunk)
                    }
                    
                    decoder.releaseOutputBuffer(outputBufferIndex, false)
                    
                    if ((bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                        outputEOS = true
                    }
                } else if (outputBufferIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    val newFormat = decoder.outputFormat
                    Log.d(TAG, "Output format changed: $newFormat")
                }
            }
            
            // Combine all PCM chunks
            val totalSize = pcmData.sumOf { it.size }
            val combinedPCM = ByteArray(totalSize)
            var offset = 0
            for (chunk in pcmData) {
                System.arraycopy(chunk, 0, combinedPCM, offset, chunk.size)
                offset += chunk.size
            }
            
            Log.d(TAG, "Extracted ${combinedPCM.size} bytes of PCM from media file")
            
            // Resample to 16kHz if needed and convert to mono
            val resampledPCM = if (sampleRate != 16000 || channelCount != 1) {
                Log.d(TAG, "Resampling from ${sampleRate}Hz/$channelCount channels to 16000Hz/mono")
                resampleAudio(combinedPCM, sampleRate, channelCount, 16000, 1)
            } else {
                combinedPCM
            }
            
            resampledPCM
            
        } catch (e: Exception) {
            Log.e(TAG, "Error extracting PCM from media file", e)
            e.printStackTrace()
            null
        } finally {
            try {
                decoder?.stop()
                decoder?.release()
            } catch (e: Exception) {
                Log.e(TAG, "Error releasing decoder", e)
            }
            try {
                extractor?.release()
            } catch (e: Exception) {
                Log.e(TAG, "Error releasing extractor", e)
            }
        }
    }
    
    private fun resampleAudio(pcmData: ByteArray, inputSampleRate: Int, inputChannels: Int, 
                              outputSampleRate: Int, outputChannels: Int): ByteArray {
        // For now, if sample rate doesn't match, log warning and return original
        // Proper resampling requires a library like libsamplerate or similar
        // Vosk can handle some sample rate variations, so we'll try with original data
        if (inputSampleRate != outputSampleRate) {
            Log.w(TAG, "Sample rate mismatch: $inputSampleRate Hz -> $outputSampleRate Hz. Using original (may cause issues).")
        }
        
        // Convert to mono if needed (simple average of channels)
        if (inputChannels > 1 && outputChannels == 1) {
            Log.d(TAG, "Converting from $inputChannels channels to mono")
            val inputSamples = pcmData.size / (2 * inputChannels) // 16-bit = 2 bytes per sample
            val output = ByteArray(inputSamples * 2) // mono = 1 channel, 16-bit = 2 bytes per sample
            
            for (i in 0 until inputSamples) {
                var sum = 0
                for (ch in 0 until inputChannels) {
                    val sampleIdx = i * 2 * inputChannels + ch * 2
                    if (sampleIdx + 1 < pcmData.size) {
                        // Read 16-bit little-endian sample
                        val sample = (pcmData[sampleIdx].toInt() and 0xFF) or 
                                    ((pcmData[sampleIdx + 1].toInt() and 0xFF) shl 8)
                        // Convert unsigned to signed
                        val signedSample = if (sample > 32767) sample - 65536 else sample
                        sum += signedSample
                    }
                }
                // Average channels
                val avg = (sum / inputChannels).coerceIn(-32768, 32767)
                // Write as 16-bit little-endian
                output[i * 2] = (avg and 0xFF).toByte()
                output[i * 2 + 1] = ((avg shr 8) and 0xFF).toByte()
            }
            
            Log.d(TAG, "Converted to mono: ${output.size} bytes")
            return output
        }
        
        // No conversion needed
        return pcmData
    }

    private fun extractTextFromJson(jsonString: String): String {
        return try {
            val jsonObject = org.json.JSONObject(jsonString)
            jsonObject.optString("text", "").trim()
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing JSON result", e)
            ""
        }
    }
}
