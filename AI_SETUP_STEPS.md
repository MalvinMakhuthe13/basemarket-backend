# BaseMarket AI setup

1. Go to OpenRouter and create a fresh API key.
2. In Render, open your backend service.
3. Add environment variables:
   - OPENROUTER_API_KEY
   - OPENROUTER_MODEL (recommended: openai/gpt-4o-mini)
   - OPENROUTER_HTTP_REFERER (your frontend URL)
   - OPENROUTER_APP_NAME=BaseMarket
4. Redeploy the service.
5. Test these endpoints:
   - GET /api/ai/health
   - POST /api/ai/assist
   - POST /api/ai/scam-check

Security note: do not commit live API keys to GitHub. Keep them only in Render environment variables.
