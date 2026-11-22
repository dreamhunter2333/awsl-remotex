FROM mcr.microsoft.com/playwright:v1.64.1-noble

WORKDIR /suite
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY playwright.config.ts workspace.spec.ts ./
ENTRYPOINT ["/suite/node_modules/.bin/playwright", "test"]
