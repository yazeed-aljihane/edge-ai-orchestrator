import signal
import time
import json

signal.signal(signal.SIGTERM, signal.SIG_IGN)

for number in range(1, 102):
    print(json.dumps({"number": number, "message": "Processing..."}), flush=True)
    time.sleep(1)