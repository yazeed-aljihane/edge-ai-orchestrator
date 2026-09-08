import time
import time
import json


end_time = time.monotonic() + 10

while time.monotonic() < end_time:
    sum(number * number for number in range(100_000))