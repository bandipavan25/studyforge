FROM node:24-slim
WORKDIR /app

# Install dependencies
COPY client/package*.json client/
RUN cd client && npm install
COPY server/package*.json server/
RUN cd server && npm install --omit=dev

# Copy source and build the React client
COPY . .
RUN cd client && npm run build

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000
CMD ["node", "server/src/index.js"]
