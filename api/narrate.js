import { createHash } from "node:crypto"
import { list, put } from "@vercel/blob"

// v2 forces new audio generation.
// The previous cached voices will not be reused.
const CACHE_VERSION = "v2-distinct-voices"

const MAX_CASE_CHARS = 50000

const characterInstructions = {
    detective: `
Tell the case study like an investigation.

Structure the story around:
1. Something is wrong.
2. We look for clues.
3. We discover the real cause.
4. We solve it.

Create suspense without becoming theatrical.
Use short observations and occasional pauses.
The listener should feel like they are uncovering the answer with you.
`,

    robot: `
Tell the case study like an analytical machine reviewing evidence.

Be extremely structured and factual.
Focus on patterns, cause and effect, data, logic and decisions.

Use short, efficient sentences.
Avoid emotional language.
Occasionally make a very subtle deadpan observation.

The result should feel noticeably different from normal human storytelling.
`,

    grandma: `
Tell the case study like a wise, warm grandmother explaining it to someone she likes.

Make everything easy to understand.
Remove product-design jargon.
Use natural conversational phrases.
Explain why things mattered to real people.

Be warm, slightly playful and reassuring.
It should feel like a real conversation, not a presentation.
`,

    narrator: `
Turn the case study into a cinematic story.

Create a strong setup, tension, turning point and resolution.
Use dramatic pacing and evocative language,
while remaining completely faithful to the facts.

Make important moments feel important.
Use sentences that sound good when spoken aloud.
`,

    cynic: `
Tell the case study like a smart, slightly cynical friend who hates buzzwords.

Get to the point quickly.
Call out what clearly was not working.
Use dry humor and understated punchlines.

Keep the facts accurate.
Never become insulting or childish.
The humor should come from stating the obvious truth everyone else avoided.
`,
}

const voiceConfigs = {
    detective: {
        voice: "onyx",
        speed: 0.9,
        instructions: `
You are a noir-style detective telling someone what you discovered.

Speak noticeably slower than normal.
Use a low, controlled, thoughtful delivery.
Add meaningful pauses after important observations.
Keep your emotional range restrained.
Create quiet suspense rather than dramatic excitement.

Sound observant, intelligent and slightly mysterious.
Never sound like an advertisement or a podcast host.
`,
    },

    robot: {
        voice: "echo",
        speed: 1.12,
        instructions: `
Speak like a highly intelligent analytical system.

Use a noticeably even, restrained and nearly monotone delivery.
Keep pitch variation minimal.
Speak slightly faster than normal.
Use crisp, clipped phrasing and short pauses.

Do not sound warm or theatrical.
Do not add enthusiasm.
Subtle deadpan humor is welcome,
but deliver it exactly like every other fact.
`,
    },

    grandma: {
        voice: "marin",
        speed: 0.91,
        instructions: `
Speak like a warm, clever older woman having a relaxed conversation.

Speak gently and slightly slower than normal.
There should be a smile in the voice.
Use soft, natural intonation and comfortable pauses.
Sound affectionate, wise and human.

Do not sound like a narrator.
Do not sound corporate.
Imagine explaining something interesting over coffee at the kitchen table.
`,
    },

    narrator: {
        voice: "ballad",
        speed: 0.87,
        instructions: `
Perform this like the narrator of a beautifully produced documentary trailer.

Speak slowly and cinematically.
Use a large expressive range in pitch and intensity.
Build anticipation.
Use longer dramatic pauses before turning points.
Emphasize important words.

Sound elegant and confident.
Be significantly more theatrical than the other voices,
but never parody a movie trailer.
`,
    },

    cynic: {
        voice: "ash",
        speed: 1.08,
        instructions: `
Speak like a sharp, confident friend who is mildly unimpressed by everything.

Use a casual, dry delivery.
Speak slightly faster than normal.
Keep emotional enthusiasm low.
Use small pauses immediately before dry punchlines.
Occasionally sound as if you are raising one eyebrow.

Never sound angry.
Never perform the joke too much.
The humor works because you sound like you barely care that it is funny.
`,
    },
}

function getOutputText(data) {
    if (typeof data.output_text === "string") {
        return data.output_text
    }

    for (const item of data.output || []) {
        for (const content of item.content || []) {
            if (
                content.type === "output_text" &&
                typeof content.text === "string"
            ) {
                return content.text
            }
        }
    }

    return ""
}

function normalizeOrigin(origin) {
    return origin.trim().replace(/\/+$/, "")
}

function getAllowedOrigins() {
    return (process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .map(normalizeOrigin)
        .filter(Boolean)
}

function isAllowedOrigin(origin) {
    if (!origin) return false

    return getAllowedOrigins().includes(
        normalizeOrigin(origin)
    )
}

function corsHeaders(origin) {
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
    }
}

function jsonResponse(data, status, origin) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...(origin ? corsHeaders(origin) : {}),
        },
    })
}

function createCacheKey(caseContent, character) {
    return createHash("sha256")
        .update(
            `${CACHE_VERSION}|${character}|${caseContent}`
        )
        .digest("hex")
        .slice(0, 32)
}

async function findCachedAudio(pathname) {
    const result = await list({
        prefix: pathname,
        limit: 5,
    })

    return (
        result.blobs.find(
            blob => blob.pathname === pathname
        ) || null
    )
}

