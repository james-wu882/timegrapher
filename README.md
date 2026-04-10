# Timegrapher.ai — Watch Timegrapher

Browser-based mechanical watch timegrapher. Measures rate (s/d), beat error (ms),
amplitude (°), and BPH via microphone. Includes AI-powered diagnosis.

Live at **timegrapher.ai**

---

## Repository structure

```
retomb/
├── index.html          ← complete app (UI + audio processing + AI chat)
├── worklet.js          ← AudioWorklet processor (must be a separate file)
├── manifest.json       ← PWA web app manifest
├── _headers            ← Cloudflare Pages security + cache headers
├── robots.txt
├── sitemap.xml
├── llms.txt            ← AI crawler context file
├── og-image.html       ← Open Graph social card template (screenshot to get og-image.png)
│
├── worker.js           ← AI backend: Anthropic API (paid, best quality)
├── worker-gemini.js    ← AI backend: Google Gemini Flash (free tier, 1,500 req/day)
├── worker-cfai.js      ← AI backend: Cloudflare Workers AI (free, ~15 req/day)
│
├── wrangler.toml       ← Cloudflare Worker config (Anthropic / Gemini)
└── wrangler-cfai.toml  ← Cloudflare Worker config (CF Workers AI — adds AI binding)
```

---

## Deploy the site (Cloudflare Pages)

The site files (`index.html`, `worklet.js`, `manifest.json`, `_headers`,
`robots.txt`, `sitemap.xml`, `llms.txt`) deploy as a static site.

```bash
# Push this repo to GitHub, then:
# Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git
# Select your repo, leave all build settings blank, deploy.
```

Or drag-and-drop the folder at **pages.cloudflare.com** for an instant deploy.

After deploying:
1. Add your custom domain under the Pages project → Custom domains
2. Enable **Bot Fight Mode** under Security → Bots (free, takes 10 seconds)
3. Submit `https://timegrapher.ai/sitemap.xml` to Google Search Console

---

## Deploy the AI backend (Cloudflare Worker)

The AI feature requires a separate Worker that acts as a secure proxy.
Your API key is stored as an encrypted Cloudflare secret — it never touches
the browser or this codebase.

### Option A — Google Gemini Flash (recommended free option)

**1,500 requests/day free. No credit card. Just a Google account.**

```bash
# Get a free API key at aistudio.google.com → Get API Key

npm i -g wrangler
wrangler login

# Use the Gemini worker
cp worker-gemini.js worker.js

# Store the key (paste when prompted — never put it in a file)
wrangler secret put GEMINI_API_KEY

wrangler deploy
```

### Option B — Anthropic API (paid, best quality)

```bash
# Get an API key at console.anthropic.com

npm i -g wrangler
wrangler login

# worker.js is already the Anthropic version
wrangler secret put ANTHROPIC_API_KEY

wrangler deploy
```

Cost: approximately $0.003 per diagnosis request.

### Option C — Cloudflare Workers AI (zero cost, no API key)

**~15 free requests/day. No new accounts — uses your existing Cloudflare account.**
Good for personal use only; too limited for a public site.

```bash
cp worker-cfai.js worker.js
cp wrangler-cfai.toml wrangler.toml

wrangler login
wrangler deploy
```

No secrets needed — the AI binding uses your Cloudflare account automatically.

---

### After deploying the Worker

Copy the Worker URL (e.g. `https://retomb-ai.yourname.workers.dev`) and set it
in `index.html`:

```javascript
// Near the bottom of the <script> block:
const AI_ENDPOINT = 'https://retomb-ai.yourname.workers.dev';
```

Redeploy the Pages site after making this change.

---

## Generate the OG social card image

The meta tags reference `og-image.png` which you need to create:

```bash
# Option 1: manual
# Open og-image.html in Chrome, resize browser to exactly 1200×630,
# DevTools → three-dot menu → Capture screenshot → Save as og-image.png

# Option 2: headless (requires Node.js)
npx puppeteer-screenshot og-image.html --width 1200 --height 630 --output og-image.png
```

Upload `og-image.png` to the root of your Pages deployment.

---

## Run locally for testing

```bash
python3 -m http.server 8080
# Open http://localhost:8080 in Chrome or Firefox
```

Do not open `index.html` as a `file://` URL — microphone access and
AudioWorklet both require a proper HTTP server (or HTTPS).

For the AI feature locally, either temporarily set `AI_ENDPOINT` to your
deployed worker URL, or run `wrangler dev` in the worker directory and
point to `http://localhost:8787`.

---

## Browser support

| Browser        | Supported              |
|----------------|------------------------|
| Chrome 80+     | ✅ Best results        |
| Firefox 76+    | ✅                     |
| Safari 14.5+   | ✅                     |
| Edge 80+       | ✅                     |
| Mobile Chrome  | ⚠ Works, mic varies   |
| Mobile Safari  | ⚠ Works, mic varies   |

---

## Tips for best accuracy

- Quiet room — even an air conditioner can corrupt readings
- Watch face-down, placed directly on or beside the microphone
- A dedicated **clip-on contact microphone** (~$15 on AliExpress, search
  "timegrapher microphone") dramatically improves signal quality over
  a built-in laptop mic
- Set **BPH** to match your movement before measuring — check the calibre
  datasheet or use the auto-detect result
- Lift angle defaults to 52° — adjust for your movement if you need
  accurate amplitude readings (common values: 49–53°)
- Signal bars (top right) should reach 3–4 for reliable readings

---

## How the algorithm works

1. **Audio capture** — Web Audio API at 44,100 Hz with echo cancellation,
   noise suppression, and auto gain all disabled
2. **Filtering** — two cascaded high-pass filters (~400 Hz) remove low-frequency
   hum while preserving sharp tick transients
3. **Envelope detection** — peak-follower with 0.2 ms attack and 6 ms decay
4. **Beat detection** — local maxima above a dynamic threshold, minimum distance
   65% of the expected half-period
5. **Rate** — deviation of the median inter-beat interval from the expected value,
   expressed as seconds per day
6. **Beat error** — median of alternating interval differences ÷ 2, in milliseconds
7. **Amplitude** — estimated from pulse width via the lift angle formula:
   `amplitude = LA / (2 × sin(pulseWidth / period × π))`
8. **Waveform display** — exponential moving average over 20 beat windows

Amplitude is indicative rather than laboratory-grade — it depends on microphone
placement and room acoustics.

---

## Security notes

- All audio processing happens locally in the browser; no audio is transmitted
- AI diagnosis requests are proxied through your Cloudflare Worker; the API key
  is never exposed to the browser
- The Worker enforces: origin allowlist, rate limiting (6 req/min, 30 req/hr per IP),
  20 KB request size limit, 1,000 chars per message, role alternation validation,
  and HTML tag stripping on all content
- AI output is sanitised with DOMPurify before being injected into the DOM
- Security headers (CSP, X-Frame-Options, etc.) are set via `_headers`

---

## License

MIT. Algorithm based on concepts from tg-timer by Marcello Mamino (GPL-2.0).
UI, JS implementation, and AI integration are original.
