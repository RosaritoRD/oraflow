FROM python:3.12-slim

ARG YOUTUBE_NICHE_COMMIT=d8f605c273e15cbdcb536ef8e4b076ef892172be

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && git clone --filter=blob:none https://github.com/sentien-labs/youtube-niche.git /opt/youtube-niche \
    && git -C /opt/youtube-niche checkout "${YOUTUBE_NICHE_COMMIT}" \
    && python -m pip install --no-cache-dir /opt/youtube-niche \
    && apt-get purge -y --auto-remove git \
    && rm -rf /var/lib/apt/lists/* /opt/youtube-niche/.git

WORKDIR /app
COPY integrations/niche-engine/service.py /app/service.py

RUN useradd --system --uid 10001 --create-home niche \
    && mkdir -p /data \
    && chown -R niche:niche /app /data

USER niche
ENV PYTHONUNBUFFERED=1 NICHE_ENGINE_PORT=8765 NICHE_ENGINE_DATA=/data
EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/health', timeout=3)"

CMD ["python", "/app/service.py"]
