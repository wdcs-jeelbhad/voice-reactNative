#!/bin/bash

# Script to extract JNA native libraries for Android
# This fixes the "libjnidispatch.so not found" error

set -e

echo "🔧 JNA Native Library Extraction Script"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Project directories
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JNI_LIBS_DIR="$PROJECT_ROOT/android/app/src/main/jniLibs"

# Create jniLibs directory structure
echo "📁 Creating jniLibs directory structure..."
mkdir -p "$JNI_LIBS_DIR/armeabi-v7a"
mkdir -p "$JNI_LIBS_DIR/arm64-v8a"
mkdir -p "$JNI_LIBS_DIR/x86"
mkdir -p "$JNI_LIBS_DIR/x86_64"

# Find JNA JAR file
echo ""
echo "🔍 Searching for JNA JAR file..."

# Try multiple locations
JNA_JAR=""
POSSIBLE_LOCATIONS=(
    "$HOME/.gradle/caches/modules-2/files-2.1/net.java.dev.jna/jna"
    "$HOME/.m2/repository/net/java/dev/jna/jna"
    "$PROJECT_ROOT/android/.gradle/caches"
)

for base_path in "${POSSIBLE_LOCATIONS[@]}"; do
    if [ -d "$base_path" ]; then
        # Find the latest version
        VERSION_DIR=$(find "$base_path" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)
        if [ -n "$VERSION_DIR" ]; then
            JAR_FILE=$(find "$VERSION_DIR" -name "jna-*.jar" | head -1)
            if [ -n "$JAR_FILE" ] && [ -f "$JAR_FILE" ]; then
                JNA_JAR="$JAR_FILE"
                echo "✅ Found JNA JAR: $JNA_JAR"
                break
            fi
        fi
    fi
done

# If not found, try to find it in gradle cache more broadly
if [ -z "$JNA_JAR" ]; then
    echo "🔍 Searching in Gradle cache..."
    JNA_JAR=$(find "$HOME/.gradle/caches" -name "jna-*.jar" -type f 2>/dev/null | grep -v "sources" | grep -v "javadoc" | head -1)
    if [ -n "$JNA_JAR" ] && [ -f "$JNA_JAR" ]; then
        echo "✅ Found JNA JAR: $JNA_JAR"
    fi
fi

# If still not found, download it
if [ -z "$JNA_JAR" ] || [ ! -f "$JNA_JAR" ]; then
    echo ""
    echo -e "${YELLOW}⚠️  JNA JAR not found in cache${NC}"
    echo "📥 Downloading JNA 5.13.0..."
    
    TEMP_DIR=$(mktemp -d)
    cd "$TEMP_DIR"
    
    # Download JNA
    curl -L -o jna.jar "https://repo1.maven.org/maven2/net/java/dev/jna/jna/5.13.0/jna-5.13.0.jar" || {
        echo -e "${RED}❌ Failed to download JNA JAR${NC}"
        exit 1
    }
    
    JNA_JAR="$TEMP_DIR/jna.jar"
    echo "✅ Downloaded JNA JAR"
fi

# Extract native libraries
echo ""
echo "📦 Extracting native libraries from JNA JAR..."

# Function to extract library for a specific architecture
extract_lib() {
    local arch=$1
    local jar_path=$2
    local target_dir="$JNI_LIBS_DIR/$arch"
    
    # Map Android architectures to JNA internal naming
    local jna_arch=""
    case $arch in
        "armeabi-v7a")
            jna_arch="android-arm"
            ;;
        "arm64-v8a")
            jna_arch="android-aarch64"
            ;;
        "x86")
            jna_arch="android-x86"
            ;;
        "x86_64")
            jna_arch="android-x86-64"
            ;;
    esac
    
    # Try different possible paths in the JAR
    local possible_paths=(
        "com/sun/jna/$jna_arch/libjnidispatch.so"
        "com/sun/jna/android-$arch/libjnidispatch.so"
        "com/sun/jna/$arch/libjnidispatch.so"
        "native/$jna_arch/libjnidispatch.so"
    )
    
    for path in "${possible_paths[@]}"; do
        if unzip -l "$jar_path" 2>/dev/null | grep -q "$path"; then
            echo "  📥 Extracting $arch from $path..."
            unzip -j "$jar_path" "$path" -d "$target_dir" 2>/dev/null && {
                echo -e "  ${GREEN}✅ $arch library extracted${NC}"
                return 0
            }
        fi
    done
    
    echo -e "  ${YELLOW}⚠️  $arch library not found in JAR${NC}"
    return 1
}

