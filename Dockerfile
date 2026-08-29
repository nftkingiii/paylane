FROM node:24.13.0-alpine3.23 AS verifier
WORKDIR /app
COPY package.json package-lock.json tsconfig.bot.json ./
RUN npm ci --ignore-scripts
COPY bot ./bot
COPY src/lib ./src/lib
RUN npm run bot:check

FROM node:24.13.0-alpine3.23 AS worker
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache su-exec
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY bot ./bot
COPY src/lib ./src/lib
CMD ["sh", "-c", "mkdir -p /data && chown node:node /data && exec su-exec node node --disable-warning=ExperimentalWarning --experimental-strip-types bot/index.ts"]
