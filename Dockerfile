FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN bun run build

FROM oven/bun:1
RUN echo "cinder:x:10001:10001::/app:/bin/sh" >> /etc/passwd && \
    echo "cinder:x:10001:" >> /etc/group
WORKDIR /app
COPY --from=build --chown=cinder /app/dist ./dist
COPY --from=build --chown=cinder /app/server.ts .
COPY --from=build --chown=cinder /app/package.json .
USER cinder
EXPOSE 3000
CMD ["bun", "server.ts"]
