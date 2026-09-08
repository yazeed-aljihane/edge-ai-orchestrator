import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
import main
import security

class SecurityTests(unittest.TestCase):
    def setUp(self):
        main.tasks.clear()
        self.client = TestClient(main.app, raise_server_exceptions=False)
        self.headers = {'Authorization': 'Bearer ' + security.TOKEN}
        self.payload = {'task_id': 123, 'operation': 'video_analysis', 'video_id': 'test.mp4'}

    def test_authentication_on_read_and_write(self):
        for route in ['/health', '/tasks', '/task/1/events']:
            self.assertEqual(self.client.get(route).status_code, 401)
        self.assertEqual(self.client.post('/task', json=self.payload).status_code, 401)
        self.assertEqual(self.client.post('/task/1/stop').status_code, 401)
        self.assertEqual(self.client.get('/health', headers=self.headers).status_code, 200)

    def test_rejects_untrusted_operations_before_spawn(self):
        cases = [dict(self.payload, command=['sh', '-c', 'echo invalid']),
                 dict(self.payload, operation='shell'), dict(self.payload, task_id=True)]
        for value in ['../test.mp4', '/tmp/test.mp4', 'https://example.com/a.mp4', 'test.mp4;echo bad', '--help', 'test.mp4\n']:
            cases.append(dict(self.payload, video_id=value))
        with patch.object(main, 'create_subprocess_exec', new_callable=AsyncMock) as spawn:
            for payload in cases:
                with self.subTest(payload=payload):
                    self.assertEqual(self.client.post('/task', json=payload, headers=self.headers).status_code, 422)
            spawn.assert_not_called()

    def test_symlink_rejected(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'outside.mp4').touch()
            (root / 'videos').mkdir()
            (root / 'videos' / 'linked.mp4').symlink_to(root / 'outside.mp4')
            with patch.object(security, 'VIDEO_ROOT', root / 'videos'):
                with self.assertRaises(Exception):
                    security.video_file('linked.mp4')

    def test_fixed_executable_and_no_secret_inheritance(self):
        with patch.object(main.os, 'geteuid', return_value=1000), patch.object(main, 'create_subprocess_exec', new_callable=AsyncMock, side_effect=RuntimeError('test: no launch')) as spawn:
            self.client.post('/task', json=self.payload, headers=self.headers)
            args, kwargs = spawn.call_args
            self.assertEqual(args[0], main.sys.executable)
            self.assertEqual(args[1], str(main.BASE / 'workload_runner.py'))
            self.assertEqual(args[2], str(security.video_file('test.mp4')))
            self.assertNotIn('EDGE_API_TOKEN', kwargs['env'])
            self.assertNotIn('OPERATOR_API_TOKEN', kwargs['env'])
            self.assertNotIn('shell', kwargs)

    def test_root_and_concurrency_limits(self):
        with patch.object(main.os, 'geteuid', return_value=0):
            self.assertEqual(self.client.post('/task', json=self.payload, headers=self.headers).status_code, 503)
        from types import SimpleNamespace
        main.tasks.update({i: {'process': SimpleNamespace(returncode=None)} for i in range(2)})
        self.assertEqual(self.client.post('/task', json=self.payload, headers=self.headers).status_code, 429)
        main.tasks.clear()

if __name__ == '__main__':
    unittest.main()
