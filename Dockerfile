FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN chown -R node:node /app
ENV NODE_ENV=production PORT=3000 COOKIE_SECURE=1 TRUST_PROXY=1
USER node
EXPOSE 3000
CMD ["node", "server.js"]
