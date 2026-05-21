#!/bin/bash
set -e

# Unset any proxy environment variables that may be injected
unset http_proxy
unset https_proxy
unset HTTP_PROXY
unset HTTPS_PROXY
unset npm_config_proxy
unset npm_config_https_proxy

# Force npm to use the official registry and no proxy
npm install \
  --registry https://registry.npmjs.org/ \
  --no-proxy \
  --legacy-peer-deps \
  --prefer-dedupe
