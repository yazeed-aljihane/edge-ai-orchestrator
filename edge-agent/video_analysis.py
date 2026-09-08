import argparse
import json
from datetime import datetime, timezone
import math
import time
from pathlib import Path
import cv2






parser = argparse.ArgumentParser()

parser.add_argument("--video-path", required=True)

args = parser.parse_args()

requested_video_path = Path(args.video_path)
video_path = (
    requested_video_path
    if requested_video_path.is_absolute()
    else Path(__file__).resolve().parent / requested_video_path
)
video_id = video_path.name
capture = cv2.VideoCapture(str(video_path))
person_count = 0

if not capture.isOpened():
    raise RuntimeError(f"Cannot open video: {video_path}")

frame_count = 0
frames_analyzed = 0

detector = cv2.HOGDescriptor()
detector.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
fps = capture.get(cv2.CAP_PROP_FPS)
total_frames = capture.get(cv2.CAP_PROP_FRAME_COUNT)
last_person_count = None
valid_fps = math.isfinite(fps) and fps > 0
valid_total_frames = math.isfinite(total_frames) and total_frames > 0
def emit_progress():
    print(json.dumps({
        "event_type": "PROGRESS",
        "video_id": video_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "metadata": {
            "frames_read": frame_count,
            "frames_analyzed": frames_analyzed,
            "total_frames": int(total_frames) if valid_total_frames else None,
            "progress_percent": min(100.0, round(frame_count / total_frames * 100, 1)) if valid_total_frames else None,
        },
    }), flush=True)


emit_progress()
last_progress_at = time.monotonic()
while True:
    ok, frame = capture.read()

    if not ok:
        break

    frame_count += 1

    if frame_count % 10 == 0:
        boxes, _ = detector.detectMultiScale(frame)
        frames_analyzed += 1
        person_count = len(boxes)

        if person_count > 0 and person_count != last_person_count:
            print(json.dumps({
                "event_type": "PERSON_DETECTED",
                "video_id": video_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "metadata": {
                    "person_count": person_count,
                    "previous_person_count": last_person_count,
                    "frame_index": frame_count,
                    "video_time_seconds": (
                        (frame_count - 1) / fps if valid_fps else None
                    ),
                }
            }), flush=True)

        last_person_count = person_count

    now = time.monotonic()
    if now - last_progress_at >= 1:
        emit_progress()
        last_progress_at = now

capture.release()
emit_progress()

print(json.dumps({
  "event_type": "VIDEO_COMPLETED",
  "video_id": video_id,
  "timestamp": datetime.now(timezone.utc).isoformat(),
  "metadata": {
    "last_person_count": last_person_count,
    "frame_index": frame_count,
    "frames_read": frame_count,
    "frames_analyzed": frames_analyzed,
    "fps": fps if valid_fps else None,
    "total_frames": int(total_frames) if valid_total_frames else None,
  }
}), flush=True)
