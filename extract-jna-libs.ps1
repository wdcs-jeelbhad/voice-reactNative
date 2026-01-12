# PowerShell script to extract JNA native libraries for Android (Windows)
# This fixes the "libjnidispatch.so not found" error

Write-Host "🔧 JNA Native Library Extraction Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Project directories
$PROJECT_ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$JNI_LIBS_DIR = Join-Path $PROJECT_ROOT "android\app\src\main\jniLibs"

# Create jniLibs directory structure
Write-Host "📁 Creating jniLibs directory structure..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path (Join-Path $JNI_LIBS_DIR "armeabi-v7a") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $JNI_LIBS_DIR "arm64-v8a") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $JNI_LIBS_DIR "x86") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $JNI_LIBS_DIR "x86_64") | Out-Null

# Find JNA JAR file
Write-Host ""
Write-Host "🔍 Searching for JNA JAR file..." -ForegroundColor Yellow

$JNA_JAR = $null
$GRADLE_CACHE = Join-Path $env:USERPROFILE ".gradle\caches\modules-2\files-2.1\net.java.dev.jna\jna"

if (Test-Path $GRADLE_CACHE) {
    $VERSION_DIRS = Get-ChildItem -Path $GRADLE_CACHE -Directory | Sort-Object Name -Descending
    foreach ($versionDir in $VERSION_DIRS) {
        $jarFiles = Get-ChildItem -Path $versionDir -Recurse -Filter "jna-*.jar" | Where-Object { $_.Name -notlike "*sources*" -and $_.Name -notlike "*javadoc*" }
        if ($jarFiles.Count -gt 0) {
            $JNA_JAR = $jarFiles[0].FullName
            Write-Host "✅ Found JNA JAR: $JNA_JAR" -ForegroundColor Green
            break
        }
    }
}

# If not found, download it
if (-not $JNA_JAR -or -not (Test-Path $JNA_JAR)) {
    Write-Host ""
    Write-Host "⚠️  JNA JAR not found in cache" -ForegroundColor Yellow
    Write-Host "📥 Downloading JNA 5.13.0..." -ForegroundColor Yellow
    
    $TEMP_DIR = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_ }
    $JAR_PATH = Join-Path $TEMP_DIR "jna.jar"
    
    try {
        Invoke-WebRequest -Uri "https://repo1.maven.org/maven2/net/java/dev/jna/jna/5.13.0/jna-5.13.0.jar" -OutFile $JAR_PATH
        $JNA_JAR = $JAR_PATH
        Write-Host "✅ Downloaded JNA JAR" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to download JNA JAR: $_" -ForegroundColor Red
        exit 1
    }
}

# Extract native libraries
Write-Host ""
Write-Host "📦 Extracting native libraries from JNA JAR..." -ForegroundColor Yellow

$SUCCESS_COUNT = 0

# Function to extract library for a specific architecture
function Extract-Lib {
    param(
        [string]$Arch,
        [string]$JarPath,
        [string]$TargetDir
    )
    
    $possiblePaths = @(
        "com/sun/jna/android-$Arch/libjnidispatch.so",
        "com/sun/jna/$Arch/libjnidispatch.so",
        "native/android-$Arch/libjnidispatch.so"
    )
    
    foreach ($path in $possiblePaths) {
        try {
            Add-Type -AssemblyName System.IO.Compression.FileSystem
            $zip = [System.IO.Compression.ZipFile]::OpenRead($JarPath)
            $entry = $zip.Entries | Where-Object { $_.FullName -eq $path }
            
            if ($entry) {
                Write-Host "  📥 Extracting $Arch from $path..." -ForegroundColor Yellow
                $outputPath = Join-Path $TargetDir "libjnidispatch.so"
                [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $outputPath, $true)
                $zip.Dispose()
                Write-Host "  ✅ $Arch library extracted" -ForegroundColor Green
                return $true
            }
            $zip.Dispose()
        } catch {
            # Continue to next path
        }
    }
    
    Write-Host "  ⚠️  $Arch library not found in JAR" -ForegroundColor Yellow
    return $false
}

# Extract for each architecture
$architectures = @("armeabi-v7a", "arm64-v8a", "x86", "x86_64")
foreach ($arch in $architectures) {
    $targetDir = Join-Path $JNI_LIBS_DIR $arch
    if (Extract-Lib -Arch $arch -JarPath $JNA_JAR -TargetDir $targetDir) {
        $SUCCESS_COUNT++
    }
}

# If extraction from JAR failed, try downloading directly
if ($SUCCESS_COUNT -eq 0) {
    Write-Host ""
    Write-Host "⚠️  Could not extract from JAR, trying direct download..." -ForegroundColor Yellow
    
    $BASE_URL = "https://github.com/java-native-access/jna/raw/master/lib/native"
    
    $downloadUrls = @{
        "armeabi-v7a" = "$BASE_URL/android-arm/libjnidispatch.so"
        "arm64-v8a" = "$BASE_URL/android-arm64/libjnidispatch.so"
        "x86" = "$BASE_URL/android-x86/libjnidispatch.so"
        "x86_64" = "$BASE_URL/android-x86-64/libjnidispatch.so"
    }
    
    Write-Host "📥 Downloading native libraries from GitHub..." -ForegroundColor Yellow
    
    foreach ($arch in $architectures) {
        Write-Host "  📥 Downloading $arch..." -ForegroundColor Yellow
        $outputPath = Join-Path (Join-Path $JNI_LIBS_DIR $arch) "libjnidispatch.so"
        
        try {
            Invoke-WebRequest -Uri $downloadUrls[$arch] -OutFile $outputPath
            Write-Host "  ✅ $arch library downloaded" -ForegroundColor Green
            $SUCCESS_COUNT++
        } catch {
            Write-Host "  ⚠️  $arch library download failed" -ForegroundColor Yellow
        }
    }
}

# Verify extracted files
Write-Host ""
Write-Host "🔍 Verifying extracted libraries..." -ForegroundColor Yellow

$VERIFIED = 0
foreach ($arch in $architectures) {
    $libFile = Join-Path (Join-Path $JNI_LIBS_DIR $arch) "libjnidispatch.so"
    if (Test-Path $libFile) {
        $size = (Get-Item $libFile).Length
        Write-Host "  ✅ $arch : $libFile ($size bytes)" -ForegroundColor Green
        $VERIFIED++
    } else {
        Write-Host "  ❌ $arch : Missing or empty" -ForegroundColor Red
    }
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ($VERIFIED -gt 0) {
    Write-Host "✅ Successfully extracted $VERIFIED native library(ies)" -ForegroundColor Green
    Write-Host ""
    Write-Host "📝 Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Clean your Android build:"
    Write-Host "     cd android && .\gradlew clean && cd .."
    Write-Host "  2. Rebuild the app:"
    Write-Host "     yarn android"
    Write-Host ""
    Write-Host "The JNA native libraries are now in:"
    Write-Host "  $JNI_LIBS_DIR" -ForegroundColor Cyan
} else {
    Write-Host "❌ Failed to extract any native libraries" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please manually download JNA native libraries from:"
    Write-Host "  https://github.com/java-native-access/jna/tree/master/lib/native"
    Write-Host ""
    Write-Host "And place them in:"
    Write-Host "  $JNI_LIBS_DIR\<architecture>\libjnidispatch.so"
    exit 1
}

Write-Host ""
Write-Host "✨ Done!" -ForegroundColor Green
