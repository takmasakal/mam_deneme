FROM node:22-bookworm-slim

ARG TARGETARCH

ENV NODE_ENV=production \
  PIP_DISABLE_PIP_VERSION_CHECK=1 \
  PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg unzip poppler-utils antiword tesseract-ocr tesseract-ocr-tur python3 python3-pip \
  && pip3 install --no-cache-dir --break-system-packages requests faster-whisper==1.1.1 \
  && if [ "$TARGETARCH" = "amd64" ]; then \
      pip3 install --no-cache-dir --break-system-packages paddleocr==3.4.0 paddlepaddle==3.2.2; \
    else \
      echo "Skipping PaddleOCR install on unsupported arch: $TARGETARCH"; \
    fi \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force

COPY public ./public
COPY src ./src

RUN mkdir -p /app/uploads /app/uploads/proxies /app/uploads/thumbnails /app/uploads/subtitles /app/uploads/ocr

EXPOSE 3000

CMD ["npm", "start"]
