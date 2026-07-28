FROM oven/bun:1 AS deps

WORKDIR /app

COPY package.json bun.lockb* bunfig.toml tsconfig.json ./
RUN bun install --production

FROM oven/bun:1-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends libvips42 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY bunfig.toml tsconfig.json ./
COPY src ./src
COPY public ./public
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN sed -i 's/\r$//' /app/docker-entrypoint.sh \
  && chmod +x /app/docker-entrypoint.sh \
  && chown -R bun:bun /app

EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["bun", "run", "src/index.ts"]
