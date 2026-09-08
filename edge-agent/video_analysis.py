import argparse
import json
from datetime import datetime, timezone
import cv2






parser = argparse.ArgumentParser()

parser.add_argument("--video-path", required=True)
parser.add_argument("--camera-id", required=True)

args = parser.parse_args()

video_path = args.video_path
camera_id = args.camera_id
capture = cv2.VideoCapture(video_path)
person_count = 0

if not capture.isOpened():
    raise RuntimeError(f"Cannot open video: {video_path}")

frame_count = 0

detector = cv2.HOGDescriptor()
detector.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

last_person_count = None
while True:
    ok, frame = capture.read()

    if not ok:
        break

    frame_count += 1

    if frame_count % 10 != 0:
        continue

    boxes, _ = detector.detectMultiScale(frame)
    person_count = len(boxes)

    if person_count > 0 and person_count != last_person_count:
        print(json.dumps({
            "event_type": "PERSON_DETECTED",
            "camera_id": camera_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "metadata": {
                "person_count": person_count,
                "frame_index": frame_count
            }
        }), flush=True)

    last_person_count = person_count

capture.release()

print(json.dumps({
  "event_type": "VIDEO_COMPLETED",
  "camera_id": camera_id,
  "timestamp": datetime.now(timezone.utc).isoformat(),
  "metadata": {
    "person_count": person_count,
    "frame_index": frame_count,
    "frames_processed": frame_count
  }
}), flush=True)

