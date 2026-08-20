import signal
import time


signal.signal(signal.SIGTERM, signal.SIG_IGN)

for number in range(1, 100):
    print(number)
    time.sleep(1)