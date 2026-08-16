const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
}

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
Avoid product-design jargon and explain complex ideas like a very smart
person speaking naturally to someone over coffee.
`,

    narrator: `
Tell the case study like a compelling movie narrator.
Give it a clear setup, tension, turning point and resolution.
Be cinematic but still professional and believable.
`,

    cynic: `
Tell the case study directly, sharply and with dry humor.
Cut through buzzwords and explain what was actually wrong,
what changed and why it mattered.
Do not become rude or dismissive.
`,
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

export default {
    async fetch(request) {
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: corsHeaders,
            })
        }

        if (request.method !== "POST") {
            return new Response(
                JSON.stringify({ error: "Use POST" }),
                {
                    status: 405,
                    headers: corsHeaders,
                }
            )
        }

        try {
            const { caseContent, character } = await request.json()

            if (!caseContent || !character) {
                return new Response(
                    JSON.stringify({
                        error: "caseContent and character are required",
                    }),
                    {
                        status: 400,
                        headers: corsHeaders,
                    }
                )
            }

            const characterPrompt =
                characterInstructions[character]

            if (!characterPrompt) {
                return new Response(
                    JSON.stringify({
                        error: "Unknown character",
                    }),
                    {
                        status: 400,
                        headers: corsHeaders,
                    }
                )
            }

            const openAIResponse = await fetch(
                "https://api.openai.com/v1/responses",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        model: "gpt-5.6-luna",

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

                        input: caseContent,
                    }),
                }
            )

            const data = await openAIResponse.json()

            if (!openAIResponse.ok) {
                console.error(data)

                return new Response(
                    JSON.stringify({
                        error: "OpenAI request failed",
                        details: data,
                    }),
                    {
                        status: 500,
                        headers: corsHeaders,
                    }
                )
            }

            const narration = getOutputText(data)

            return new Response(
                JSON.stringify({
                    narration,
                    character,
                }),
                {
                    status: 200,
                    headers: corsHeaders,
                }
            )
        } catch (error) {
            console.error(error)

            return new Response(
                JSON.stringify({
                    error: "Server error",
                }),
                {
                    status: 500,
                    headers: corsHeaders,
                }
            )
        }
    },
}
