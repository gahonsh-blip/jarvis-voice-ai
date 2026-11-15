# HERMES JARVIS + super-agent. One container, any VPS, no paid services.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# git and curl are needed by the agent's git and fetch tools
RUN apt-get update && apt-get install -y --no-install-recommends git curl ca-certificates && apt-get clean
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/agent-skills ./agent-skills
COPY --from=build /app/index.html ./index.html
# The agent works inside /workspace; mount a host folder there to give it real files.
RUN mkdir -p /workspace
ENV AGENT_WORKSPACE_ROOT=/workspace
VOLUME ["/workspace"]
EXPOSE 3000
CMD ["node", "dist/server.cjs"]
