import { createHash } from "node:crypto"
import { list, put } from "@vercel/blob"

const CACHE_VERSION = "v1"
const MAX_CASE_CHARS = 50000

const characterInstructions = {
    detective: `
Tell the case study like a smart investigation.
Build curiosity around the problem, clues, discoveries and solution.
Sound sharp and engaging, but not cheesy or overly dramatic.
`,

    robot: `
Tell the case study analytically and precisely.
Focus on patterns, logic, evidence and the reasoning behind decisions.
Add a subtle dry sense of humor.
`,

    grandma: `
Tell the case study simply, warmly and clearly.
Avoid product-design jargon.
Explain complex ideas naturally and conversationally.
`,

    narrator: `
Tell the case study like a compelling movie narrator.
Give it a clear setup, tension, turning point and resolution.
Be cinematic but still believable.
`,

    cynic: `
Tell the case study directly, sharply and with dry humor.
Cut through buzzwords and explain what was actually wrong,
what changed and why it mattered.
Do not become rude.
`,
}

const voiceConfigs = {
    detective: {
        voice: "cedar",
        instructions:
            "Speak calmly and confidently, with a subtle sense of mystery. Observant, intelligent and controlled.",
    },

    robot: {
        voice: "echo",
        instructions:
            "Speak precisely and evenly. Slightly mechanical and analytical, with subtle dry humor.",
    },

    grandma: {
        voice: "marin",
        instructions:
            "Speak warmly, naturally and reassuringly. Sound wise, friendly and conversational.",
    },

    narrator: {
        voice: "onyx",
        instructions:
            "Speak like a cinematic narrator. Deep, confident and engaging, but never exaggerated.",
    },

    cynic: {
        voice: "ash",
        instructions:
            "Speak casually and confidently with dry humor. Slightly unimpressed, quick and sharp.",
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

    const allowedOrigins = getAllowedOrigins()

    return allowedOrigins.includes(
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
    return new Response(
        JSON.stringify(data),
        {
            status,
            headers: {
                "Content-Type": "application/json",
                ...(origin
                    ? corsHeaders(origin)
                    : {}),
            },
        }
    )
}

function createCacheKey(
    caseContent,
    character
) {
    return createHash("sha256")
        .update(
            `${CACHE_VERSION}|${character}|${caseContent}`
        )
        .digest("hex")
        .slice(0, 32)
}

async function findCachedAudio(
    pathname
) {
    const result = await list({
        prefix: pathname,
        limit: 5,
    })

    return (
        result.blobs.find(
            blob =>
                blob.pathname === pathname
        ) || null
    )
}

export default {
    async fetch(request) {
        const origin =
            request.headers.get("origin")

        // -----------------------------------
        // CHECK ORIGIN
        // -----------------------------------

        if (!isAllowedOrigin(origin)) {
            console.warn(
                "Blocked origin:",
                origin || "missing"
            )

            return jsonResponse(
                {
                    error:
                        "Origin not allowed",
                },
                403,
                null
            )
        }

        // -----------------------------------
        // CORS PREFLIGHT
        // -----------------------------------

        if (
            request.method ===
            "OPTIONS"
        ) {
            return new Response(null, {
                status: 204,
                headers:
                    corsHeaders(origin),
            })
        }

        // -----------------------------------
        // METHOD
        // -----------------------------------

        if (
            request.method !==
            "POST"
        ) {
            return jsonResponse(
                {
                    error: "Use POST",
                },
                405,
                origin
            )
        }

        try {
            const body =
                await request.json()

            const {
                caseContent,
                character,
            } = body

            // -----------------------------------
            // INPUT VALIDATION
            // -----------------------------------

            if (
                typeof caseContent !==
                    "string" ||
                typeof character !==
                    "string"
            ) {
                return jsonResponse(
                    {
                        error:
                            "Invalid request",
                    },
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
                characterInstructions[
                    character
                ]

            const voiceConfig =
                voiceConfigs[
                    character
                ]

            if (
                !characterPrompt ||
                !voiceConfig
            ) {
                return jsonResponse(
                    {
                        error:
                            "Unknown character",
                    },
                    400,
                    origin
                )
            }

            // -----------------------------------
            // CACHE
            // -----------------------------------

            const cacheKey =
                createCacheKey(
                    caseContent,
                    character
                )

            const pathname =
                `storyteller/${character}/${cacheKey}.mp3`

            const cached =
                await findCachedAudio(
                    pathname
                )

            if (cached) {
                return jsonResponse(
                    {
                        character,
                        audioDataUrl:
                            cached.url,
                        cached: true,
                    },
                    200,
                    origin
                )
            }

            // -----------------------------------
            // STEP 1 — CREATE NARRATION
            // -----------------------------------

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
You are writing spoken narration for a product design case study.

${characterPrompt}

Rules:
- Use only facts found in the supplied case study.
- Never invent metrics, research findings or outcomes.
- Write in the same language as the source case.
- Write for listening, not reading.
- Keep it around 120–170 words.
- Do not introduce yourself.
- Start directly with the story.
`,

                            input:
                                caseContent,
                        }),
                    }
                )

            const narrationData =
                await narrationResponse.json()

            if (
                !narrationResponse.ok
            ) {
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

            // -----------------------------------
            // STEP 2 — CREATE VOICE
            // -----------------------------------

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

                            response_format:
                                "mp3",
                        }),
                    }
                )

            if (
                !speechResponse.ok
            ) {
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

            // -----------------------------------
            // STEP 3 — SAVE TO VERCEL BLOB
            // -----------------------------------

            const blob =
                await put(
                    pathname,

                    Buffer.from(
                        audioBuffer
                    ),

                    {
                        access:
                            "public",

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

            // -----------------------------------
            // RETURN
            // -----------------------------------

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
                {
                    error:
                        "Server error",
                },
                500,
                origin
            )
        }
    },
}
