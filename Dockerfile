FROM node:22-alpine

RUN apk add --no-cache ffmpeg python3 py3-pip && \
    pip install --no-cache-dir --break-system-packages -U yt-dlp

# The standalone yt-dlp Linux binaries are glibc builds and cannot run on
# Alpine (musl). Point the CLI at the pip-installed, pure-Python yt-dlp.
ENV YTDLP_PATH=/usr/bin/yt-dlp

WORKDIR /app

COPY scripts/gittube-cli.mjs /usr/local/bin/gittube
RUN chmod +x /usr/local/bin/gittube

ENTRYPOINT ["gittube"]
