"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

export function SecureVideoPlayer({
  source,
  title,
  onEnded,
}: {
  source: string;
  title: string;
  onEnded: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = source;
      return () => {
        video.removeAttribute("src");
        video.load();
      };
    }

    if (!Hls.isSupported()) {
      const frame = requestAnimationFrame(() => {
        setError("Secure video playback is not supported by this browser.");
        setLoading(false);
      });
      return () => cancelAnimationFrame(frame);
    }

    const hls = new Hls({ enableWorker: true, startLevel: -1 });
    hls.loadSource(source);
    hls.attachMedia(video);
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        setError("The lecture could not be played. Refresh the secure playback link and try again.");
        setLoading(false);
      }
    });
    return () => {
      hls.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [source]);

  if (error) return <div className="grid aspect-video place-items-center bg-brand-950 px-6 text-center text-sm text-white/75">{error}</div>;

  return (
    <div className="relative aspect-video overflow-hidden bg-black">
      {loading && <div className="absolute inset-0 z-10 grid place-items-center bg-brand-950"><Loader2 className="h-8 w-8 animate-spin text-white" /></div>}
      <video
        ref={videoRef}
        controls
        playsInline
        preload="metadata"
        controlsList="nodownload noplaybackrate"
        disablePictureInPicture
        aria-label={title}
        className="h-full w-full bg-black object-contain"
        onCanPlay={() => setLoading(false)}
        onEnded={onEnded}
        onContextMenu={(event) => event.preventDefault()}
      />
    </div>
  );
}
