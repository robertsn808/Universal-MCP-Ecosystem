# syntax=docker/dockerfile:1
FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json tsconfig.base.json ./
COPY packages/db/package.json packages/db/package.json
COPY packages/upp-client/package.json packages/upp-client/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY services/api-backend/package.json services/api-backend/package.json
RUN npm install

FROM node:20-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN npm --workspace services/api-backend run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/services/api-backend/dist ./dist
COPY services/api-backend/package.json ./package.json
RUN npm install --omit=dev
EXPOSE 8080
CMD ["node", "dist/index.js"]
