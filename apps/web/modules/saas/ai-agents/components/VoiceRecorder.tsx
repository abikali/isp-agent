// biome-ignore-all lint/correctness/useExhaustiveDependencies: the recording effect is intentionally mount-only (re-running would restart audio capture)
"use client";

import { Button } from "@ui/components/button";
import { cn } from "@ui/lib";
import { MicIcon, SendIcon, TrashIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface VoiceRecorderProps {
	onRecordingComplete: (blob: Blob) => void;
	onCancel: () => void;
}

function formatDuration(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VoiceRecorder({
	onRecordingComplete,
	onCancel,
}: VoiceRecorderProps) {
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const [isRecording, setIsRecording] = useState(false);
	const [duration, setDuration] = useState(0);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const startRecording = useCallback(async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
			});
			// Prefer OGG/Opus (WhatsApp native format, no remux needed)
			// Fall back to WebM/Opus (Chrome) — server remuxes to OGG before sending
			const mimeType = MediaRecorder.isTypeSupported(
				"audio/ogg;codecs=opus",
			)
				? "audio/ogg;codecs=opus"
				: "audio/webm;codecs=opus";
			const mediaRecorder = new MediaRecorder(stream, { mimeType });
			mediaRecorderRef.current = mediaRecorder;
			chunksRef.current = [];

			mediaRecorder.ondataavailable = (e) => {
				if (e.data.size > 0) {
					chunksRef.current.push(e.data);
				}
			};

			mediaRecorder.start();
			setIsRecording(true);
			setDuration(0);

			intervalRef.current = setInterval(() => {
				setDuration((d) => d + 1);
			}, 1000);
		} catch {
			onCancel();
		}
	}, [onCancel]);

	// Start recording on mount
	// react-doctor-disable-next-line react-doctor/exhaustive-deps -- mount-only recording effect; re-running would restart the recording
	useEffect(() => {
		// react-doctor-disable-next-line react-doctor/no-initialize-state -- startRecording is an async side effect (getUserMedia), not derivable initial state
		startRecording();
		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
			}
			if (mediaRecorderRef.current) {
				const tracks = mediaRecorderRef.current.stream.getTracks();
				for (const track of tracks) {
					track.stop();
				}
			}
		};
		// react-doctor-disable-next-line react-doctor/exhaustive-deps -- mount-only; re-running would restart the recording
	}, []);

	function stopAndSend() {
		const recorder = mediaRecorderRef.current;
		if (!recorder) {
			return;
		}

		recorder.onstop = () => {
			const blob = new Blob(chunksRef.current, {
				type: recorder.mimeType,
			});
			onRecordingComplete(blob);
			const tracks = recorder.stream.getTracks();
			for (const track of tracks) {
				track.stop();
			}
		};

		recorder.stop();
		setIsRecording(false);
		if (intervalRef.current) {
			clearInterval(intervalRef.current);
		}
	}

	function cancelRecording() {
		const recorder = mediaRecorderRef.current;
		if (recorder && recorder.state !== "inactive") {
			recorder.stop();
			const tracks = recorder.stream.getTracks();
			for (const track of tracks) {
				track.stop();
			}
		}
		if (intervalRef.current) {
			clearInterval(intervalRef.current);
		}
		onCancel();
	}

	return (
		<div className="flex items-center gap-2">
			<Button
				variant="ghost"
				size="icon"
				className="size-9 shrink-0 text-destructive"
				onClick={cancelRecording}
			>
				<TrashIcon className="size-4" />
			</Button>

			<div className="flex flex-1 items-center gap-2">
				<MicIcon
					className={cn(
						"size-4 text-destructive",
						isRecording && "animate-pulse",
					)}
				/>
				<span className="text-sm font-medium tabular-nums text-destructive">
					{formatDuration(duration)}
				</span>

				{/* Simple waveform animation */}
				<div className="flex items-center gap-px">
					{Array.from({ length: 20 }, (_, i) => (
						<div
							key={i}
							className="w-0.5 rounded-full bg-destructive/50"
							style={{
								height: `${6 + Math.sin(i) * 6}px`,
								animation: isRecording
									? `pulse 0.5s ease-in-out ${i * 50}ms infinite alternate`
									: "none",
							}}
						/>
					))}
				</div>
			</div>

			<Button
				size="icon"
				className="size-9 shrink-0 rounded-full"
				onClick={stopAndSend}
			>
				<SendIcon className="size-4" />
			</Button>
		</div>
	);
}
