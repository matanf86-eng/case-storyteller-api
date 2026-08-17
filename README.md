# AI Case Study Storyteller for Framer
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmatanf86-eng%2Fcase-storyteller-api&project-name=case-storyteller-api&repository-name=case-storyteller-api&env=%7B%22OPENAI_API_KEY%22%3A%22%22%2C%22ALLOWED_ORIGINS%22%3A%22%22%7D&stores=%5B%7B%22type%22%3A%22blob%22%2C%22access%22%3A%22public%22%7D%5D)
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

# AI Case Study Storyteller for Framer
ALLOWED_ORIGINS=https://site-one.com,https://site-two.com

2. Connect Vercel Blob

Create a public Vercel Blob store and connect it to the project.

The Storyteller uses Blob storage to cache generated audio so the same story does not need to be generated again every time.

3. Deploy

After configuring the Environment Variables and Blob store, deploy the project.

Your backend URL will look something like:
https://your-storyteller.vercel.app

4. Add the Framer component

The public Framer component is included here:
/framer/CaseStorytellerPublic.tsx
Add the component to your Framer project.

5. Add your Backend URL

Select the Storyteller component in Framer.

In the properties panel, paste your Vercel URL into:
Backend URL
https://your-storyteller.vercel.app
You do not need to add /api/narrate.

6. Publish

Publish your Framer site.

The component will automatically read the content of the current page and generate the narration when a visitor presses Play.

How it works
Framer Case Study
       ↓
CaseStoryteller
       ↓
Vercel API
       ↓
OpenAI
       ↓
Narration + Voice
       ↓
Vercel Blob Cache
       ↓
Audio Player

The OpenAI API key stays on the server and is never exposed inside the Framer component.

Customization

Inside Framer you can change:

Default character
Prompt
Light / Dark / Auto theme
AI-generated voice label
Backend URL

The narrator personalities and voice behavior can be customized inside:

/api/narrate.js
Tech

Built with:

Framer
OpenAI
Vercel Functions
Vercel Blob
React / TypeScript
License

MIT

Built by Matan Feder.



אחרי זה:


**Commit changes…**


Commit message:


```text
Add public setup guide
