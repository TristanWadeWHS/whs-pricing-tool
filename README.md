# Wade Home Services Pricing Tool MVP

Internal web app for AI-assisted junk removal pricing.

## Local setup

1. Install Node.js.
2. Open this folder in VS Code or terminal.
3. Run:

```bash
npm install
```

4. Create `.env.local` from `.env.example`:

```bash
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-5.5-mini
```

5. Run:

```bash
npm run dev
```

6. Open:

```bash
http://localhost:3000
```

## Deploy to Vercel

1. Push this folder to GitHub.
2. Import the repo into Vercel.
3. Add environment variable `OPENAI_API_KEY` in Vercel.
4. Deploy.

## Pricing rules included

- $130 minimum within 25 miles
- $145 minimum for 25–40 miles
- $175 minimum for 40–65 miles
- $450 full-load baseline
- Heavy/demo debris risk adjustments
- Difficulty/access/stairs/carry adjustments
- Cardboard-only discount

## Important

This is an estimate tool. Final quote should be reviewed by a manager when photos are unclear, heavy debris is possible, or hidden materials may exist.
