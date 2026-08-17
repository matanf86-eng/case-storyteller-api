import * as React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

type StorytellerId = "detective" | "robot" | "grandma" | "narrator" | "cynic"

type ThemeMode = "auto" | "light" | "dark"
type ResolvedTheme = "light" | "dark"

interface Props {
    prompt?: string
    defaultCharacter?: StorytellerId
    theme?: ThemeMode
    showDisclosure?: boolean
    backendUrl?: string
    style?: React.CSSProperties
}

type CharacterData = {
    id: StorytellerId
    name: string
    shortName: string
    tagline: string
}

const CHARACTERS: CharacterData[] = [
    {
        id: "detective",
        name: "The Detective",
        shortName: "Detective",
        tagline: "Finds the clues.",
    },
    {
        id: "robot",
        name: "The Robot",
        shortName: "Robot",
        tagline: "Analyses the data.",
    },
    {
        id: "grandma",
        name: "The Grandma",
        shortName: "Grandma",
        tagline: "Keeps it simple.",
    },
    {
        id: "narrator",
        name: "The Narrator",
        shortName: "Narrator",
        tagline: "Makes it cinematic.",
    },
    {
        id: "cynic",
        name: "The Cynic",
        shortName: "Cynic",
        tagline: "Tells it like it is.",
    },
]

function normalizeBackendUrl(value?: string) {
    let clean = (value || "").trim().replace(/\/+$/, "")

    if (clean.endsWith("/api/narrate")) {
        clean = clean.slice(0, -"/api/narrate".length)
    }

    return clean
}

function formatTime(value: number) {
    if (!Number.isFinite(value) || value < 0) {
        return "0:00"
    }

    const minutes = Math.floor(value / 60)
    const seconds = Math.floor(value % 60)

    return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

function cleanCaseMarkdown(markdown: string) {
    if (!markdown) return ""

    let result = markdown

    result = result.replace(/^---[\s\S]*?---\s*/m, "")

    const firstHeading = result.search(/^#\s+.+$/m)

    if (firstHeading >= 0) {
        result = result.slice(firstHeading)
    }

    const noise = new Set([
        "Home",
        "About",
        "Download CV",
        "Choose who should tell you this story",
        "AI-generated voice",
        "The Detective",
        "The Robot",
        "The Grandma",
        "The Narrator",
        "The Cynic",
        "Finds the clues.",
        "Analyses the data.",
        "Keeps it simple.",
        "Makes it cinematic.",
        "Tells it like it is.",
    ])

    return result
        .split("\n")
        .filter((line) => {
            const clean = line
                .replace(/^#+\s*/, "")
                .replace(/\*\*/g, "")
                .trim()

            return !noise.has(clean)
        })
        .join("\n")
        .trim()
}

function detectTheme(): ResolvedTheme {
    if (typeof window === "undefined") {
        return "light"
    }

    const html = document.documentElement
    const body = document.body

    const explicitTheme =
        html.getAttribute("data-framer-theme") ||
        body?.getAttribute("data-framer-theme") ||
        html.getAttribute("data-theme") ||
        body?.getAttribute("data-theme") ||
        ""

    const explicit = explicitTheme.toLowerCase()

    if (explicit.includes("dark")) {
        return "dark"
    }

    if (explicit.includes("light")) {
        return "light"
    }

    const classText = [html.className, body?.className || ""]
        .join(" ")
        .toLowerCase()

    if (classText.includes("dark")) {
        return "dark"
    }

    if (classText.includes("light")) {
        return "light"
    }

    const htmlScheme =
        window.getComputedStyle(html).colorScheme?.toLowerCase() || ""

    const bodyScheme = body
        ? window.getComputedStyle(body).colorScheme?.toLowerCase() || ""
        : ""

    if (htmlScheme.includes("dark") || bodyScheme.includes("dark")) {
        return "dark"
    }

    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
        return "dark"
    }

    return "light"
}

function PlayIcon({ pause = false }: { pause?: boolean }) {
    if (pause) {
        return (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <rect
                    x="3.2"
                    y="2.5"
                    width="3.4"
                    height="11"
                    rx="0.8"
                    fill="currentColor"
                />
                <rect
                    x="9.4"
                    y="2.5"
                    width="3.4"
                    height="11"
                    rx="0.8"
                    fill="currentColor"
                />
            </svg>
        )
    }

    return (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path
                d="M4.5 2.85C4.5 2.08 5.34 1.6 6 2L13.2 6.45C13.82 6.83 13.82 7.72 13.2 8.1L6 12.55C5.34 12.95 4.5 12.48 4.5 11.7V2.85Z"
                fill="currentColor"
            />
        </svg>
    )
}

function CloseIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path
                d="M3 3L11 11M11 3L3 11"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
            />
        </svg>
    )
}

