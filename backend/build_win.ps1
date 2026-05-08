# ============================================================
# AI Karaoke - Windows Sidecar Build Script
# Run from the backend/ directory on a Windows machine
#
# Prerequisites:
#   - Python 3.10+ (https://www.python.org/downloads/)
#   - pip
#   - Internet connection (downloads PyTorch + FFmpeg ~3GB)
# ============================================================

param(
    [switch]$CpuOnly  # Pass -CpuOnly to skip CUDA and use CPU-only PyTorch
)

$ErrorActionPreference = "Stop"

Write-Host "=== AI Karaoke - Windows Sidecar Build ===" -ForegroundColor Cyan

# ── Step 1: Python dependencies ──────────────────────────────
Write-Host "`n[1/4] Installing Python dependencies..." -ForegroundColor Yellow

pip install pyinstaller `
    "fastapi>=0.115.0" `
    "uvicorn[standard]>=0.30.0" `
    "yt-dlp>=2024.10.0" `
    "demucs>=4.0.1" `
    "aiofiles>=23.2.1"

if ($CpuOnly) {
    Write-Host "Installing CPU-only PyTorch..." -ForegroundColor DarkYellow
    pip install torch torchaudio
} else {
    Write-Host "Installing PyTorch with CUDA 11.8 (for NVIDIA GPUs)..." -ForegroundColor DarkYellow
    pip install `
        "torch==2.1.0+cu118" `
        "torchaudio==2.1.0+cu118" `
        --extra-index-url https://download.pytorch.org/whl/cu118
}

# ── Step 2: FFmpeg ────────────────────────────────────────────
Write-Host "`n[2/4] Downloading FFmpeg for Windows..." -ForegroundColor Yellow

$ffmpegZip = "ffmpeg_win.zip"
$ffmpegUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"

Invoke-WebRequest -Uri $ffmpegUrl -OutFile $ffmpegZip -UseBasicParsing
Expand-Archive -Path $ffmpegZip -DestinationPath "ffmpeg_tmp" -Force

$ffmpegExe  = Get-ChildItem "ffmpeg_tmp" -Recurse -Filter "ffmpeg.exe"  | Select-Object -First 1
$ffprobeExe = Get-ChildItem "ffmpeg_tmp" -Recurse -Filter "ffprobe.exe" | Select-Object -First 1

Copy-Item $ffmpegExe.FullName  "ffmpeg.exe"  -Force
Copy-Item $ffprobeExe.FullName "ffprobe.exe" -Force

Remove-Item $ffmpegZip, "ffmpeg_tmp" -Recurse -Force
Write-Host "FFmpeg ready." -ForegroundColor Green

# ── Step 3: PyInstaller ───────────────────────────────────────
Write-Host "`n[3/4] Building backend.exe with PyInstaller..." -ForegroundColor Yellow

pyinstaller `
    --onefile `
    --name backend `
    --console `
    --add-binary "ffmpeg.exe;." `
    --add-binary "ffprobe.exe;." `
    --hidden-import demucs `
    --hidden-import demucs.pretrained `
    --hidden-import demucs.separate `
    --hidden-import demucs.htdemucs `
    --hidden-import yt_dlp `
    --hidden-import uvicorn.logging `
    --hidden-import uvicorn.loops `
    --hidden-import uvicorn.loops.auto `
    --hidden-import uvicorn.protocols `
    --hidden-import uvicorn.protocols.http `
    --hidden-import uvicorn.protocols.http.h11_impl `
    --hidden-import uvicorn.protocols.websockets `
    --hidden-import uvicorn.lifespan `
    --hidden-import uvicorn.lifespan.on `
    --collect-all demucs `
    --collect-all omegaconf `
    main.py

# ── Step 4: Copy to Tauri binaries ───────────────────────────
Write-Host "`n[4/4] Copying to src-tauri/binaries/..." -ForegroundColor Yellow

$targetDir = "..\src-tauri\binaries"
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Copy-Item "dist\backend.exe" "$targetDir\backend-x86_64-pc-windows-msvc.exe" -Force

# Clean up build artifacts
Remove-Item "ffmpeg.exe", "ffprobe.exe" -Force -ErrorAction SilentlyContinue
Remove-Item "dist", "build", "backend.spec" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "`n=== Sidecar build complete! ===" -ForegroundColor Green
Write-Host "Output: $targetDir\backend-x86_64-pc-windows-msvc.exe" -ForegroundColor Cyan
Write-Host "`nNext: run 'npm run tauri build' from the project root." -ForegroundColor White
