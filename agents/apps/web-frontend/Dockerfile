# syntax=docker/dockerfile:1
FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json tsconfig.base.json ./
COPY apps/web-frontend/package.json apps/web-frontend/package.json
RUN npm install

FROM node:20-alpine AS builder
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN npm --workspace apps/web-frontend run build || echo "Skipping build in scaffold"

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/apps/web-frontend/.next ./.next
COPY apps/web-frontend/package.json ./package.json
COPY apps/web-frontend/next.config.js ./next.config.js
COPY apps/web-frontend/pages ./pages
EXPOSE 3000
CMD ["npm", "start"]
