import {
  ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";

export type ReactMediaRecorderRenderProps = {
  error: string;
  muteAudio: () => void;
  unMuteAudio: () => void;
  startRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  mediaBlobUrl: null | string;
  status: StatusMessages;
  isAudioMuted: boolean;
  previewStream: MediaStream | null;
  clearBlobUrl: () => void;
};

export type ReactMediaRecorderHookProps = {
  audio?: boolean | MediaTrackConstraints;
  video?: boolean | MediaTrackConstraints;
  screen?: boolean;
  onStop?: (blobUrl: string, blob: Blob) => void;
  onStart?: () => void;
  blobPropertyBag?: BlobPropertyBag;
  mediaRecorderOptions?: MediaRecorderOptions | null;
  customMediaStream?: MediaStream | null;
  stopStreamsOnStop?: boolean;
};
export type ReactMediaRecorderProps = ReactMediaRecorderHookProps & {
  render: (props: ReactMediaRecorderRenderProps) => ReactElement;
};

export type StatusMessages =
  | "media_aborted"
  | "permission_denied"
  | "no_specified_media_found"
  | "media_in_use"
  | "invalid_media_constraints"
  | "no_constraints"
  | "recorder_error"
  | "idle"
  | "acquiring_media"
  | "delayed_start"
  | "recording"
  | "stopping"
  | "stopped";

export enum RecorderErrors {
  AbortError = "media_aborted",
  NotAllowedError = "permission_denied",
  NotFoundError = "no_specified_media_found",
  NotReadableError = "media_in_use",
  OverconstrainedError = "invalid_media_constraints",
  TypeError = "no_constraints",
  NONE = "",
  NO_RECORDER = "recorder_error",
  UnsupportedBrowserError = "unsupported_browser",
}

export function useReactMediaRecorder({
  audio = true,
  video = false,
  onStop = () => null,
  onStart = () => null,
  blobPropertyBag,
  screen = false,
  mediaRecorderOptions = null,
  customMediaStream = null,
  stopStreamsOnStop = true,
}: ReactMediaRecorderHookProps): ReactMediaRecorderRenderProps {
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const mediaChunks = useRef<Blob[]>([]);
  const mediaStream = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<StatusMessages>("idle");
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [mediaBlobUrl, setMediaBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<keyof typeof RecorderErrors>("NONE");

  const getMediaStream = useCallback(async () => {
    if (mediaStream.current) {
      return;
    }
    setStatus("acquiring_media");
    const requiredMedia: MediaStreamConstraints = {
      audio: typeof audio === "boolean" ? !!audio : audio,
      video: typeof video === "boolean" ? !!video : video,
    };
    try {
      if (customMediaStream) {
        mediaStream.current = customMediaStream;
      } else if (screen) {
        //@ts-ignore
        const stream = (await window.navigator.mediaDevices.getDisplayMedia({
          video: video || true,
        })) as MediaStream;
        if (audio) {
          const audioStream = await window.navigator.mediaDevices.getUserMedia({
            audio,
          });

          audioStream
            .getAudioTracks()
            .forEach((audioTrack) => stream.addTrack(audioTrack));
        }
        mediaStream.current = stream;
      } else {
        const stream = await window.navigator.mediaDevices.getUserMedia(
          requiredMedia
        );
        console.log("setting mediaStream current", stream);
        mediaStream.current = stream;
      }
      setStatus("idle");
    } catch (error) {
      setError(error.name);
      setStatus("idle");
    }
  }, [audio, video, screen, customMediaStream, mediaStream.current]);

  useEffect(() => {
    if (!window.MediaRecorder) {
      setError("UnsupportedBrowserError");
      return;
    }

    if (screen) {
      //@ts-ignore
      if (!window.navigator.mediaDevices.getDisplayMedia) {
        throw new Error("This browser doesn't support screen capturing");
      }
    }

    const checkConstraints = (mediaType: MediaTrackConstraints) => {
      const supportedMediaConstraints = navigator.mediaDevices.getSupportedConstraints();
      const unSupportedConstraints = Object.keys(mediaType).filter(
        (constraint) =>
          !(supportedMediaConstraints as { [key: string]: any })[constraint]
      );

      if (unSupportedConstraints.length > 0) {
        console.error(
          `The constraints ${unSupportedConstraints.join(
            ","
          )} doesn't support on this browser. Please check your ReactMediaRecorder component.`
        );
      }
    };

    if (typeof audio === "object") {
      checkConstraints(audio);
    }
    if (typeof video === "object") {
      checkConstraints(video);
    }

    if (mediaRecorderOptions && mediaRecorderOptions.mimeType) {
      if (!MediaRecorder.isTypeSupported(mediaRecorderOptions.mimeType)) {
        console.error(
          `The specified MIME type you supplied for MediaRecorder doesn't support this browser`
        );
      }
    }
  }, [audio, screen, video, getMediaStream, mediaRecorderOptions]);

  useEffect(() => {
    console.log("getting media stream");
    getMediaStream();
  }, [audio, screen, video]);

  // Media Recorder Handlers

  const startRecording = useCallback(async () => {
    setError("NONE");
    if (mediaStream.current) {
      const isStreamEnded = mediaStream.current
        .getTracks()
        .some((track) => track.readyState === "ended");
      mediaRecorder.current = new MediaRecorder(mediaStream.current);
      mediaRecorder.current.ondataavailable = onRecordingActive;
      mediaRecorder.current.onstop = onRecordingStop;
      mediaRecorder.current.onstart = onRecordingStart;
      mediaRecorder.current.onerror = () => {
        setError("NO_RECORDER");
        setStatus("idle");
      };
      mediaRecorder.current.start();
      setStatus("recording");
    }
  }, [mediaStream.current, setError, setStatus]);

  const onRecordingActive = useCallback(
    ({ data }: BlobEvent) => {
      mediaChunks.current.push(data);
    },
    [mediaChunks.current]
  );

  const onRecordingStart = useCallback(() => {
    onStart();
  }, [onStart]);

  const onRecordingStop = useCallback(() => {
    const [chunk] = mediaChunks.current;
    const blobProperty: BlobPropertyBag = Object.assign(
      { type: chunk.type },
      blobPropertyBag || (video ? { type: "video/mp4" } : { type: "audio/wav" })
    );
    const blob = new Blob(mediaChunks.current, blobProperty);
    const url = URL.createObjectURL(blob);
    setStatus("stopped");
    setMediaBlobUrl(url);
    onStop(url, blob);
  }, [mediaChunks.current, setMediaBlobUrl, onStop, setStatus]);

  const muteAudio = useCallback(
    (mute: boolean) => {
      setIsAudioMuted(mute);
      if (mediaStream.current) {
        mediaStream.current
          .getAudioTracks()
          .forEach((audioTrack) => (audioTrack.enabled = !mute));
      }
    },
    [setIsAudioMuted, mediaStream.current]
  );

  const pauseRecording = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
      mediaRecorder.current.pause();
    }
  }, [mediaRecorder.current]);
  const resumeRecording = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state === "paused") {
      mediaRecorder.current.resume();
    }
  }, [mediaRecorder.current]);

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current) {
      if (mediaRecorder.current.state !== "inactive") {
        setStatus("stopping");
        mediaRecorder.current.stop();
        if (stopStreamsOnStop) {
          mediaStream.current &&
            mediaStream.current.getTracks().forEach((track) => track.stop());
        }
        mediaChunks.current = [];
      }
    }
  }, [mediaRecorder.current, setStatus, stopStreamsOnStop]);

  return useMemo(() => {
    return {
      error: RecorderErrors[error],
      muteAudio: () => muteAudio(true),
      unMuteAudio: () => muteAudio(false),
      startRecording,
      pauseRecording,
      resumeRecording,
      stopRecording,
      mediaBlobUrl,
      status,
      isAudioMuted,
      previewStream: mediaStream.current,
      clearBlobUrl: () => setMediaBlobUrl(null),
    };
  }, [
    error,
    muteAudio,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    mediaBlobUrl,
    status,
    isAudioMuted,
    mediaStream,
    setMediaBlobUrl,
  ]);
}

export const ReactMediaRecorder = (props: ReactMediaRecorderProps) =>
  props.render(useReactMediaRecorder(props));
