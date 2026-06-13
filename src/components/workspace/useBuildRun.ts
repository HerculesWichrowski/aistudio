"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BuildFileStatus } from "@/lib/build-stream-client";
import type { BuildRunSnapshot, StreamPhase } from "./types";

const POLL_INTERVAL_MS = 450;

type UseBuildRunOptions = {
  /** Called with every polled snapshot while a run is active (editor sync). */
  onSnapshot?: (run: BuildRunSnapshot) => void | Promise<void>;
  /** Called once when the followed run leaves the "running" state. */
  onFinished: () => void | Promise<void>;
  /** Error text changes ("" clears). */
  onErrorChange: (message: string) => void;
};

/**
 * Follows a server-side build run by polling its snapshot. Builds execute in
 * the background on the server, so reloading the page mid-build and following
 * the same run again is safe.
 */
export function useBuildRun(options: UseBuildRunOptions) {
  const [loading, setLoading] = useState(false);
  const [streamChat, setStreamChat] = useState("");
  const [buildEvents, setBuildEvents] = useState<BuildFileStatus[]>([]);
  const [streamPhase, setStreamPhase] = useState<StreamPhase>("idle");

  const loadingRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRunRef = useRef<string | null>(null);
  const finishingRef = useRef(false);

  // Latest-callbacks ref so the long-lived poll loop never sees stale props.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const stopFollowing = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    activeRunRef.current = null;
  }, []);

  const resetStream = useCallback(() => {
    setStreamChat("");
    setBuildEvents([]);
    setStreamPhase("idle");
  }, []);

  /** Marks the workspace busy before the POST that creates a run. */
  const beginSend = useCallback(() => {
    loadingRef.current = true;
    setLoading(true);
    setStreamChat("");
    setBuildEvents([]);
    setStreamPhase("planning");
  }, []);

  /** Rolls back `beginSend` when creating the run failed. */
  const failSend = useCallback(
    (message: string) => {
      stopFollowing();
      resetStream();
      loadingRef.current = false;
      setLoading(false);
      optionsRef.current.onErrorChange(message);
    },
    [resetStream, stopFollowing]
  );

  const finishRun = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    stopFollowing();
    loadingRef.current = false;
    setLoading(false);
    resetStream();
    try {
      await optionsRef.current.onFinished();
    } finally {
      finishingRef.current = false;
    }
  }, [resetStream, stopFollowing]);

  const applySnapshot = useCallback((run: BuildRunSnapshot) => {
    setStreamChat(run.streamChat);
    setBuildEvents(run.events);
    if (run.status === "running") {
      setStreamPhase(run.phase === "building" ? "building" : "planning");
    } else {
      setStreamPhase("idle");
    }
    if (run.error && run.status !== "cancelled") optionsRef.current.onErrorChange(run.error);
    if (run.status === "cancelled") optionsRef.current.onErrorChange("");
  }, []);

  const followRun = useCallback(
    async (runId: string) => {
      stopFollowing();
      activeRunRef.current = runId;
      finishingRef.current = false;
      loadingRef.current = true;
      setLoading(true);
      optionsRef.current.onErrorChange("");

      const poll = async () => {
        if (activeRunRef.current !== runId) return;
        try {
          const response = await fetch(`/api/build-runs/${runId}`);
          if (!response.ok) return;
          const run = (await response.json()) as BuildRunSnapshot;
          applySnapshot(run);
          await optionsRef.current.onSnapshot?.(run);
          if (run.status !== "running") {
            await finishRun();
          }
        } catch {}
      };

      await poll();
      if (activeRunRef.current === runId) {
        pollRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
      }
    },
    [applySnapshot, finishRun, stopFollowing]
  );

  const stopRun = useCallback(async () => {
    const runId = activeRunRef.current;
    if (!runId) return;
    try {
      await fetch(`/api/build-runs/${runId}`, { method: "DELETE" });
    } catch {
      optionsRef.current.onErrorChange("Could not stop the build");
    }
  }, []);

  const isBusy = useCallback(() => loadingRef.current, []);

  useEffect(() => () => stopFollowing(), [stopFollowing]);

  return {
    loading,
    streamChat,
    buildEvents,
    streamPhase,
    beginSend,
    failSend,
    followRun,
    stopRun,
    isBusy,
  };
}
