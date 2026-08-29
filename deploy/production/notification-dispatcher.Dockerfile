FROM node:22-alpine

WORKDIR /app
COPY notification-dispatcher.mjs ./notification-dispatcher.mjs

USER node
CMD ["node", "/app/notification-dispatcher.mjs"]
