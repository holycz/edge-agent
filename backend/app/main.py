"""
FastAPI 应用主入口
"""

import logging
import sys
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.routes import router
from app.config import get_env, validate_config

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger(__name__)

# 创建 FastAPI 应用
app = FastAPI(
    title="AI Assistant Backend",
    version="2.0.0",
    description="AI 划词问答助手后端服务，支持多种模型和推理模式",
)

# 添加 CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 请求日志中间件
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """记录请求日志"""
    logger.debug(f"{request.method} {request.url.path}")
    response = await call_next(request)
    logger.debug(f"{request.method} {request.url.path} - {response.status_code}")
    return response


# 全局异常处理
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理器"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": f"服务器内部错误: {str(exc)}"},
    )


# 注册路由
app.include_router(router)


@app.get("/api/health")
async def health():
    """健康检查接口"""
    return {
        "status": "ok",
        "version": "2.0.0",
        "port": get_env("PORT") or 8765,
    }


@app.get("/api/health/detailed")
async def health_detailed():
    """详细健康检查，包含配置验证"""
    validation = validate_config()

    return {
        "status": "ok" if validation["valid"] else "degraded",
        "version": "2.0.0",
        "port": get_env("PORT") or 8765,
        "config_valid": validation["valid"],
        "config_issues": validation["issues"],
    }


@app.on_event("startup")
async def startup_event():
    """应用启动事件"""
    logger.info("AI Assistant Backend starting...")

    # 验证配置
    validation = validate_config()
    if not validation["valid"]:
        logger.warning(f"Configuration issues: {validation['issues']}")
    else:
        logger.info("Configuration validated successfully")

    logger.info(f"Model: {get_env('MODEL')}")
    logger.info(f"API URL: {get_env('API_URL')}")
    logger.info(f"Server running on port: {get_env('PORT', 8765)}")


@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭事件"""
    logger.info("AI Assistant Backend shutting down...")
