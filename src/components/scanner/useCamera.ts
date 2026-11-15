"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "live"; width: number; height: number }
  | { status: "unavailable"; reason: string };

/** Rear camera in a <video>, with friendly reasons when it can't start. */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>({ status: "idle" });

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setState({ status: "idle" });
  }, []);

  const start = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setState({
        status: "unavailable",
        reason:
          "The camera only works over HTTPS (or on localhost). Open the app with npm run dev:https, or use “Scan from photos” below.",
      });
      return;
    }
    setState({ status: "starting" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      // Continuous autofocus where supported: small text needs it.
      const [track] = stream.getVideoTracks();
      const caps = (track.getCapabilities?.() ?? {}) as { focusMode?: string[] };
      if (caps.focusMode?.includes("continuous")) {
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
      }
      setState({ status: "live", width: video.videoWidth, height: video.videoHeight });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      setState({
        status: "unavailable",
        reason:
          name === "NotAllowedError"
            ? "Camera permission was denied. Allow it in your browser's site settings, or use “Scan from photos”."
            : name === "NotFoundError"
              ? "No camera found on this device. Use “Scan from photos” instead."
              : `Couldn't start the camera (${name || String(e)}).`,
      });
    }
  }, []);

  // Release the camera when leaving the page or hiding the tab.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [stop]);

  return { videoRef, state, start, stop };
}
