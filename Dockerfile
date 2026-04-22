FROM node:22-bookworm-slim AS deps

ARG TARGETARCH
ARG INSTALL_LIBREOFFICE=false

ENV NODE_ENV=production \
  PIP_DISABLE_PIP_VERSION_CHECK=1 \
  PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg unzip poppler-utils antiword python3 python3-pip \
  && if [ "$INSTALL_LIBREOFFICE" = "true" ]; then \
      apt-get install -y --no-install-recommends libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress fonts-dejavu fonts-liberation; \
    fi \
  && pip3 install --no-cache-dir --break-system-packages --retries 5 --default-timeout=300 requests faster-whisper==1.1.1 opencv-python-headless==4.10.0.84 numpy==1.26.4 \
  && pip3 install --no-cache-dir --break-system-packages --retries 5 --default-timeout=300 torch==2.5.1 torchaudio==2.5.1 whisperx==3.3.1 \
  && arch="${TARGETARCH}" \
  && if [ -z "$arch" ]; then arch="$(dpkg --print-architecture 2>/dev/null || true)"; fi \
  && if [ -z "$arch" ]; then arch="$(uname -m)"; fi \
  && echo "Detected arch: $arch" \
  && if [ "$arch" = "amd64" ] || [ "$arch" = "arm64" ] || [ "$arch" = "aarch64" ]; then \
      pip3 install --no-cache-dir --break-system-packages --retries 5 --default-timeout=300 paddleocr==3.4.0 paddlepaddle==3.2.2; \
    else \
      echo "Skipping PaddleOCR install on unsupported arch: $arch"; \
    fi \
  && rm -rf /var/lib/apt/lists/*

FROM deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force

COPY public ./public
COPY src ./src

RUN mkdir -p /app/uploads /app/uploads/proxies /app/uploads/thumbnails /app/uploads/subtitles /app/uploads/ocr

EXPOSE 3000

CMD ["npm", "start"]
