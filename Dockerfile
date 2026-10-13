# Packs Nion into a container so any host can run it (Nebius Serverless Endpoints,
# or another). Keys are NOT in the image: the host gives them to Nion as settings
# (NEBIUS_API_KEY, TAVILY_API_KEY, and optionally NION_MODEL).
#
# Build:  docker build -t nion .
# Run:    docker run -p 3000:3000 -e NEBIUS_API_KEY=... -e TAVILY_API_KEY=... nion

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Packages first, so rebuilds are quick when only the code changed.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# The server, the rules it shares with the browser, and the page itself.
COPY server ./server
COPY shared ./shared
COPY public ./public

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

# Not `npm start`: that reads a .env file, which the image never contains.
CMD ["node", "server/index.js"]
