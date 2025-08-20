# syntax=docker/dockerfile:1
FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json tsconfig.base.json ./
COPY packages/db/package.json packages/db/package.json
COPY packages/intent-router/package.json packages/intent-router/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY services/worker/package.json services/worker/package.json
RUN npm install

FROM node:20-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN npm --workspace services/worker run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/services/worker/dist ./dist
COPY services/worker/package.json ./package.json
RUN npm install --omit=dev
CMD ["node", "dist/index.js"]
