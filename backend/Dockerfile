FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node . .
RUN mkdir -p /app/uploads && chown -R node:node /app

ENV NODE_ENV=production
USER node

EXPOSE 5000
CMD ["npm", "start"]