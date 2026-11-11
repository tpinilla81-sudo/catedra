// ============================================================================
// VÍDEO DE LA GRABACIÓN — URLs de YouTube y vídeo directo (Pilar 3)
// ----------------------------------------------------------------------------
// El míster graba los partidos en YouTube (no listado) o sube el mp4 a un
// enlace directo. El mock del whiteboard integrado pedía pegar la URL y que la pizarra funcione igual: mismo auto-clip −3s/+2s, mismo
// timecode exacto. Aquí vive la detección de URL + el puente con la IFrame
// API de YouTube (tipos propios, cero dependencias).
// ============================================================================

/** Tipos mínimos de la IFrame API que usamos (sin @types/youtube) */
export type YTPlayerLike = {
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
};

type YTNamespace = {
  Player: new (
    element: HTMLElement | string,
    options: {
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayerLike }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayerLike;
};

type YTWindow = Window & {
  YT?: YTNamespace;
  onYouTubeIframeAPIReady?: () => void;
};

// ---------- Detección / parsing de URL ----------

export type ParsedVideo =
  | { kind: "youtube"; id: string; embedUrl: string }
  | { kind: "direct"; url: string };

/** Extrae el ID de vídeo de youtu.be / watch?v= / embed/ / shorts/ / live/ */
export function youTubeIdFromUrl(input: string): string | null {
  const s = input.trim();
  if (!/youtube\.com|youtu\.be/i.test(s)) return null;
  const patterns: RegExp[] = [
    /youtu\.be\/([A-Za-z0-9_-]{6,})/i, // https://youtu.be/ID
    /[?&]v=([A-Za-z0-9_-]{6,})/i, // https://www.youtube.com/watch?v=ID
    /\/embed\/([A-Za-z0-9_-]{6,})/i, // https://www.youtube.com/embed/ID
    /\/shorts\/([A-Za-z0-9_-]{6,})/i, // https://www.youtube.com/shorts/ID
    /\/live\/([A-Za-z0-9_-]{6,})/i, // https://www.youtube.com/live/ID
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * Clasifica la URL del vídeo de la sesión:
 *  · YouTube → embed con enablejsapi (la pizarra lee el segundo exacto)
 *  · resto de http(s) → <video> directo (mp4/webm/…)
 *  · null → no es una URL utilizable
 */
export function parseVideoUrl(input: string | null | undefined): ParsedVideo | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) return null;

  const ytId = youTubeIdFromUrl(s);
  if (ytId) {
    const embedUrl =
      `https://www.youtube.com/embed/${ytId}` +
      `?enablejsapi=1&modestbranding=1&rel=0&playsinline=1`;
    return { kind: "youtube", id: ytId, embedUrl };
  }
  return { kind: "direct", url: s };
}

// ---------- Carga perezosa (singleton) de la IFrame API ----------

let ytApiPromise: Promise<YTNamespace | null> | null = null;

export function loadYouTubeIframeApi(): Promise<YTNamespace | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<YTNamespace | null>((resolve) => {
    const w = window as YTWindow;
    // Ya cargada (otro componente la trajo antes)
    if (w.YT?.Player) {
      resolve(w.YT);
      return;
    }
    // Timeout de cortesía: sin red hacia youtube.com la pizarra sigue viva
    const timer = window.setTimeout(() => resolve(w.YT ?? null), 8000);
    w.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timer);
      resolve(w.YT ?? null);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    document.head.appendChild(script);
  });
  return ytApiPromise;
}

/** Crea el player en el host (elemento vacío que YT sustituye por el iframe) */
export function createYouTubePlayer(
  host: HTMLElement,
  videoId: string,
): Promise<YTPlayerLike | null> {
  return loadYouTubeIframeApi().then((YT) => {
    if (!YT) return null;
    return new Promise<YTPlayerLike | null>((resolve) => {
      try {
        const player = new YT.Player(host, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: { modestbranding: 1, rel: 0, playsinline: 1 },
          events: {
            onReady: (e) => resolve(e.target),
            onError: () => resolve(null),
          },
        });
        // Red de seguridad: si en 10s no hubo onReady, no bloqueamos la UI
        window.setTimeout(() => resolve(null), 10000);
        void player;
      } catch {
        resolve(null);
      }
    });
  });
}
