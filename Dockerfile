FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "app.js"]
