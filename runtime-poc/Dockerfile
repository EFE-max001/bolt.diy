FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV CI=true

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
  && corepack prepare pnpm@9.15.9 --activate

RUN mkdir -p /workspace
WORKDIR /workspace

# The Durable Object starts project processes with exec().
# Keep the workspace container alive until it is explicitly stopped.
CMD ["sleep", "infinity"]
