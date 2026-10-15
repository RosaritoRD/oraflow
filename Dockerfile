# Oraflow en un contenedor. Imagen oficial de Playwright:
# trae Node 22 + Chromium (el slideshow se renderiza con Playwright).
# Corre como `pwuser`, nunca root.
FROM mcr.microsoft.com/playwright:v1.54.2-jammy
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-pip fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*
# Pestañas Shorts/Clipping: los scripts de Shorts (opcionales) se montan
# en /shorts. Clipping transcribe con faster-whisper (CPU); las fuentes DejaVu son
# las que usan los subtítulos.
RUN python3 -m pip install --no-cache-dir --upgrade "pip>=24" \
 && python3 -m pip install --no-cache-dir faster-whisper==1.2.1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
# chown sin pasar por node_modules (solo lectura): recorrerlo duplicaba ~500 MB en otra capa.
RUN mkdir -p data config uploads logs temp \
 && find /app -path /app/node_modules -prune -o -exec chown pwuser:pwuser {} +
USER pwuser
ENV NODE_ENV=production PORT=3456
EXPOSE 3456
CMD ["node", "index.js"]
