ARG MAM_RUNTIME_IMAGE=mam_deneme-runtime:latest
FROM ${MAM_RUNTIME_IMAGE}

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force

COPY public ./public
COPY src ./src

RUN mkdir -p /app/uploads /app/uploads/proxies /app/uploads/thumbnails /app/uploads/subtitles /app/uploads/ocr

ARG MAM_GIT_COMMIT=unknown
ARG MAM_GIT_BRANCH=unknown
ARG MAM_BUILD_DATE=unknown

ENV MAM_GIT_COMMIT=${MAM_GIT_COMMIT} \
  MAM_GIT_BRANCH=${MAM_GIT_BRANCH} \
  MAM_BUILD_DATE=${MAM_BUILD_DATE}

LABEL org.opencontainers.image.revision="${MAM_GIT_COMMIT}" \
  org.opencontainers.image.created="${MAM_BUILD_DATE}" \
  org.opencontainers.image.source_branch="${MAM_GIT_BRANCH}"

EXPOSE 3000

CMD ["npm", "start"]
