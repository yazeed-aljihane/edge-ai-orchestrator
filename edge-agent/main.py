import asyncio
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from asyncio import create_subprocess_exec
from contextlib import asynccontextmanager


tasks = {}
agent_id = "agent_1" 
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
    # for task_id in tasks:
    #     process = tasks[task_id].get("process")
    #     if process and process.returncode is None:
    #        try:
    #             await asyncio.wait_for(process.wait(), timeout=5)
    #        except asyncio.TimeoutError:
    #             process.kill()
    #             await process.wait()


app = FastAPI(lifespan=lifespan)

@app.get("/health")
async def health():
    return {"agent_id": agent_id ,"status": "OK"}

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
        tasks[task_id]["stop_requested"] = False
        tasks[task_id]["command"] = command
        tasks[task_id]["process"] = await create_subprocess_exec(*command)
    else:
        tasks[task_id] = {
            "stop_requested": False,
            "command": command,
            "process": await create_subprocess_exec(*command)
        }
    return {"message": "Task started", "pid": tasks[task_id]["process"].pid}

@app.get("/task/{task_id}")
async def get_task_status(task_id: int):
    if task_id not in tasks:
        return JSONResponse(status_code=404, content={"message": "Task not found"})
    
    process = tasks[task_id].get("process")
    if process.returncode is None:
        if tasks[task_id].get("stop_requested") == True:
            return {"status": "stopping", "pid": process.pid}
        return {"status": "running", "pid": process.pid}
    elif tasks[task_id].get("stop_requested") == True:
        return {"status": "stopped", "returncode": process.returncode, "pid": process.pid}
    elif process.returncode == 0:
        return {"status": "completed", "returncode": process.returncode, "pid": process.pid}
    else:
        return {"status": "failed", "returncode": process.returncode, "pid": process.pid}

@app.post("/task/{task_id}/stop")
async def stop_task(task_id: int):
    if task_id not in tasks:
        return JSONResponse(status_code=404, content={"message": "Task not found"})
    
    process = tasks[task_id].get("process")
    if process.returncode is None:
        process.terminate()
        tasks[task_id]["stop_requested"] = True
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


