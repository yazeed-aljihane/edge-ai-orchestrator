import os
import re
import secrets
from pathlib import Path
from typing import Literal
from fastapi import Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

BASE = Path(__file__).resolve().parent
VIDEO_ROOT = BASE / 'videos'

class TaskRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    task_id: int = Field(gt=0, le=9007199254740991)
    operation: Literal['video_analysis']
    video_id: str = Field(max_length=200, pattern=r'^[a-zA-Z0-9_-]+\.(mp4|avi|mov|mkv)$')

def video_file(name: str) -> Path:
    if not re.fullmatch(r'[a-zA-Z0-9_-]+\.(mp4|avi|mov|mkv)', name):
        raise HTTPException(400, 'Invalid video identifier')
    candidate = VIDEO_ROOT / name
    if candidate.is_symlink():
        raise HTTPException(400, 'Video symlinks are not allowed')
    resolved = candidate.resolve()
    if not resolved.is_relative_to(VIDEO_ROOT.resolve()) or not resolved.is_file():
        raise HTTPException(400, 'Video is not available')
    return resolved

def configured_token() -> str:
    token = os.environ.get('EDGE_API_TOKEN', '')
    if not token:
        # Same local configuration as the Cloud process; never passed to workloads.
        env_file = BASE.parent / '.env'
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith('EDGE_API_TOKEN='):
                    token = line.partition('=')[2].strip().strip('\"\'')
    if len(token) < 32:
        raise RuntimeError('EDGE_API_TOKEN must contain at least 32 characters')
    return token

TOKEN = configured_token()

def authorize(authorization: str = Header(default='')):
    if not secrets.compare_digest(authorization, 'Bearer ' + TOKEN):
        raise HTTPException(401, 'Authentication required')
