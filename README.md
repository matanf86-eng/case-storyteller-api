# AI Case Study Storyteller for Framer

Turn any Framer case study into an AI-narrated story.

Visitors choose a character, press Play, and hear the case study retold in a completely different voice and personality.

### Characters

🔎 **Detective** — Finds the clues.  
🤖 **Robot** — Analyses the data.  
👵 **Grandma** — Keeps it simple.  
🎙️ **Narrator** — Makes it cinematic.  
😏 **Cynic** — Tells it like it is.

## Features

- Automatically reads the current Framer case study
- Generates a custom narration using OpenAI
- Five different storytelling personalities
- Five distinct AI voices
- Audio caching with Vercel Blob
- Floating mini-player while scrolling
- Light and Dark mode
- Responsive for Desktop, Tablet and Mobile
- No OpenAI API key exposed in Framer

---

# Setup

You need:

- A Framer project
- A Vercel account
- An OpenAI API key

## 1. Deploy the backend

Fork or clone this repository and deploy it to Vercel.

You will need to add these Environment Variables:

```env
OPENAI_API_KEY=your_openai_api_key
ALLOWED_ORIGINS=https://yourwebsite.com
