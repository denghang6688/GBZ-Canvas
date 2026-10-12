# ===========================================
# GBZ 智能画布 Dockerfile（基于官方精简 Python 镜像）
# ===========================================
# 用法：
#   docker build -t gbz-canvas .
#   docker run --rm -p 2000:2000 \
#       -v $(pwd)/data:/app/data \
#       -v $(pwd)/assets:/app/assets \
#       -v $(pwd)/workflows:/app/workflows \
#       gbz-canvas
# ===========================================

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    GBZ_PORT=2000

WORKDIR /app

# 先单独 copy requirements 充分利用缓存
COPY requirements.txt ./
RUN pip install -r requirements.txt

# 再 copy 源码
COPY main.py VERSION ./
COPY static ./static
COPY workflows ./workflows
COPY API ./API
COPY tools ./tools

# 运行时数据目录（建议通过 -v 挂载到宿主机）
RUN mkdir -p /app/data /app/assets

EXPOSE 2000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; \
sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:2000/api/health', timeout=3).status == 200 else 1)"

CMD ["python", "main.py"]