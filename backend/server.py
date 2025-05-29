from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
import httpx
import tempfile
import yt_dlp
import asyncio
from pydantic_settings import BaseSettings

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Settings configuration
class Settings(BaseSettings):
    MONGO_URL: str
    DB_NAME: str
    AUDD_API_TOKEN: str = ""
    
    class Config:
        env_file = ".env"

settings = Settings()

# MongoDB connection
client = AsyncIOMotorClient(settings.MONGO_URL)
db = client[settings.DB_NAME]

# Create the main app without a prefix
app = FastAPI(title="Music Recognition API", description="Shazam Competitor MVP")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Define Models
class MusicRecognitionResult(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    release_date: Optional[str] = None
    confidence: Optional[float] = None
    status: str = "success"
    message: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class ErrorResponse(BaseModel):
    status: str = "error"
    message: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

# Helper functions
async def recognize_with_audd(audio_data: bytes, filename: str) -> dict:
    """Recognize music using AudD.io API"""
    if not settings.AUDD_API_TOKEN:
        return {
            "status": "error",
            "message": "AudD API token not configured. Please add AUDD_API_TOKEN to your .env file."
        }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            files = {"file": (filename, audio_data, "audio/mpeg")}
            data = {"api_token": settings.AUDD_API_TOKEN, "return": "apple_music,spotify"}
            
            response = await client.post(
                "https://api.audd.io/",
                files=files,
                data=data
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get("status") == "success" and result.get("result"):
                    song_data = result["result"]
                    return {
                        "status": "success",
                        "title": song_data.get("title", "Unknown"),
                        "artist": song_data.get("artist", "Unknown"),
                        "album": song_data.get("album", "Unknown"),
                        "release_date": song_data.get("release_date", "Unknown"),
                        "confidence": 0.85  # AudD doesn't provide confidence, so we estimate
                    }
                else:
                    return {
                        "status": "not_found",
                        "message": "No match found for this audio"
                    }
            else:
                return {
                    "status": "error",
                    "message": f"API request failed with status {response.status_code}"
                }
                
    except Exception as e:
        return {
            "status": "error",
            "message": f"Recognition failed: {str(e)}"
        }

async def extract_audio_from_url(url: str, start_time: Optional[str] = None, sample_multiple: bool = False) -> tuple[bytes, str, dict]:
    """Extract audio from YouTube URL using yt-dlp with enhanced sampling"""
    try:
        # Configure yt-dlp options for YouTube optimization
        ydl_opts = {
            'format': 'bestaudio[ext=m4a]/bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'extractaudio': True,
            'audioformat': 'mp3',
            'outtmpl': '%(title)s.%(ext)s',
            'prefer_ffmpeg': True,
        }
        
        with tempfile.TemporaryDirectory() as temp_dir:
            ydl_opts['outtmpl'] = os.path.join(temp_dir, '%(title)s.%(ext)s')
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # Extract info first to get duration and title
                info = ydl.extract_info(url, download=False)
                title = info.get('title', 'Unknown')
                duration = info.get('duration', 0)  # Duration in seconds
                
                audio_segments = []
                metadata = {
                    'title': title,
                    'duration': duration,
                    'segments_processed': []
                }
                
                # Determine sampling strategy
                if sample_multiple and duration > 180:  # For videos longer than 3 minutes
                    # Sample at multiple points for long videos
                    sample_points = []
                    if duration > 600:  # 10+ minutes
                        sample_points = [0, duration * 0.25, duration * 0.5, duration * 0.75]
                    else:  # 3-10 minutes
                        sample_points = [0, duration * 0.5]
                    
                    for i, start_sec in enumerate(sample_points):
                        try:
                            segment_opts = ydl_opts.copy()
                            segment_opts['outtmpl'] = os.path.join(temp_dir, f'segment_{i}_%(title)s.%(ext)s')
                            
                            # Add ffmpeg options for time-based extraction
                            if start_sec > 0:
                                segment_opts['postprocessor_args'] = [
                                    '-ss', str(int(start_sec)),
                                    '-t', '30'  # Extract 30 seconds
                                ]
                            else:
                                segment_opts['postprocessor_args'] = ['-t', '30']
                            
                            with yt_dlp.YoutubeDL(segment_opts) as segment_ydl:
                                segment_ydl.download([url])
                                
                                # Find the downloaded segment file
                                for file in os.listdir(temp_dir):
                                    if file.startswith(f'segment_{i}_') and file.endswith(('.mp3', '.m4a', '.webm')):
                                        file_path = os.path.join(temp_dir, file)
                                        with open(file_path, 'rb') as f:
                                            segment_data = f.read()
                                        audio_segments.append({
                                            'data': segment_data,
                                            'start_time': int(start_sec),
                                            'filename': f"segment_{i}_{title}.mp3"
                                        })
                                        metadata['segments_processed'].append({
                                            'segment': i,
                                            'start_time': int(start_sec),
                                            'duration': 30
                                        })
                                        break
                        except Exception as e:
                            logger.warning(f"Failed to extract segment {i}: {str(e)}")
                            continue
                            
                elif start_time:
                    # Extract from specific time point
                    specific_opts = ydl_opts.copy()
                    # Parse start_time (format: "MM:SS" or "HH:MM:SS")
                    time_parts = start_time.split(':')
                    if len(time_parts) == 2:  # MM:SS
                        start_seconds = int(time_parts[0]) * 60 + int(time_parts[1])
                    elif len(time_parts) == 3:  # HH:MM:SS
                        start_seconds = int(time_parts[0]) * 3600 + int(time_parts[1]) * 60 + int(time_parts[2])
                    else:
                        start_seconds = 0
                    
                    specific_opts['postprocessor_args'] = [
                        '-ss', str(start_seconds),
                        '-t', '30'  # Extract 30 seconds from specified time
                    ]
                    
                    with yt_dlp.YoutubeDL(specific_opts) as specific_ydl:
                        specific_ydl.download([url])
                        
                        for file in os.listdir(temp_dir):
                            if file.endswith(('.mp3', '.m4a', '.webm')):
                                file_path = os.path.join(temp_dir, file)
                                with open(file_path, 'rb') as f:
                                    audio_data = f.read()
                                metadata['segments_processed'].append({
                                    'segment': 0,
                                    'start_time': start_seconds,
                                    'duration': 30
                                })
                                return audio_data, f"{title}.mp3", metadata
                
                else:
                    # Default: extract first 30 seconds
                    default_opts = ydl_opts.copy()
                    default_opts['postprocessor_args'] = ['-t', '30']
                    
                    with yt_dlp.YoutubeDL(default_opts) as default_ydl:
                        default_ydl.download([url])
                        
                        for file in os.listdir(temp_dir):
                            if file.endswith(('.mp3', '.m4a', '.webm')):
                                file_path = os.path.join(temp_dir, file)
                                with open(file_path, 'rb') as f:
                                    audio_data = f.read()
                                metadata['segments_processed'].append({
                                    'segment': 0,
                                    'start_time': 0,
                                    'duration': 30
                                })
                                return audio_data, f"{title}.mp3", metadata
                
                # Return the first successful segment if multiple sampling
                if audio_segments:
                    return audio_segments[0]['data'], audio_segments[0]['filename'], metadata
                    
                raise Exception("No audio file found after download")
                
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to extract audio from URL: {str(e)}")

async def recognize_multiple_segments(audio_segments: list, metadata: dict) -> dict:
    """Try recognition on multiple audio segments and return best match"""
    best_result = None
    best_confidence = 0
    all_results = []
    
    for i, segment in enumerate(audio_segments):
        try:
            result = await recognize_with_audd(segment['data'], segment['filename'])
            
            if result.get("status") == "success":
                confidence = result.get("confidence", 0.5)
                result['segment_info'] = {
                    'segment_number': i,
                    'start_time': segment['start_time']
                }
                all_results.append(result)
                
                if confidence > best_confidence:
                    best_confidence = confidence
                    best_result = result
                    
        except Exception as e:
            logger.warning(f"Recognition failed for segment {i}: {str(e)}")
            continue
    
    if best_result:
        best_result['metadata'] = metadata
        best_result['all_segments_tried'] = len(audio_segments)
        best_result['successful_segments'] = len(all_results)
        return best_result
    
    return {
        "status": "not_found",
        "message": f"No matches found in {len(audio_segments)} segments analyzed",
        "metadata": metadata
    }

# API Routes
@api_router.get("/")
async def root():
    return {"message": "Music Recognition API is running", "version": "1.0.0"}

@api_router.post("/recognize/file", response_model=MusicRecognitionResult)
async def recognize_from_file(file: UploadFile = File(...)):
    """Recognize music from uploaded audio file"""
    
    # Validate file type
    if not file.content_type or not file.content_type.startswith('audio/'):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload an audio file.")
    
    # Check file size (limit to 10MB)
    if file.size and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 10MB.")
    
    try:
        # Read file content
        audio_data = await file.read()
        
        # Recognize using AudD
        result = await recognize_with_audd(audio_data, file.filename or "audio.mp3")
        
        # Create response
        if result["status"] == "success":
            return MusicRecognitionResult(**result)
        elif result["status"] == "not_found":
            return MusicRecognitionResult(
                status="not_found",
                message=result["message"]
            )
        else:
            raise HTTPException(status_code=500, detail=result["message"])
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recognition failed: {str(e)}")

@api_router.post("/recognize/url", response_model=MusicRecognitionResult)
async def recognize_from_url(
    url: str = Form(...), 
    start_time: Optional[str] = Form(None),
    sample_multiple: bool = Form(False)
):
    """Recognize music from YouTube or other supported URLs with enhanced sampling"""
    
    try:
        # Extract audio with new features
        audio_data, filename, metadata = await extract_audio_from_url(url, start_time, sample_multiple)
        
        if sample_multiple and metadata.get('duration', 0) > 180:
            # Handle multiple segments
            audio_segments = []
            
            # Re-extract all segments for recognition
            with tempfile.TemporaryDirectory() as temp_dir:
                ydl_opts = {
                    'format': 'bestaudio[ext=m4a]/bestaudio/best',
                    'quiet': True,
                    'no_warnings': True,
                    'extractaudio': True,
                    'audioformat': 'mp3',
                    'prefer_ffmpeg': True,
                }
                
                duration = metadata['duration']
                sample_points = []
                if duration > 600:  # 10+ minutes
                    sample_points = [0, duration * 0.25, duration * 0.5, duration * 0.75]
                else:  # 3-10 minutes
                    sample_points = [0, duration * 0.5]
                
                for i, start_sec in enumerate(sample_points):
                    try:
                        segment_opts = ydl_opts.copy()
                        segment_opts['outtmpl'] = os.path.join(temp_dir, f'segment_{i}_%(title)s.%(ext)s')
                        
                        if start_sec > 0:
                            segment_opts['postprocessor_args'] = [
                                '-ss', str(int(start_sec)),
                                '-t', '30'
                            ]
                        else:
                            segment_opts['postprocessor_args'] = ['-t', '30']
                        
                        with yt_dlp.YoutubeDL(segment_opts) as segment_ydl:
                            segment_ydl.download([url])
                            
                            for file in os.listdir(temp_dir):
                                if file.startswith(f'segment_{i}_') and file.endswith(('.mp3', '.m4a', '.webm')):
                                    file_path = os.path.join(temp_dir, file)
                                    with open(file_path, 'rb') as f:
                                        segment_data = f.read()
                                    audio_segments.append({
                                        'data': segment_data,
                                        'start_time': int(start_sec),
                                        'filename': f"segment_{i}_{metadata['title']}.mp3"
                                    })
                                    break
                    except Exception as e:
                        logger.warning(f"Failed to extract segment {i}: {str(e)}")
                        continue
            
            # Recognize multiple segments
            if audio_segments:
                result = await recognize_multiple_segments(audio_segments, metadata)
            else:
                # Fallback to single recognition
                result = await recognize_with_audd(audio_data, filename)
        else:
            # Single recognition
            result = await recognize_with_audd(audio_data, filename)
            result['metadata'] = metadata
        
        # Create response
        if result["status"] == "success":
            response_data = MusicRecognitionResult(**result)
            # Add enhanced metadata
            if 'segment_info' in result:
                response_data.message = f"Found in segment at {result['segment_info']['start_time']}s"
            if 'all_segments_tried' in result:
                response_data.message = f"Best match from {result['successful_segments']}/{result['all_segments_tried']} segments"
            return response_data
        elif result["status"] == "not_found":
            response_data = MusicRecognitionResult(
                status="not_found",
                message=result["message"]
            )
            return response_data
        else:
            raise HTTPException(status_code=500, detail=result["message"])
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recognition failed: {str(e)}")

@api_router.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Test database connection
        await db.command("ping")
        
        # Check if AudD API token is configured
        api_configured = bool(settings.AUDD_API_TOKEN)
        
        return {
            "status": "healthy",
            "database": "connected",
            "audd_api": "configured" if api_configured else "not_configured",
            "timestamp": datetime.utcnow()
        }
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
