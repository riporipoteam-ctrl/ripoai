# AskAI Cloud Computer image — built on Cloudflare's Sandbox base, with the
# common toolchain agents need (node, python, git, build tools) pre-installed.
FROM docker.io/cloudflare/sandbox:0.1.3

# Pre-install a useful toolchain so agents can build/run/host right away.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates build-essential python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# The base image already exposes the control port the Sandbox SDK speaks to.
EXPOSE 3000
