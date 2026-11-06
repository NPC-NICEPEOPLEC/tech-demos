const LINES = [
  `66.249.66.1 - - [02/Nov/2026:03:14:10 +0000] "GET /robots.txt HTTP/1.1" 200 312 "-" "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"`,
  `20.15.1.8 - - [02/Nov/2026:03:14:22 +0000] "GET / HTTP/1.1" 200 4821 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)"`,
  `20.15.1.8 - - [02/Nov/2026:03:14:40 +0000] "GET /blog/what-is-geo HTTP/1.1" 200 9102 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)"`,
  `20.15.1.8 - - [02/Nov/2026:03:14:55 +0000] "GET /blog/what-is-geo?utm=demo HTTP/1.1" 200 9102 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)"`,
  `20.15.1.11 - - [02/Nov/2026:03:15:01 +0000] "GET / HTTP/1.1" 200 4821 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)"`,
  `20.15.1.11 - - [02/Nov/2026:03:15:18 +0000] "GET /blog/what-is-geo HTTP/1.1" 200 9102 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)"`,
  `20.15.1.12 - - [02/Nov/2026:03:16:02 +0000] "GET /docs/getting-started HTTP/1.1" 200 6400 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)"`,
  `20.15.1.12 - - [02/Nov/2026:03:16:40 +0000] "GET /blog/what-is-geo HTTP/1.1" 200 9102 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)"`,
  `17.22.4.4 - - [02/Nov/2026:03:17:05 +0000] "GET / HTTP/1.1" 200 4821 "-" "Mozilla/5.0 (compatible; Google-Extended; +http://www.google.com/bot.html)"`,
  `17.22.4.5 - - [02/Nov/2026:03:17:33 +0000] "GET /about HTTP/1.1" 200 2201 "-" "Mozilla/5.0 (compatible; Bytespider; https://zhanzhang.toutiao.com/)"`,
  `17.22.4.5 - - [02/Nov/2026:03:18:11 +0000] "GET /blog/what-is-geo HTTP/1.1" 200 9102 "-" "Mozilla/5.0 (compatible; Bytespider; https://zhanzhang.toutiao.com/)"`,
  `20.15.1.20 - - [02/Nov/2026:03:18:30 +0000] "GET /blog/what-is-geo HTTP/1.1" 200 9102 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)"`,
  `20.15.1.21 - - [02/Nov/2026:03:18:44 +0000] "GET /docs/getting-started HTTP/1.1" 200 6400 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot"`,
  `9.9.9.9 - - [02/Nov/2026:03:19:00 +0000] "GET / HTTP/1.1" 200 4821 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"`,
  `9.9.9.10 - - [02/Nov/2026:03:19:20 +0000] "GET /pricing HTTP/1.1" 200 3300 "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"`,
  `20.15.1.30 - - [02/Nov/2026:03:19:48 +0000] "GET /changelog HTTP/1.1" 200 1800 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +claude-searchbot@anthropic.com)"`,
  `44.44.44.1 - - [02/Nov/2026:03:20:02 +0000] "GET /feed.xml HTTP/1.1" 200 4096 "-" "CCBot/2.0 (+https://commoncrawl.org/faq/)"`,
  `this is not a log line`,
]

export const SAMPLE_LOG = LINES.join("\n")
