import asyncio
from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import JSONResponse
import psutil
from asyncio import create_subprocess_exec
from contextlib import asynccontextmanager
import json
import os
import sys
from security import TaskRequest, video_file, authorize, BASE

MAX_ACTIVE_TASKS = 2
MAX_RETAINED_TASKS = 100
MAX_RUNTIME_SECONDS = 300
launch_lock = asyncio.Lock()



tasks = {}
agent_id = "agent_1"



async def read_stdout(task_id, process):
    while True:
        line = await process.stdout.readline()
        if not line:
            break
        try:
            event = json.loads(line.decode().strip())
        except (ValueError, UnicodeError):
            continue
        if not isinstance(event, dict):
            continue
        if event.get("event_type") == "PROGRESS":
            tasks[task_id]["progress"] = {**event.get("metadata", {}), "updated_at": event.get("timestamp")}
            continue
        tasks[task_id]["events"].append(event)
        if len(tasks[task_id]["events"]) > 100:
            tasks[task_id]["events"].pop(0)

async def read_stderr(task_id, process):
    while True:
        line = await process.stderr.readline()
        if not line:
            break
        text = line.decode().strip()
        tasks[task_id]["last_error"] = text

async def monitor_process(task_id, process):
    system_process = psutil.Process(process.pid)
    system_process.cpu_percent(None)

    while process.returncode is None:
        await asyncio.sleep(1)

        if tasks[task_id]["process"] is not process:
            break

        if process.returncode is not None:
            break

        tasks[task_id]["last_metrics"] = {
            "cpu_percent": system_process.cpu_percent(None),
            "memory_rss_bytes": system_process.memory_info().rss,
        }
async def stop_process(task_id):
    process = tasks[task_id].get("process")
    try:
        await asyncio.wait_for(process.wait(), timeout=5)
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # Clean up any resources if needed
    active_task_ids = []
    for task_id in tasks:
        process = tasks[task_id].get("process")
        if process and process.returncode is None:
            tasks[task_id]["stop_requested"] = True
            active_task_ids.append(task_id)
            process.terminate()

    await asyncio.gather(
    *(stop_process(task_id) for task_id in active_task_ids)
)



app = FastAPI(lifespan=lifespan, dependencies=[Depends(authorize)])

@app.get("/health")
async def health():
    active_tasks = sum(
    1
    for task in tasks.values()
    if task["process"].returncode is None
)
    active_task_ids = [
    task_id
    for task_id, task in tasks.items()
    if task["process"].returncode is None
]
    return {
  "agent_id": "agent_1",
  "status": "OK",
  "cpu_percent": psutil.cpu_percent(),
  "memory_percent": psutil.virtual_memory().percent,
  "active_tasks": len(active_task_ids),
  "active_task_ids": active_task_ids,
}

async def expire_task(task_id, process):
    try:
        await asyncio.wait_for(asyncio.shield(process.wait()), MAX_RUNTIME_SECONDS)
    except asyncio.TimeoutError:
        if tasks.get(task_id, {}).get('process') is process and process.returncode is None:
            tasks[task_id]['last_error'] = 'Task exceeded the 300 second runtime limit'
            process.terminate()
            await stop_process(task_id)

@app.post("/task")
async def process_task(request: TaskRequest):
    async with launch_lock:
        if request.task_id in tasks:
            raise HTTPException(409, 'Task ID already exists')
        if sum(t['process'].returncode is None for t in tasks.values()) >= MAX_ACTIVE_TASKS:
            raise HTTPException(429, 'Concurrent task limit reached')
        if len(tasks) >= MAX_RETAINED_TASKS:
            raise HTTPException(429, 'Task history capacity reached')
        video = video_file(request.video_id)
        if hasattr(os, 'geteuid') and os.geteuid() == 0:
            raise HTTPException(503, 'Workloads must not run as root')
        command = [sys.executable, str(BASE / 'workload_runner.py'),
                   str(video)]
        process = await create_subprocess_exec(
            *command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            cwd=str(BASE), env={'PATH': os.defpath, 'PYTHONUNBUFFERED': '1', 'OMP_NUM_THREADS': '1'},
        )
        tasks[request.task_id] = {
            'stop_requested': False, 'events': [], 'last_error': None,
            'last_metrics': None, 'process': process, 'progress': None, 'video_id': request.video_id,
        }
        asyncio.create_task(read_stdout(request.task_id, process))
        asyncio.create_task(read_stderr(request.task_id, process))
        asyncio.create_task(monitor_process(request.task_id, process))
        asyncio.create_task(expire_task(request.task_id, process))
        return {'message': 'Task started', 'pid': process.pid}

@app.get("/task/{task_id}")
async def get_task_status(task_id: int):
    if task_id not in tasks:
        return JSONResponse(status_code=404, content={"message": "Task not found"})
    
    process = tasks[task_id].get("process")
    context = {"progress": tasks[task_id].get("progress"), "video_id": tasks[task_id].get("video_id")}
    if process.returncode is None:
        if tasks[task_id].get("stop_requested") == True:
            return {**context, "status": "stopping", "pid": process.pid}
        return {**context, "status": "running", "pid": process.pid, "process_metrics": tasks[task_id]["last_metrics"]} 
    
    elif tasks[task_id].get("stop_requested") == True:
        return {**context, "status": "stopped", "returncode": process.returncode, "pid": process.pid}
    elif process.returncode == 0:
        return {**context, "status": "completed", "returncode": process.returncode, "pid": process.pid}
    else:
        return {**context, "status": "failed", "returncode": process.returncode, "last_error": tasks[task_id].get("last_error"), "pid": process.pid}

@app.post("/task/{task_id}/stop")
async def stop_task(task_id: int):
    if task_id not in tasks:
        return JSONResponse(status_code=404, content={"message": "Task not found"})
    
    process = tasks[task_id].get("process")
    if process.returncode is None:
        process.terminate()
        tasks[task_id]["stop_requested"] = True
        asyncio.create_task(stop_process(task_id))
        return { "status": "STOPPING", "pid": process.pid}
    else:
        status = ""
        if tasks[task_id].get("stop_requested") == True:
            status = "STOPPED"
        elif process.returncode == 0:
            status = "COMPLETED"
        else:
            status = "FAILED"
        return JSONResponse(content={ "status": status, "pid": process.pid, "returncode": process.returncode})

@app.get("/task/{task_id}/events")
async def get_task_events(task_id: int):
    if task_id not in tasks:
        return JSONResponse(status_code=404, content={"message": "Task not found"})
    
    events = tasks[task_id].get("events", [])
    return {"events": events}

@app.get("/tasks")
async def get_all_tasks():
    all_tasks = []

    for task_id, task in tasks.items():
        process = task["process"]

        if process.returncode is None:
            status = "stopping" if task["stop_requested"] else "running"
        elif task["stop_requested"]:
            status = "stopped"
        elif process.returncode == 0:
            status = "completed"
        else:
            status = "failed"

        all_tasks.append({
            "task_id": task_id,
            "video_id": task.get("video_id"),
            "progress": task.get("progress"),
            "status": status,
            "pid": process.pid,
            "returncode": process.returncode,
            "last_error": task["last_error"],
            "process_metrics": task["last_metrics"],
        })

    return {"tasks": all_tasks}

@app.get("/videos")
async def list_videos():
    video_dir = BASE / "videos"
    if not video_dir.exists() or not video_dir.is_dir():
        return {"videos": []}
    
    videos = [f.name for f in video_dir.iterdir() if f.is_file()]
    return {"videos": videos}