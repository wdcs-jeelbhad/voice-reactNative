#import <React/RCTBridgeModule.h>
#import <React/RCTLog.h>

// Export the Swift module to React Native
// RCT_EXTERN_MODULE automatically strips "Module" suffix, so VoskFileRecognitionModule becomes VoskFileRecognition
@interface RCT_EXTERN_MODULE(VoskFileRecognitionModule, NSObject)

RCT_EXTERN_METHOD(transcribeFile:(NSString *)audioFilePath
                  modelPath:(NSString *)modelPath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
