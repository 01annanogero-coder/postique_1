FROM node:24-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/packages ./packages
COPY --from=build /app/adapter ./adapter

RUN mkdir -p /data && chown -R node:node /app /data
USER node

EXPOSE 3000 2525
VOLUME ["/data"]

CMD ["node", "server/index.js"]