export default {
    async fetch(request) {
        const origin = request.headers.get("origin")

        // -----------------------------
        // ORIGIN PROTECTION
        // -----------------------------

        if (!isAllowedOrigin(origin)) {
            console.warn(
                "Blocked origin:",
                origin || "missing"
            )

            return jsonResponse(
                { error: "Origin not allowed" },
                403,
                null
            )
        }

        // -----------------------------
        // CORS
        // -----------------------------

        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: corsHeaders(origin),
            })
        }

        if (request.method !== "POST") {
            return jsonResponse(
                { error: "Use POST" },
                405,
                origin
            )
        }

        try {
            const body = await request.json()

            const {
                caseContent,
                character,
            } = body

            // -----------------------------
            // VALIDATION
            // -----------------------------

            if (
                typeof caseContent !== "string" ||
                typeof character !== "string"
            ) {
                return jsonResponse(
                    { error: "Invalid request" },
                    400,
                    origin
                )
            }

            if (
                !caseContent.trim() ||
                !character.trim()
            ) {
                return jsonResponse(
                    {
                        error:
                            "caseContent and character are required",
                    },
                    400,
                    origin
                )
            }

            if (
                caseContent.length >
                MAX_CASE_CHARS
            ) {
                return jsonResponse(
                    {
                        error:
                            "Case content is too large",
                    },
                    413,
                    origin
                )
            }

            const characterPrompt =
                characterInstructions[character]

            const voiceConfig =
                voiceConfigs[character]

            if (
                !characterPrompt ||
                !voiceConfig
            ) {
                return jsonResponse(
                    { error: "Unknown character" },
                    400,
                    origin
                )
            }

            // -----------------------------
            // CACHE
            // -----------------------------

            const cacheKey =
                createCacheKey(
                    caseContent,
                    character
                )

            const pathname =
                `storyteller/${character}/${cacheKey}.mp3`

            const cached =
                await findCachedAudio(pathname)

            if (cached) {
                return jsonResponse(
                    {
                        character,
                        audioDataUrl: cached.url,
                        cached: true,
                    },
                    200,
                    origin
                )
            }

            // -----------------------------
            // 1. GENERATE CHARACTER SCRIPT
            // -----------------------------

            const narrationResponse =
                await fetch(
                    "https://api.openai.com/v1/responses",
                    {
                        method: "POST",

                        headers: {
                            Authorization:
                                `Bearer ${process.env.OPENAI_API_KEY}`,

                            "Content-Type":
                                "application/json",
                        },

                        body: JSON.stringify({
                            model: "gpt-5.6",

                            instructions: `
You are creating spoken narration for a product design case study.

The same source case will be narrated by several fictional storytellers.
It is essential that this storyteller's writing style feels clearly different
from the others.

CHARACTER DIRECTION:

${characterPrompt}

FACTUAL RULES:
- Use only facts found in the supplied case study.
- Never invent metrics.
- Never invent research.
- Never invent outcomes.
- Never invent quotes.
- Preserve the meaning of the original project.

AUDIO WRITING RULES:
- Write for listening, not reading.
- Use natural spoken rhythm.
- Avoid headings and bullet points.
- Do not introduce yourself.
- Start directly with the story.
- Keep it approximately 120–170 words.
- Write in the same language as the source case.
`,

                            input:
                                caseContent,
                        }),
                    }
                )

            const narrationData =
                await narrationResponse.json()

            if (!narrationResponse.ok) {
                console.error(
                    narrationData
                )

                return jsonResponse(
                    {
                        error:
                            "OpenAI narration request failed",
                    },
                    500,
                    origin
                )
            }

            const narration =
                getOutputText(
                    narrationData
                )

            if (!narration) {
                throw new Error(
                    "No narration generated"
                )
            }

            // -----------------------------
            // 2. GENERATE DISTINCT VOICE
            // -----------------------------

            const speechResponse =
                await fetch(
                    "https://api.openai.com/v1/audio/speech",
                    {
                        method: "POST",

                        headers: {
                            Authorization:
                                `Bearer ${process.env.OPENAI_API_KEY}`,

                            "Content-Type":
                                "application/json",
                        },

                        body: JSON.stringify({
                            model:
                                "gpt-4o-mini-tts",

                            voice:
                                voiceConfig.voice,

                            input:
                                narration,

                            instructions:
                                voiceConfig.instructions,

                            speed:
                                voiceConfig.speed,

                            response_format:
                                "mp3",
                        }),
                    }
                )

            if (!speechResponse.ok) {
                const speechError =
                    await speechResponse.text()

                console.error(
                    speechError
                )

                return jsonResponse(
                    {
                        error:
                            "Speech generation failed",
                    },
                    500,
                    origin
                )
            }

            const audioBuffer =
                await speechResponse.arrayBuffer()

            // -----------------------------
            // 3. CACHE AUDIO
            // -----------------------------

            const blob =
                await put(
                    pathname,

                    Buffer.from(
                        audioBuffer
                    ),

                    {
                        access: "public",

                        contentType:
                            "audio/mpeg",

                        addRandomSuffix:
                            false,

                        allowOverwrite:
                            true,

                        cacheControlMaxAge:
                            31536000,
                    }
                )

            return jsonResponse(
                {
                    narration,
                    character,
                    audioDataUrl:
                        blob.url,
                    cached: false,
                },
                200,
                origin
            )
        } catch (error) {
            console.error(error)

            return jsonResponse(
                { error: "Server error" },
                500,
                origin
            )
        }
    },
}
