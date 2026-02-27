FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg unzip poppler-utils antiword tesseract-ocr tesseract-ocr-tur python3 python3-pip \
  && pip3 install --no-cache-dir --break-system-packages faster-whisper==1.1.1 requests \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /app/uploads /app/uploads/proxies

EXPOSE 3000

CMD ["npm", "start"]
