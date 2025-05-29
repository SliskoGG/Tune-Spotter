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

# Remove old complex functions - not needed anymore

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

# Audio extraction response model
class AudioExtractionResult(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    duration: int  # in seconds
    extracted_segment: Optional[dict] = None
    status: str = "success"
    message: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

async def extract_audio_segment(url: str, start_time: Optional[str] = None, end_time: Optional[str] = None) -> tuple[bytes, str, dict]:
    """Extract audio segment from YouTube URL"""
    try:
        # Configure yt-dlp for simple extraction
        ydl_opts = {
            'format': 'bestaudio[ext=m4a]/bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'extractaudio': True,
            'audioformat': 'mp3',
            'prefer_ffmpeg': True,
        }
        
        with tempfile.TemporaryDirectory() as temp_dir:
            ydl_opts['outtmpl'] = os.path.join(temp_dir, '%(title)s.%(ext)s')
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # Extract info first
                info = ydl.extract_info(url, download=False)
                title = info.get('title', 'Unknown')
                duration = info.get('duration', 0)
                
                metadata = {
                    'title': title,
                    'duration': duration,
                    'original_url': url
                }
                
                # Parse time inputs
                start_seconds = 0
                end_seconds = None
                
                if start_time:
                    time_parts = start_time.split(':')
                    if len(time_parts) == 2:  # MM:SS
                        start_seconds = int(time_parts[0]) * 60 + int(time_parts[1])
                    elif len(time_parts) == 3:  # HH:MM:SS
                        start_seconds = int(time_parts[0]) * 3600 + int(time_parts[1]) * 60 + int(time_parts[2])
                
                if end_time:
                    time_parts = end_time.split(':')
                    if len(time_parts) == 2:  # MM:SS
                        end_seconds = int(time_parts[0]) * 60 + int(time_parts[1])
                    elif len(time_parts) == 3:  # HH:MM:SS
                        end_seconds = int(time_parts[0]) * 3600 + int(time_parts[1]) * 60 + int(time_parts[2])
                
                # Calculate duration of segment
                if end_seconds and end_seconds > start_seconds:
                    segment_duration = end_seconds - start_seconds
                else:
                    segment_duration = min(30, duration - start_seconds)  # Default 30 seconds or rest of video
                
                # Set ffmpeg options for extraction
                if start_seconds > 0 or segment_duration < duration:
                    postprocessor_args = ['-ss', str(start_seconds)]
                    if segment_duration:
                        postprocessor_args.extend(['-t', str(segment_duration)])
                    ydl_opts['postprocessor_args'] = postprocessor_args
                
                # Download the segment
                ydl.download([url])
                
                # Find and read the file
                for file in os.listdir(temp_dir):
                    if file.endswith(('.mp3', '.m4a', '.webm')):
                        file_path = os.path.join(temp_dir, file)
                        with open(file_path, 'rb') as f:
                            audio_data = f.read()
                        
                        # Create filename with time info
                        time_suffix = ""
                        if start_time:
                            time_suffix = f"_{start_time.replace(':', 'm')}s"
                        if end_time:
                            time_suffix += f"-{end_time.replace(':', 'm')}s"
                        
                        filename = f"{title}{time_suffix}.mp3"
                        
                        metadata['extracted_segment'] = {
                            'start_time': start_seconds,
                            'duration': segment_duration,
                            'filename': filename
                        }
                        
                        return audio_data, filename, metadata
                
                raise Exception("No audio file found after download")
                
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to extract audio from URL: {str(e)}")

@api_router.post("/extract/url")
async def extract_from_url(
    url: str = Form(...), 
    start_time: Optional[str] = Form(None),
    end_time: Optional[str] = Form(None)
):
    """Extract audio segment from YouTube or other supported URLs and return as downloadable file"""
    
    try:
        # Extract audio segment
        audio_data, filename, metadata = await extract_audio_segment(url, start_time, end_time)
        
        # Return the actual audio file for download
        from fastapi.responses import Response
        
        return Response(
            content=audio_data,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": f"attachment; filename=\"{filename}\"",
                "Content-Type": "audio/mpeg",
                "Content-Length": str(len(audio_data))
            }
        )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audio extraction failed: {str(e)}")

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
