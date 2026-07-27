ARG MAM_RUNTIME_IMAGE=mam_deneme-runtime:latest
FROM ${MAM_RUNTIME_IMAGE}

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force

COPY public ./public
COPY src ./src

RUN mkdir -p /app/uploads /app/uploads/proxies /app/uploads/thumbnails /app/uploads/subtitles /app/uploads/ocr

EXPOSE 3000

CMD ["npm", "start"]
