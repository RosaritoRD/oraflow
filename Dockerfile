# Oraflow in a container. Official Playwright image:
# ships Node 22 + Chromium (the slideshow is rendered with Playwright).
# Runs as `pwuser`, never root.
FROM mcr.microsoft.com/playwright:v1.54.2-jammy
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-pip fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*
# Shorts/Clipping tabs: the (optional) Shorts scripts are mounted
# at /shorts. Clipping transcribes with faster-whisper (CPU); the DejaVu fonts are
# the ones the subtitles use.
RUN python3 -m pip install --no-cache-dir --upgrade "pip>=24" \
 && python3 -m pip install --no-cache-dir faster-whisper==1.2.1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
# chown without walking node_modules (read-only): walking it duplicated ~500 MB in another layer.
RUN mkdir -p data config uploads logs temp \
 && find /app -path /app/node_modules -prune -o -exec chown pwuser:pwuser {} +
USER pwuser
ENV NODE_ENV=production PORT=3456
EXPOSE 3456
CMD ["node", "index.js"]
