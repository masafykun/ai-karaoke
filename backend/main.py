from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import yt_dlp
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="AI Karaoke API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_output_dir() -> Path:
    if os.getenv("OUTPUT_DIR"):
        return Path(os.environ["OUTPUT_DIR"])
    # Windows/Mac desktop: save to user's Downloads/ai-karaoke
    return Path.home() / "Downloads" / "ai-karaoke"


def _setup_ffmpeg_path() -> str | None:
    """When running as a PyInstaller bundle, add the exe directory to PATH
    so ffmpeg/ffprobe can be found, and return it for yt-dlp's ffmpeg_location."""
    if getattr(sys, "frozen", False):
        exe_dir = str(Path(sys.executable).parent)
        os.environ["PATH"] = exe_dir + os.pathsep + os.environ.get("PATH", "")
        return exe_dir
    return None


OUTPUT_DIR = _get_output_dir()
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
FFMPEG_LOCATION = _setup_ffmpeg_path()

# Valid license keys (prototype hardcoded validation)
VALID_KEYS = {"KARAOKE-DEMO", "KARAOKE-2024", "AI-KARAOKE-PRO"}

jobs: dict[str, dict] = {}
_executor = ThreadPoolExecutor(max_workers=2)


# ── Request models ───────────────────────────────────────────────────────────

class LicenseReq(BaseModel):
    key: str


class ProcessReq(BaseModel):
    url: str


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/api/license/verify")
async def verify_license(req: LicenseReq):
    return {"valid": req.key.strip().upper() in VALID_KEYS}


@app.post("/api/process")
async def start_process(req: ProcessReq, bg: BackgroundTasks):
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status": "pending",
        "progress": 0,
        "stage": "queued",
        "message": "処理を開始しています...",
        "vocals_url": None,
        "accompaniment_url": None,
        "error": None,
    }
    bg.add_task(run_pipeline, job_id, req.url)
    return {"job_id": job_id}


@app.get("/api/progress/{job_id}")
async def progress_stream(job_id: str):
    async def generate():
        # Poll job state every 0.5s and stream as SSE (max 40 min)
        for _ in range(4800):
            job = jobs.get(job_id)
            if not job:
                yield f"data: {json.dumps({'status': 'error', 'message': 'Job not found'})}\n\n"
                return
            yield f"data: {json.dumps(job)}\n\n"
            if job["status"] in ("completed", "error"):
                return
            await asyncio.sleep(0.5)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/files/{job_id}/{filename}")
async def serve_file(job_id: str, filename: str):
    # Prevent path traversal
    safe_name = Path(filename).name
    file_path = OUTPUT_DIR / job_id / safe_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, filename=safe_name, media_type="audio/wav")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ── Processing pipeline ──────────────────────────────────────────────────────

async def run_pipeline(job_id: str, url: str):
    job_dir = OUTPUT_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    def update(d: dict):
        jobs[job_id].update(d)

    try:
        # Phase 1: Download audio from YouTube
        update({"status": "downloading", "stage": "download",
                "message": "YouTube音声をダウンロード中...", "progress": 3})
        audio_file = await _download(job_id, url, job_dir)

        # Phase 2: AI source separation with demucs
        update({"status": "separating", "stage": "separate",
                "message": "AIで音源を分離中（数分かかります）...", "progress": 35})

        anim = asyncio.create_task(_animate_progress(job_id, 35, 90, 300))
        try:
            await _separate(job_dir, audio_file)
        finally:
            anim.cancel()
            try:
                await anim
            except asyncio.CancelledError:
                pass

        # Phase 3: Collect output files
        update({"progress": 93, "message": "ファイルを整理中..."})

        vocals = _find_file(job_dir, "vocals.wav")
        no_vocals = _find_file(job_dir, "no_vocals.wav")

        if not vocals or not no_vocals:
            raise RuntimeError("demucsの出力ファイルが見つかりません")

        final_vocals = job_dir / "vocals.wav"
        final_no_vocals = job_dir / "no_vocals.wav"
        _safe_move(vocals, final_vocals)
        _safe_move(no_vocals, final_no_vocals)

        update({
            "status": "completed",
            "progress": 100,
            "stage": "done",
            "message": "変換完了！",
            "vocals_url": f"/api/files/{job_id}/vocals.wav",
            "accompaniment_url": f"/api/files/{job_id}/no_vocals.wav",
        })

    except asyncio.CancelledError:
        raise
    except Exception as exc:
        update({
            "status": "error",
            "stage": "error",
            "message": "エラーが発生しました",
            "error": str(exc),
        })


async def _download(job_id: str, url: str, outdir: Path) -> Path:
    loop = asyncio.get_event_loop()

    def _run():
        def progress_hook(d):
            if d["status"] == "downloading":
                dl = d.get("downloaded_bytes", 0)
                total = d.get("total_bytes") or d.get("total_bytes_estimate") or 1
                pct = max(3, min(34, int(dl / total * 30) + 3))
                jobs[job_id]["progress"] = pct

        opts = {
            "format": "bestaudio/best",
            "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "wav"}],
            "outtmpl": str(outdir / "original.%(ext)s"),
            "progress_hooks": [progress_hook],
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            # When bundled as PyInstaller exe, point yt-dlp at the bundled ffmpeg
            **({"ffmpeg_location": FFMPEG_LOCATION} if FFMPEG_LOCATION else {}),
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])

    await loop.run_in_executor(_executor, _run)

    wavs = list(outdir.glob("original*.wav"))
    if not wavs:
        raise RuntimeError("ダウンロードしたWAVファイルが見つかりません。URLを確認してください。")
    return wavs[0]


async def _separate(outdir: Path, audio: Path):
    proc = await asyncio.create_subprocess_exec(
        "python", "-m", "demucs",
        "--two-stems=vocals",
        "-o", str(outdir),
        str(audio),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    output, _ = await proc.communicate()
    if proc.returncode != 0:
        err_msg = output.decode("utf-8", errors="replace")[-500:] if output else ""
        raise RuntimeError(f"demucsが失敗しました (終了コード {proc.returncode}): {err_msg}")


async def _animate_progress(job_id: str, start: int, end: int, duration: float):
    """Smoothly animate the progress bar during long-running demucs inference."""
    steps = max(1, int(duration / 0.5))
    step_size = (end - start) / steps
    current = float(start)
    try:
        while int(current) < end:
            await asyncio.sleep(0.5)
            current = min(current + step_size, end - 0.1)
            jobs[job_id]["progress"] = int(current)
    except asyncio.CancelledError:
        pass


def _find_file(base: Path, name: str) -> Path | None:
    return next(base.rglob(name), None)


def _safe_move(src: Path, dst: Path):
    if src != dst and not dst.exists():
        shutil.move(str(src), str(dst))


if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description="AI Karaoke backend")
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "18432")))
    parser.add_argument("--host", default="127.0.0.1")
    cli_args = parser.parse_args()

    # Re-resolve output dir now that we know if we're frozen
    OUTPUT_DIR = _get_output_dir()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    uvicorn.run(app, host=cli_args.host, port=cli_args.port)
