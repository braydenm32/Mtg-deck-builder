"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraProblem } from "./text";

export type CameraState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "live"; width: number; height: number }
  /** `problem` picks the explanation the page shows (see cameraHelp); `reason` is the browser's own error, for the curious. */
  | { status: "unavailable"; problem: CameraProblem; reason?: string };

function problemFor(e: unknown): { problem: CameraProblem; reason?: string } {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return { problem: "denied" };
  if (name === "NotFoundError" || name === "OverconstrainedError") return { problem: "missing" };
  if (name === "NotReadableError" || name === "AbortError") return { problem: "busy" };
  return { problem: "error", reason: name || String(e) };
}

/** Rear camera in a <video>, with a reason the page can explain when it can't start. */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>({ status: "idle" });
  /** The camera was running when the tab was hidden, so start it again when the tab comes back. */
  const resume = useRef(false);
  /** Bumped by every start and stop, so a slow start that was overtaken (a double tap) lets its camera go. */
  const attempt = useRef(0);

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    attempt.current++;
    release();
    resume.current = false;
    setState({ status: "idle" });
  }, [release]);

  const start = useCallback(async () => {
    if (typeof window === "undefined") return;
    const id = ++attempt.current;
    if (!window.isSecureContext) {
      setState({ status: "unavailable", problem: "insecure" });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ status: "unavailable", problem: "unsupported" });
      return;
    }
    release();
    setState({ status: "starting" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (id !== attempt.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
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
      // Another app took the camera, or it was unplugged: say so instead of showing a frozen frame.
      track.addEventListener("ended", () => {
        if (streamRef.current !== stream) return;
        release();
        setState({ status: "unavailable", problem: "stopped" });
      });
      setState({ status: "live", width: video.videoWidth, height: video.videoHeight });
    } catch (e) {
      if (id !== attempt.current) return;
      release();
      setState({ status: "unavailable", ...problemFor(e) });
    }
  }, [release]);

  // Release the camera when the tab is hidden or the page is left; pick it up again when the tab comes back.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        if (streamRef.current) {
          resume.current = true;
          attempt.current++;
          release();
          setState({ status: "idle" });
        }
      } else if (resume.current) {
        resume.current = false;
        start();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [release, start]);

  return { videoRef, state, start, stop };
}
