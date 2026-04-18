from app.main import app
from app.config import get_env

if __name__ == "__main__":
    import uvicorn

    port = get_env("PORT") or 8765
    uvicorn.run("run:app", host="0.0.0.0", port=port, reload=False)
