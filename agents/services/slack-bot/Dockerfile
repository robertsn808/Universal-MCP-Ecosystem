# syntax=docker/dockerfile:1
FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json tsconfig.base.json ./
COPY services/slack-bot/package.json services/slack-bot/package.json
RUN npm install

FROM node:20-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN npm --workspace services/slack-bot run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/services/slack-bot/dist ./dist
COPY services/slack-bot/package.json ./package.json
RUN npm install --omit=dev
EXPOSE 3001
CMD ["node", "dist/index.js"]