# Extract for each architecture
SUCCESS_COUNT=0

if extract_lib "armeabi-v7a" "$JNA_JAR"; then
    ((SUCCESS_COUNT++))
fi

if extract_lib "arm64-v8a" "$JNA_JAR"; then
    ((SUCCESS_COUNT++))
fi

if extract_lib "x86" "$JNA_JAR"; then
    ((SUCCESS_COUNT++))
fi

if extract_lib "x86_64" "$JNA_JAR"; then
    ((SUCCESS_COUNT++))
fi

# If extraction from JAR failed, try downloading from Maven or extracting from AAR
if [ $SUCCESS_COUNT -eq 0 ]; then
    echo ""
    echo -e "${YELLOW}⚠️  Could not extract from JAR, trying alternative methods...${NC}"
    
    # Method 1: Try to find and extract from JNA AAR file (AAR contains native libs)
    echo "🔍 Searching for JNA AAR file..."
    JNA_AAR=$(find "$HOME/.gradle/caches" -name "jna-*.aar" -type f 2>/dev/null | grep -E "5\.13\.0|5\.16\.0" | head -1)
    
    if [ -n "$JNA_AAR" ] && [ -f "$JNA_AAR" ]; then
        echo "✅ Found JNA AAR: $JNA_AAR"
        echo "📦 Extracting native libraries from AAR..."
        
        # Extract native libraries directly from AAR
        # AAR structure: jni/<arch>/libjnidispatch.so
        for arch in "armeabi-v7a" "arm64-v8a" "x86" "x86_64"; do
            echo "  📥 Extracting $arch..."
            if unzip -j "$JNA_AAR" "jni/$arch/libjnidispatch.so" -d "$JNI_LIBS_DIR/$arch" 2>/dev/null; then
                if [ -f "$JNI_LIBS_DIR/$arch/libjnidispatch.so" ]; then
                    echo -e "  ${GREEN}✅ $arch library extracted${NC}"
                    ((SUCCESS_COUNT++))
                fi
            else
                # Try alternative path (some AARs use different structure)
                unzip -j "$JNA_AAR" "*/$arch/libjnidispatch.so" -d "$JNI_LIBS_DIR/$arch" 2>/dev/null || true
                if [ -f "$JNI_LIBS_DIR/$arch/libjnidispatch.so" ]; then
                    # Move from subdirectory if extracted to wrong location
                    find "$JNI_LIBS_DIR/$arch" -name "libjnidispatch.so" -exec mv {} "$JNI_LIBS_DIR/$arch/libjnidispatch.so" \; 2>/dev/null
                    echo -e "  ${GREEN}✅ $arch library extracted${NC}"
                    ((SUCCESS_COUNT++))
                fi
            fi
        done
    else
        echo "  ⚠️  JNA AAR file not found in cache"
    fi
    
    # Method 2: Download from Maven Central (native classifier)
    if [ $SUCCESS_COUNT -eq 0 ]; then
        echo ""
        echo "📥 Downloading native libraries from Maven Central..."
        
        # Maven Central URLs for JNA native libraries
        MAVEN_BASE="https://repo1.maven.org/maven2/net/java/dev/jna/jna/5.13.0"
        
        for arch in "armeabi-v7a" "arm64-v8a" "x86" "x86_64"; do
            case $arch in
                "armeabi-v7a")
                    download_url="$MAVEN_BASE/jna-5.13.0-android-arm.jar"
                    aar_arch="armeabi-v7a"
                    ;;
                "arm64-v8a")
                    download_url="$MAVEN_BASE/jna-5.13.0-android-aarch64.jar"
                    aar_arch="arm64-v8a"
                    ;;
                "x86")
                    download_url="$MAVEN_BASE/jna-5.13.0-android-x86.jar"
                    aar_arch="x86"
                    ;;
                "x86_64")
                    download_url="$MAVEN_BASE/jna-5.13.0-android-x86-64.jar"
                    aar_arch="x86_64"
                    ;;
            esac
            
            echo "  📥 Downloading $arch..."
            TEMP_JAR=$(mktemp)
            if curl -L -f -o "$TEMP_JAR" "$download_url" 2>/dev/null; then
                # Extract from the downloaded JAR
                if unzip -j "$TEMP_JAR" "libjnidispatch.so" -d "$JNI_LIBS_DIR/$arch" 2>/dev/null; then
                    echo -e "  ${GREEN}✅ $arch library downloaded and extracted${NC}"
                    ((SUCCESS_COUNT++))
                else
                    # Try extracting from nested path
                    if unzip -j "$TEMP_JAR" "*/libjnidispatch.so" -d "$JNI_LIBS_DIR/$arch" 2>/dev/null; then
                        mv "$JNI_LIBS_DIR/$arch/libjnidispatch.so" "$JNI_LIBS_DIR/$arch/libjnidispatch.so.tmp" 2>/dev/null || true
                        find "$JNI_LIBS_DIR/$arch" -name "libjnidispatch.so" -exec mv {} "$JNI_LIBS_DIR/$arch/libjnidispatch.so" \; 2>/dev/null
                        if [ -f "$JNI_LIBS_DIR/$arch/libjnidispatch.so" ]; then
                            echo -e "  ${GREEN}✅ $arch library extracted${NC}"
                            ((SUCCESS_COUNT++))
                        fi
                    fi
                fi
            fi
            rm -f "$TEMP_JAR"
        done
    fi
    
    # Method 3: Build from JNA source or use pre-built binaries
    if [ $SUCCESS_COUNT -eq 0 ]; then
        echo ""
        echo "📥 Downloading from alternative sources..."
        
        # Try downloading from JitPack or other sources
        # For now, we'll provide instructions for manual download
        echo -e "${YELLOW}⚠️  Automatic download failed. Using manual extraction method...${NC}"
        echo ""
        echo "Attempting to use Linux ARM libraries as fallback (may work on some devices)..."
        
        # Try using Linux ARM libraries as a fallback (won't work but shows the process)
        # Actually, let's try to download from a known working source
        echo "📥 Trying to download from JNA releases..."
        
        # Use the JNA GitHub releases or tags
        JNA_VERSION="5.13.0"
        GITHUB_RAW="https://raw.githubusercontent.com/java-native-access/jna/v${JNA_VERSION}/lib/native"
        
        # Map architectures
        declare -A arch_map=(
            ["armeabi-v7a"]="android-arm"
            ["arm64-v8a"]="android-aarch64"
            ["x86"]="android-x86"
            ["x86_64"]="android-x86-64"
        )
        
        for arch in "${!arch_map[@]}"; do
            jna_arch="${arch_map[$arch]}"
            url="${GITHUB_RAW}/${jna_arch}/libjnidispatch.so"
            echo "  📥 Downloading $arch from GitHub..."
            
            if curl -L -f -s -o "$JNI_LIBS_DIR/$arch/libjnidispatch.so" "$url"; then
                if [ -s "$JNI_LIBS_DIR/$arch/libjnidispatch.so" ]; then
                    echo -e "  ${GREEN}✅ $arch library downloaded${NC}"
                    ((SUCCESS_COUNT++))
                else
                    rm -f "$JNI_LIBS_DIR/$arch/libjnidispatch.so"
                fi
            fi
        done
    fi
