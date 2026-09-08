import asyncio
from fastapi import FastAPI
from fastapi.responses import JSONResponse
import psutil
from asyncio import create_subprocess_exec
from contextlib import asynccontextmanager
import json



tasks = {}
agent_id = "agent_1"



async def read_stdout(task_id, process):
    while True:
        line = await process.stdout.readline()
        if not line:
            break
        text = line.decode().strip()
        event = json.loads(text)
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



app = FastAPI(lifespan=lifespan)

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

@app.post("/task")
async def process_task(request: dict):
    task_id = request.get("task_id")
    command = request.get("command")
    if(task_id is None or command is None):
        return JSONResponse(status_code=400, content={"message": "task_id and command are required"})
    
    if task_id in tasks:
        process = tasks[task_id].get("process")
        if process.returncode is None:
            return JSONResponse(status_code=200, content={"message": "Task is already running"})
        tasks[task_id]["events"] = []
        tasks[task_id]["last_error"] = None
        tasks[task_id]["last_metrics"] = None
        tasks[task_id]["stop_requested"] = False
        tasks[task_id]["command"] = command
        tasks[task_id]["process"] = await create_subprocess_exec(*command,stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,)
        
    else:
        tasks[task_id] = {
            "stop_requested": False,
            "command": command,
            "events": [],
            "last_error": None,
            "last_metrics": None,
            "process": await create_subprocess_exec(*command, stdout=asyncio.subprocess.PIPE,
    stderr=asyncio.subprocess.PIPE,)
        }
    process = tasks[task_id]["process"]
    asyncio.create_task(read_stdout(task_id, process))
    asyncio.create_task(read_stderr(task_id, process))
    asyncio.create_task(monitor_process(task_id, process))
    return {"message": "Task started", "pid": tasks[task_id]["process"].pid}

@app.get("/task/{task_id}")
async def get_task_status(task_id: int):
    if task_id not in tasks:
        return JSONResponse(status_code=404, content={"message": "Task not found"})
    
    process = tasks[task_id].get("process")
    if process.returncode is None:
        if tasks[task_id].get("stop_requested") == True:
            return {"status": "stopping", "pid": process.pid}
        return {"status": "running", "pid": process.pid, "process_metrics": tasks[task_id]["last_metrics"]} 
    
    elif tasks[task_id].get("stop_requested") == True:
        return {"status": "stopped", "returncode": process.returncode, "pid": process.pid}
    elif process.returncode == 0:
        return {"status": "completed", "returncode": process.returncode, "pid": process.pid}
    else:
        return {"status": "failed", "returncode": process.returncode, "last_error": tasks[task_id].get("last_error"), "pid": process.pid}

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
        return JSONResponse({ "status": status, "pid": process.pid, "returncode": process.returncode})

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
            "status": status,
            "pid": process.pid,
            "returncode": process.returncode,
            "last_error": task["last_error"],
            "process_metrics": task["last_metrics"],
        })

    return {"tasks": all_tasks}