import asyncio
import contextlib
import io
import json
from pathlib import Path
import runpy
import sys
import types
import unittest
from unittest.mock import patch
import main

class ProgressTests(unittest.TestCase):
    def test_emission_and_routing(self):
        for total in [20, 0, float('nan')]:
            with self.subTest(total=total):
                class Capture:
                    index = 0
                    def isOpened(self): return True
                    def get(self, prop): return 25 if prop == 1 else total
                    def read(self):
                        self.index += 1
                        return self.index <= 20, object()
                    def release(self): pass
                class Detector:
                    def setSVMDetector(self, value): pass
                    def detectMultiScale(self, frame): return [1], []
                cv = types.SimpleNamespace(VideoCapture=lambda _: Capture(), CAP_PROP_FPS=1,
                    CAP_PROP_FRAME_COUNT=2, HOGDescriptor=Detector,
                    HOGDescriptor_getDefaultPeopleDetector=lambda: None)
                output = io.StringIO()
                with patch.dict(sys.modules, cv2=cv), patch.object(sys, 'argv',
                    ['video_analysis.py', '--video-path', 'test.mp4']), patch('time.monotonic', side_effect=range(100)), contextlib.redirect_stdout(output):
                    runpy.run_path(str(Path(__file__).with_name('video_analysis.py')), run_name='__main__')
                events = [json.loads(line) for line in output.getvalue().splitlines()]
                progress = [e for e in events if e['event_type'] == 'PROGRESS']
                self.assertGreater(len(progress), 2)
                self.assertEqual(progress[0]['metadata']['frames_read'], 0)
                self.assertEqual(progress[-1]['metadata']['frames_read'], 20)
                self.assertEqual(progress[-1]['metadata']['frames_analyzed'], 2)
                self.assertEqual(progress[-1]['metadata']['progress_percent'], 100 if total == 20 else None)

                async def consume():
                    stream = asyncio.StreamReader()
                    stream.feed_data(output.getvalue().encode())
                    stream.feed_eof()
                    process = types.SimpleNamespace(stdout=stream, pid=123, returncode=None)
                    main.tasks[999] = {'process': process, 'events': [], 'progress': None,
                        'last_metrics': None, 'last_error': None, 'stop_requested': False, 'video_id': 'test.mp4'}
                    try:
                        await main.read_stdout(999, process)
                        status = await main.get_task_status(999)
                        self.assertEqual(status['progress']['frames_read'], 20)
                        self.assertEqual(len(main.tasks[999]['events']), 2)
                        for code, stopped in [(0, False), (-15, True), (1, False)]:
                            process.returncode = code
                            main.tasks[999]['stop_requested'] = stopped
                            self.assertEqual((await main.get_task_status(999))['progress'], status['progress'])
                        self.assertEqual((await main.get_all_tasks())['tasks'][0]['progress'], status['progress'])
                    finally:
                        main.tasks.pop(999, None)
                asyncio.run(consume())

if __name__ == '__main__':
    unittest.main()