fi

# Verify extracted files
echo ""
echo "🔍 Verifying extracted libraries..."

VERIFIED=0
for arch in "armeabi-v7a" "arm64-v8a" "x86" "x86_64"; do
    lib_file="$JNI_LIBS_DIR/$arch/libjnidispatch.so"
    if [ -f "$lib_file" ] && [ -s "$lib_file" ]; then
        size=$(stat -f%z "$lib_file" 2>/dev/null || stat -c%s "$lib_file" 2>/dev/null)
        echo -e "  ${GREEN}✅ $arch: $lib_file (${size} bytes)${NC}"
        ((VERIFIED++))
    else
        echo -e "  ${RED}❌ $arch: Missing or empty${NC}"
    fi
done

# Summary
echo ""
echo "========================================"
if [ $VERIFIED -gt 0 ]; then
    echo -e "${GREEN}✅ Successfully extracted $VERIFIED native library(ies)${NC}"
    echo ""
    echo "📝 Next steps:"
    echo "  1. Clean your Android build:"
    echo "     cd android && ./gradlew clean && cd .."
    echo "  2. Rebuild the app:"
    echo "     yarn android"
    echo ""
    echo "The JNA native libraries are now in:"
    echo "  $JNI_LIBS_DIR"
else
    echo -e "${RED}❌ Failed to extract any native libraries${NC}"
    echo ""
    echo "Please manually download JNA native libraries from:"
    echo "  https://github.com/java-native-access/jna/tree/master/lib/native"
    echo ""
    echo "And place them in:"
    echo "  $JNI_LIBS_DIR/<architecture>/libjnidispatch.so"
    exit 1
fi

# Cleanup temp directory if we downloaded JNA
if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
    rm -rf "$TEMP_DIR"
fi

echo ""
echo "✨ Done!"
