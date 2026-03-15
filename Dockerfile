FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    SHARP_IGNORE_GLOBAL_LIBVIPS=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    OPENCLAW_INSTALL_PREFIX=/opt/openclaw \
    PATH=/opt/openclaw/bin:$PATH \
    NODE_COMPILE_CACHE=/tmp/openclaw-compile-cache \
    OPENCLAW_STATE_DIR=/data/openclaw \
    OPENCLAW_WORKSPACE=/data/workspace \
    OPENCLAW_CONFIG_PATH=/app/config/render.openclaw.json5 \
    OPENCLAW_GATEWAY_PORT=8080 \
    OPENCLAW_TELEGRAM_WEBHOOK_PORT=8787

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends git nginx gettext-base ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g --prefix "${OPENCLAW_INSTALL_PREFIX}" --loglevel warn --no-fund --no-audit openclaw@latest \
    || npm install -g --prefix "${OPENCLAW_INSTALL_PREFIX}" --loglevel warn --no-fund --no-audit openclaw@next

RUN openclaw --version >/dev/null \
    && mkdir -p /data/openclaw /data/workspace /tmp/openclaw-compile-cache /run/nginx \
    && rm -rf /var/lib/apt/lists/*

COPY config/render.openclaw.json5 /app/config/render.openclaw.json5
COPY scripts/render/start-render-openclaw.sh /app/scripts/render/start-render-openclaw.sh
COPY scripts/render/nginx.conf.template /app/scripts/render/nginx.conf.template

RUN chmod +x /app/scripts/render/start-render-openclaw.sh

EXPOSE 10000

CMD ["/app/scripts/render/start-render-openclaw.sh"]