/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 * @framerIntrinsicWidth 900
 * @framerIntrinsicHeight 124
 */
export default function CaseStorytellerPublic(props: Props) {
    const {
        prompt = "Choose who should tell you this story",
        defaultCharacter = "detective",
        theme = "auto",
        showDisclosure = true,
        backendUrl = "",
        style,
    } = props

    const isCanvas = RenderTarget.current() === RenderTarget.canvas

    const rootRef = useRef<HTMLDivElement>(null)

    const audioRef = useRef<HTMLAudioElement>(null)

    const caseContentRef = useRef("")

    const backendBaseUrl = normalizeBackendUrl(backendUrl)

    const narrateEndpoint = backendBaseUrl
        ? `${backendBaseUrl}/api/narrate`
        : ""

    const getCharacterImage = (character: StorytellerId) =>
        backendBaseUrl ? `${backendBaseUrl}/characters/${character}.png` : ""

    const [selectedCharacter, setSelectedCharacter] =
        useState<StorytellerId>(defaultCharacter)

    const [audioUrl, setAudioUrl] = useState("")

    const [isPlaying, setIsPlaying] = useState(false)

    const [isLoading, setIsLoading] = useState(false)

    const [hasStarted, setHasStarted] = useState(false)

    const [currentTime, setCurrentTime] = useState(0)

    const [duration, setDuration] = useState(0)

    const [error, setError] = useState("")

    const [componentWidth, setComponentWidth] = useState(900)

    const [viewportWidth, setViewportWidth] = useState(
        typeof window !== "undefined" ? window.innerWidth : 1200
    )

    const [originalIsVisible, setOriginalIsVisible] = useState(true)

    const [floatingDismissed, setFloatingDismissed] = useState(false)

    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(
        theme === "dark" ? "dark" : "light"
    )

    const compact = componentWidth < 620

    const veryCompact = componentWidth < 430

    const mobileFloating = viewportWidth < 600

    const selectedData = useMemo(
        () =>
            CHARACTERS.find(
                (character) => character.id === selectedCharacter
            ) || CHARACTERS[0],
        [selectedCharacter]
    )

    const selectedImage = getCharacterImage(selectedCharacter)

    const colors =
        resolvedTheme === "dark"
            ? {
                  background: "#111111",
                  floatingBackground: "rgba(17,17,17,0.94)",
                  border: "#2A2A2A",
                  text: "#FFFFFF",
                  secondary: "#A6A6A6",
                  muted: "#757575",
                  track: "#353535",
                  avatarBorder: "#383838",
                  avatarPlaceholder: "#202020",
                  playBackground: "#FFFFFF",
                  playText: "#111111",
                  disabled: "#333333",
                  shadow: "0 18px 60px rgba(0,0,0,0.4)",
              }
            : {
                  background: "#FFFFFF",
                  floatingBackground: "rgba(255,255,255,0.95)",
                  border: "#E6E6E6",
                  text: "#111111",
                  secondary: "#696969",
                  muted: "#9A9A9A",
                  track: "#E5E5E5",
                  avatarBorder: "#E5E5E5",
                  avatarPlaceholder: "#F1F1F1",
                  playBackground: "#111111",
                  playText: "#FFFFFF",
                  disabled: "#D8D8D8",
                  shadow: "0 18px 60px rgba(0,0,0,0.16)",
              }

    // AUTO THEME

    useEffect(() => {
        if (theme !== "auto") {
            setResolvedTheme(theme)
            return
        }

        if (typeof window === "undefined") {
            return
        }

        const update = () => {
            setResolvedTheme(detectTheme())
        }

        update()

        const observer = new MutationObserver(update)

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: [
                "class",
                "style",
                "data-theme",
                "data-framer-theme",
            ],
        })

        if (document.body) {
            observer.observe(document.body, {
                attributes: true,
                attributeFilter: [
                    "class",
                    "style",
                    "data-theme",
                    "data-framer-theme",
                ],
            })
        }

        const media = window.matchMedia("(prefers-color-scheme: dark)")

        const mediaHandler = () => update()

        media.addEventListener?.("change", mediaHandler)

        return () => {
            observer.disconnect()

            media.removeEventListener?.("change", mediaHandler)
        }
    }, [theme])

    // COMPONENT WIDTH

    useEffect(() => {
        const element = rootRef.current

        if (!element) return

        const update = (width?: number) => {
            setComponentWidth(width || element.offsetWidth || 900)
        }

        update()

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0]

            if (!entry) return

            update(entry.contentRect.width)
        })

        observer.observe(element)

        return () => observer.disconnect()
    }, [])

    // VIEWPORT WIDTH

    useEffect(() => {
        if (typeof window === "undefined") {
            return
        }

        const update = () => {
            setViewportWidth(window.innerWidth)
        }

        update()

        window.addEventListener("resize", update)

        return () => window.removeEventListener("resize", update)
    }, [])

    // FLOATING VISIBILITY

    useEffect(() => {
        if (isCanvas || typeof window === "undefined") {
            return
        }

        const element = rootRef.current

        if (!element) return

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0]

                if (!entry) return

                const visible =
                    entry.isIntersecting && entry.intersectionRatio > 0.08

                setOriginalIsVisible(visible)

                if (visible) {
                    setFloatingDismissed(false)
                }
            },
            {
                threshold: [0, 0.08, 0.25, 1],
            }
        )

        observer.observe(element)

        return () => observer.disconnect()
    }, [isCanvas])

    useEffect(() => {
        setSelectedCharacter(defaultCharacter)
    }, [defaultCharacter])

    // AUDIO

    const pauseAudio = () => {
        const audio = audioRef.current

        if (!audio) return

        audio.pause()
        setIsPlaying(false)
    }

    const resetAudio = () => {
        const audio = audioRef.current

        if (audio) {
            audio.pause()
            audio.removeAttribute("src")
            audio.load()
        }

        setAudioUrl("")
        setCurrentTime(0)
        setDuration(0)
        setIsPlaying(false)
        setHasStarted(false)
        setFloatingDismissed(false)
        setError("")
    }

    const getCaseContent = async () => {
        if (caseContentRef.current) {
            return caseContentRef.current
        }

        if (typeof window === "undefined") {
            throw new Error("Page unavailable")
        }

        const markdownUrl = `${window.location.origin}${window.location.pathname}?md`

        const response = await fetch(markdownUrl, {
            cache: "no-store",
        })

        if (!response.ok) {
            throw new Error("Could not read this case study")
        }

        const markdown = await response.text()

        const clean = cleanCaseMarkdown(markdown)

        if (!clean) {
            throw new Error("No case content found")
        }

        caseContentRef.current = clean

        return clean
    }

    const generateAndPlay = async () => {
        if (isCanvas) return

        setError("")

        if (!backendBaseUrl) {
            setError("Add your Backend URL")
            return
        }

        setIsLoading(true)
        setHasStarted(true)
        setFloatingDismissed(false)

        try {
            const caseContent = await getCaseContent()

            const response = await fetch(narrateEndpoint, {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                },

                body: JSON.stringify({
                    caseContent,
                    character: selectedCharacter,
                }),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data?.error || "Could not generate story")
            }

            if (!data?.audioDataUrl) {
                throw new Error("No audio returned")
            }

            const url = data.audioDataUrl

            setAudioUrl(url)

            const audio = audioRef.current

            if (!audio) return

            audio.src = url
            audio.load()

            try {
                await audio.play()
            } catch {
                setIsPlaying(false)
            }
        } catch (err) {
            console.error(err)

            setError(
                err instanceof Error ? err.message : "Something went wrong"
            )

            setHasStarted(false)
        } finally {
            setIsLoading(false)
        }
    }

    const handlePlayPause = async () => {
        if (isCanvas || isLoading) {
            return
        }

        const audio = audioRef.current

        if (!audio) return

        if (!backendBaseUrl) {
            setError("Add your Backend URL")
            return
        }

        setFloatingDismissed(false)

        if (audioUrl) {
            if (audio.paused) {
                setHasStarted(true)

                try {
                    await audio.play()
                } catch {
                    setError("Tap play again to continue")
                }
            } else {
                pauseAudio()
            }

            return
        }

        await generateAndPlay()
    }

    const handleCharacterSelect = (character: StorytellerId) => {
        if (character === selectedCharacter) {
            return
        }

        resetAudio()

        setSelectedCharacter(character)
    }

    // SEEK

    const seekToPointer = (event: React.PointerEvent<HTMLDivElement>) => {
        const audio = audioRef.current

        if (!audio || !duration) {
            return
        }

        const rect = event.currentTarget.getBoundingClientRect()

        const ratio = Math.min(
            1,
            Math.max(0, (event.clientX - rect.left) / rect.width)
        )

        const time = ratio * duration

        audio.currentTime = time

        setCurrentTime(time)
    }

    const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0

    const closeFloating = () => {
        pauseAudio()
        setHasStarted(false)
        setFloatingDismissed(true)
    }

    const showFloating =
        !isCanvas && hasStarted && !originalIsVisible && !floatingDismissed

    const avatarSize = veryCompact ? 38 : compact ? 42 : 48

    // MAIN PLAYER

    const mainPlayer = (
        <div
            ref={rootRef}
            style={{
                ...style,

                width: "100%",

                boxSizing: "border-box",

                background: colors.background,

                border: `1px solid ${colors.border}`,

                borderRadius: 18,

                padding: compact ? "15px" : "15px 17px 14px",

                color: colors.text,

                fontFamily:
                    "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",

                position: "relative",
            }}
        >
            <style>{`
                @keyframes storytellerSpin {
                    from {
                        transform: rotate(0deg);
                    }

                    to {
                        transform: rotate(360deg);
                    }
                }

                @keyframes storytellerFloatIn {
                    from {
                        opacity: 0;
                        transform: translateY(18px) scale(.96);
                    }

                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }

                @keyframes storytellerSpeaking {
                    0%, 100% {
                        transform: scale(1);
                    }

                    50% {
                        transform: scale(1.035);
                    }
                }
            `}</style>

            <audio
                ref={audioRef}
                preload="metadata"
                onPlay={() => {
                    setIsPlaying(true)
                    setHasStarted(true)
                }}
                onPause={() => {
                    setIsPlaying(false)
                }}
                onLoadedMetadata={(event) => {
                    const value = event.currentTarget.duration

                    if (Number.isFinite(value)) {
                        setDuration(value)
                    }
                }}
                onDurationChange={(event) => {
                    const value = event.currentTarget.duration

                    if (Number.isFinite(value)) {
                        setDuration(value)
                    }
                }}
                onTimeUpdate={(event) => {
                    setCurrentTime(event.currentTarget.currentTime)
                }}
                onEnded={() => {
                    setIsPlaying(false)
                    setHasStarted(false)
                }}
                style={{
                    display: "none",
                }}
            />

            <div
                style={{
                    fontSize: 12,
                    fontWeight: 500,
                    lineHeight: 1.3,
                    color: colors.secondary,
                    marginBottom: 10,
                }}
            >
                {prompt}
            </div>

            <div
                style={{
                    display: "flex",

                    flexDirection: compact ? "column" : "row",

                    alignItems: compact ? "stretch" : "center",

                    gap: compact ? 13 : 16,

                    minWidth: 0,
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",

                        gap: veryCompact ? 5 : 7,

                        flexShrink: 0,
                    }}
                >
                    {CHARACTERS.map((character) => {
                        const selected = character.id === selectedCharacter

                        const image = getCharacterImage(character.id)

                        return (
                            <button
                                key={character.id}
                                type="button"
                                title={character.name}
                                aria-label={`Choose ${character.name}`}
                                onClick={() =>
                                    handleCharacterSelect(character.id)
                                }
                                style={{
                                    width: avatarSize,

                                    height: avatarSize,

                                    flexShrink: 0,

                                    padding: 0,

                                    borderRadius: "50%",

                                    overflow: "hidden",

                                    appearance: "none",

                                    background: colors.avatarPlaceholder,

                                    border: selected
                                        ? `2px solid ${colors.text}`
                                        : `1px solid ${colors.avatarBorder}`,

                                    cursor: "pointer",

                                    transition:
                                        "border-color 160ms ease, transform 160ms ease",

                                    transform: selected
                                        ? "scale(1.03)"
                                        : "scale(1)",

                                    display: "flex",

                                    alignItems: "center",

                                    justifyContent: "center",
                                }}
                            >
                                {image ? (
                                    <img
                                        src={image}
                                        alt={character.name}
                                        draggable={false}
                                        style={{
                                            width: "100%",

                                            height: "100%",

                                            display: "block",

                                            objectFit: "cover",
                                        }}
                                    />
                                ) : (
                                    <span
                                        style={{
                                            fontSize: 12,

                                            color: colors.muted,

                                            fontWeight: 600,
                                        }}
                                    >
                                        ?
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>

                <div
                    style={{
                        minWidth: 0,

                        width: compact ? "100%" : 205,

                        flexShrink: 0,
                    }}
                >
                    <div
                        style={{
                            fontSize: compact ? 14 : 15,

                            fontWeight: 650,

                            lineHeight: 1.15,

                            color: colors.text,

                            whiteSpace: "nowrap",

                            overflow: "hidden",

                            textOverflow: "ellipsis",
                        }}
                    >
                        {isLoading ? "Preparing story…" : selectedData.name}
                    </div>

                    <div
                        style={{
                            fontSize: 11,

                            lineHeight: 1.25,

                            marginTop: 3,

                            color: error ? "#D64B4B" : colors.secondary,

                            whiteSpace: "nowrap",

                            overflow: "hidden",

                            textOverflow: "ellipsis",
                        }}
                    >
                        {error ||
                            (!backendBaseUrl
                                ? "Add your Backend URL"
                                : selectedData.tagline)}
                    </div>

                    {showDisclosure && (
                        <div
                            style={{
                                fontSize: 9,

                                lineHeight: 1.2,

                                marginTop: 4,

                                color: colors.muted,
                            }}
                        >
                            AI-generated voice
                        </div>
                    )}
                </div>

                <div
                    style={{
                        flex: 1,
                    }}
                />

                <button
                    type="button"
                    onClick={handlePlayPause}
                    disabled={isCanvas || isLoading || !backendBaseUrl}
                    aria-label={isPlaying ? "Pause" : "Play"}
                    style={{
                        height: 44,

                        minWidth: compact ? 92 : 105,

                        borderRadius: 999,

                        padding: "0 20px",

                        border: "none",

                        flexShrink: 0,

                        display: "flex",

                        alignItems: "center",

                        justifyContent: "center",

                        gap: 6,

                        fontFamily: "inherit",

                        fontSize: 12,

                        fontWeight: 600,

                        background:
                            isCanvas || isLoading || !backendBaseUrl
                                ? colors.disabled
                                : colors.playBackground,

                        color: colors.playText,

                        cursor:
                            isCanvas || isLoading || !backendBaseUrl
                                ? "default"
                                : "pointer",
                    }}
                >
                    {isLoading ? (
                        <>
                            <span
                                style={{
                                    width: 12,
                                    height: 12,

                                    border: `2px solid ${colors.playText}`,

                                    borderTopColor: "transparent",

                                    borderRadius: "50%",

                                    animation:
                                        "storytellerSpin .8s linear infinite",
                                }}
                            />

                            <span>Loading</span>
                        </>
                    ) : (
                        <>
                            <PlayIcon pause={isPlaying} />

                            <span>{isPlaying ? "Pause" : "Play"}</span>
                        </>
                    )}
                </button>
            </div>

            <div
                style={{
                    display: "flex",

                    alignItems: "center",

                    gap: 10,

                    marginTop: 12,
                }}
            >
                <span
                    style={{
                        width: 32,

                        flexShrink: 0,

                        fontSize: 10,

                        color: colors.muted,

                        fontVariantNumeric: "tabular-nums",
                    }}
                >
                    {formatTime(currentTime)}
                </span>

                <div
                    onPointerDown={seekToPointer}
                    onPointerMove={(event) => {
                        if (event.buttons === 1) {
                            seekToPointer(event)
                        }
                    }}
                    style={{
                        flex: 1,

                        height: 12,

                        display: "flex",

                        alignItems: "center",

                        cursor: duration ? "pointer" : "default",

                        touchAction: "none",
                    }}
                >
                    <div
                        style={{
                            position: "relative",

                            width: "100%",

                            height: 3,

                            borderRadius: 999,

                            background: colors.track,
                        }}
                    >
                        <div
                            style={{
                                position: "absolute",

                                left: 0,
                                top: 0,
                                bottom: 0,

                                width: `${progress * 100}%`,

                                borderRadius: 999,

                                background: colors.text,
                            }}
                        />

                        {duration > 0 && (
                            <div
                                style={{
                                    position: "absolute",

                                    top: "50%",

                                    left: `${progress * 100}%`,

                                    width: 10,

                                    height: 10,

                                    borderRadius: "50%",

                                    background: colors.text,

                                    transform: "translate(-50%, -50%)",
                                }}
                            />
                        )}
                    </div>
                </div>

                <span
                    style={{
                        width: 32,

                        flexShrink: 0,

                        textAlign: "right",

                        fontSize: 10,

                        color: colors.muted,

                        fontVariantNumeric: "tabular-nums",
                    }}
                >
                    {formatTime(duration)}
                </span>
            </div>
        </div>
    )

    // FLOATING PLAYER

    const floatingPlayer =
        showFloating && typeof document !== "undefined"
            ? createPortal(
                  <div
                      style={{
                          position: "fixed",

                          left: mobileFloating ? 12 : "auto",

                          right: mobileFloating ? 12 : 24,

                          bottom: mobileFloating
                              ? "calc(12px + env(safe-area-inset-bottom, 0px))"
                              : 24,

                          width: mobileFloating ? "auto" : 360,

                          maxWidth: "calc(100vw - 24px)",

                          zIndex: 2147483000,

                          boxSizing: "border-box",

                          overflow: "hidden",

                          borderRadius: mobileFloating ? 18 : 20,

                          border: `1px solid ${colors.border}`,

                          background: colors.floatingBackground,

                          boxShadow: colors.shadow,

                          backdropFilter: "blur(20px)",

                          WebkitBackdropFilter: "blur(20px)",

                          color: colors.text,

                          fontFamily:
                              "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",

                          animation:
                              "storytellerFloatIn 280ms cubic-bezier(.2,.8,.2,1) both",
                      }}
                  >
                      <div
                          style={{
                              display: "flex",

                              alignItems: "center",

                              gap: 10,

                              padding: mobileFloating ? "10px" : "11px 12px",
                          }}
                      >
                          <div
                              style={{
                                  width: 44,

                                  height: 44,

                                  flexShrink: 0,

                                  borderRadius: "50%",

                                  overflow: "hidden",

                                  background: colors.avatarPlaceholder,

                                  border: `1px solid ${colors.avatarBorder}`,

                                  animation: isPlaying
                                      ? "storytellerSpeaking 1.8s ease-in-out infinite"
                                      : "none",
                              }}
                          >
                              {selectedImage && (
                                  <img
                                      src={selectedImage}
                                      alt={selectedData.name}
                                      draggable={false}
                                      style={{
                                          width: "100%",

                                          height: "100%",

                                          objectFit: "cover",

                                          display: "block",
                                      }}
                                  />
                              )}
                          </div>

                          <div
                              style={{
                                  flex: 1,

                                  minWidth: 0,
                              }}
                          >
                              <div
                                  style={{
                                      fontSize: 13,

                                      fontWeight: 650,

                                      lineHeight: 1.15,

                                      whiteSpace: "nowrap",

                                      overflow: "hidden",

                                      textOverflow: "ellipsis",
                                  }}
                              >
                                  {selectedData.name}
                              </div>

                              <div
                                  style={{
                                      marginTop: 4,

                                      fontSize: 10,

                                      color: colors.secondary,

                                      whiteSpace: "nowrap",

                                      overflow: "hidden",

                                      textOverflow: "ellipsis",
                                  }}
                              >
                                  {isPlaying
                                      ? `Playing · ${formatTime(currentTime)}`
                                      : `Paused · ${formatTime(currentTime)}`}
                              </div>
                          </div>

                          <button
                              type="button"
                              aria-label={isPlaying ? "Pause" : "Play"}
                              onClick={handlePlayPause}
                              style={{
                                  width: 38,

                                  height: 38,

                                  flexShrink: 0,

                                  padding: 0,

                                  border: "none",

                                  borderRadius: "50%",

                                  display: "flex",

                                  alignItems: "center",

                                  justifyContent: "center",

                                  background: colors.playBackground,

                                  color: colors.playText,

                                  cursor: "pointer",
                              }}
                          >
                              <PlayIcon pause={isPlaying} />
                          </button>

                          <button
                              type="button"
                              aria-label="Close player"
                              onClick={closeFloating}
                              style={{
                                  width: 26,

                                  height: 26,

                                  flexShrink: 0,

                                  padding: 0,

                                  border: "none",

                                  borderRadius: "50%",

                                  background: "transparent",

                                  color: colors.secondary,

                                  cursor: "pointer",

                                  display: "flex",

                                  alignItems: "center",

                                  justifyContent: "center",
                              }}
                          >
                              <CloseIcon />
                          </button>
                      </div>

                      <div
                          onPointerDown={seekToPointer}
                          onPointerMove={(event) => {
                              if (event.buttons === 1) {
                                  seekToPointer(event)
                              }
                          }}
                          style={{
                              height: 4,

                              width: "100%",

                              position: "relative",

                              background: colors.track,

                              cursor: duration ? "pointer" : "default",

                              touchAction: "none",
                          }}
                      >
                          <div
                              style={{
                                  position: "absolute",

                                  left: 0,
                                  top: 0,
                                  bottom: 0,

                                  width: `${progress * 100}%`,

                                  background: colors.text,
                              }}
                          />
                      </div>
                  </div>,

                  document.body
              )
            : null

    return (
        <>
            {mainPlayer}
            {floatingPlayer}
        </>
    )
}

CaseStorytellerPublic.defaultProps = {
    prompt: "Choose who should tell you this story",

    defaultCharacter: "detective",

    theme: "auto",

    showDisclosure: true,

    backendUrl: "",
}

addPropertyControls(CaseStorytellerPublic, {
    backendUrl: {
        title: "Backend URL",

        type: ControlType.String,

        defaultValue: "",

        placeholder: "https://your-app.vercel.app",
    },

    prompt: {
        title: "Prompt",

        type: ControlType.String,

        defaultValue: "Choose who should tell you this story",
    },

    defaultCharacter: {
        title: "Default",

        type: ControlType.Enum,

        defaultValue: "detective",

        options: ["detective", "robot", "grandma", "narrator", "cynic"],

        optionTitles: ["Detective", "Robot", "Grandma", "Narrator", "Cynic"],
    },

    theme: {
        title: "Theme",

        type: ControlType.Enum,

        defaultValue: "auto",

        displaySegmentedControl: true,

        options: ["auto", "light", "dark"],

        optionTitles: ["Auto", "Light", "Dark"],
    },

    showDisclosure: {
        title: "AI Label",

        type: ControlType.Boolean,

        defaultValue: true,

        enabledTitle: "Show",

        disabledTitle: "Hide",
    },
})
