# DeepTutor demo

Paste study notes, or load the sample passage, and get a short quiz whose questions and explanations come from that text. Answer them and the score is remembered in this browser as a small three-layer sketch: session, topic, and long-term summary.

This is a one-screen taste of [DeepTutor](https://github.com/HKUDS/DeepTutor) (HKUDS). It does not run that project.

## Run

```bash
cd apps/deeptutor-demo
bun install
bun run dev
```

Open the printed URL and choose **Load sample notes**, then **Generate quiz**.

Generation is local and deterministic. No API key is required.

## Optional model

If `VITE_LLM_API_KEY` is set in the environment before `bun run dev`, a **Use model** checkbox appears and calls the OpenAI chat completions API. If the request fails, the quiz falls back to the local generator. The demo path does not use it.

## Test

```bash
bun test
```

UI is shadcn/ui with the lyra preset (sharp, minimal).
