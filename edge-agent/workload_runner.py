"""Fixed workload entrypoint. No user-controlled executable or Python code."""
import resource
import runpy
import sys
from pathlib import Path

resource.setrlimit(resource.RLIMIT_CPU, (240, 240))
resource.setrlimit(resource.RLIMIT_NOFILE, (128, 128))
resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
# Address-space limits are supported reliably for this workload on Linux.
if sys.platform.startswith('linux'):
    resource.setrlimit(resource.RLIMIT_AS, (2 * 1024**3, 2 * 1024**3))
script = Path(__file__).resolve().parent / 'video_analysis.py'
sys.argv = [str(script), '--video-path', sys.argv[1]]
runpy.run_path(str(script), run_name='__main__')
