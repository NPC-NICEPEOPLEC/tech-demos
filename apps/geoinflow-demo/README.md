# GEOInflow demo

Paste or upload a combined or nginx access log and see which AI crawlers hit which paths, plus key pages with zero crawls. Classification runs locally in the browser from the User-Agent string. Google-Extended and Applebot-Extended are directive tokens and add no hit.

This is a one-screen slice of that workflow. It does not run the GEOInflow Docker stack.

## Run

```bash
cd apps/geoinflow-demo
bun install
bun run dev
```

Open the printed URL and choose **Load sample log**.

## Test

```bash
bun test
```

UI is shadcn/ui with the lyra preset (sharp, minimal).
