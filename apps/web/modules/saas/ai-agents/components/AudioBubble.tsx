"use client";

import { cn } from "@ui/lib";
import { PauseIcon, PlayIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface AudioBubbleProps {
	url: string;
	duration?: number | null | undefined;
}

const SPEED_OPTIONS = [1, 1.5, 2] as const;
const BAR_COUNT = 40;
const BAR_WIDTH = 2.5;

function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Generate deterministic pseudo-random waveform as fallback */
function generateFallbackWaveform(count: number): number[] {
	return Array.from({ length: count }, (_, i) => {
		const seed = Math.sin(i * 127.1 + 311.7) * 43758.5453;
		const pseudo = seed - Math.floor(seed);
		return 0.15 + Math.sin(i * 0.5) * 0.25 + pseudo * 0.35;
	});
}

/** Decode audio and extract waveform amplitudes */
async function extractWaveform(
	url: string,
	barCount: number,
): Promise<number[] | null> {
	try {
		const response = await fetch(url);
		if (!response.ok) {
			return null;
		}
		const arrayBuffer = await response.arrayBuffer();
		const audioContext = new AudioContext();
		const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
		const channelData = audioBuffer.getChannelData(0);
		await audioContext.close();

		const samplesPerBar = Math.floor(channelData.length / barCount);
		const bars: number[] = [];

		for (let i = 0; i < barCount; i++) {
			let sum = 0;
			const start = i * samplesPerBar;
			for (
				let j = start;
				j < start + samplesPerBar && j < channelData.length;
				j++
			) {
				sum += Math.abs(channelData[j] ?? 0);
			}
			bars.push(sum / samplesPerBar);
		}

		// Normalize to 0..1
		const max = Math.max(...bars, 0.01);
		return bars.map((b) => b / max);
	} catch {
		return null;
	}
}

export function AudioBubble({ url, duration }: AudioBubbleProps) {
	const audioRef = useRef<HTMLAudioElement>(null);
	const waveformRef = useRef<HTMLDivElement>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [progress, setProgress] = useState(0);
	const [currentTime, setCurrentTime] = useState(0);
	const [audioDuration, setAudioDuration] = useState(duration ?? 0);
	const [speedIndex, setSpeedIndex] = useState(0);
	const [waveform, setWaveform] = useState<number[] | null>(null);
	const [isDragging, setIsDragging] = useState(false);

	const playbackSpeed = SPEED_OPTIONS[speedIndex] ?? 1;

	// Extract real waveform from audio data
	useEffect(() => {
		let cancelled = false;
		extractWaveform(url, BAR_COUNT).then((data) => {
			if (!cancelled) {
				setWaveform(data);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [url]);

	const bars = useMemo(
		() => waveform ?? generateFallbackWaveform(BAR_COUNT),
		[waveform],
	);

	const togglePlay = useCallback(() => {
		const audio = audioRef.current;
		if (!audio) {
			return;
		}
		if (isPlaying) {
			audio.pause();
		} else {
			audio.play();
		}
	}, [isPlaying]);

	const cycleSpeed = useCallback(() => {
		const nextIndex = (speedIndex + 1) % SPEED_OPTIONS.length;
		setSpeedIndex(nextIndex);
		const audio = audioRef.current;
		if (audio) {
			audio.playbackRate = SPEED_OPTIONS[nextIndex] ?? 1;
		}
	}, [speedIndex]);

	function handleTimeUpdate() {
		const audio = audioRef.current;
		if (!audio || !audio.duration || isDragging) {
			return;
		}
		const pct = (audio.currentTime / audio.duration) * 100;
		setProgress(pct);
		setCurrentTime(audio.currentTime);
	}

	function handleLoadedMetadata() {
		const audio = audioRef.current;
		if (audio?.duration && Number.isFinite(audio.duration)) {
			setAudioDuration(audio.duration);
		}
	}

	// Seek by clicking/dragging on waveform
	const seekFromEvent = useCallback((clientX: number) => {
		const container = waveformRef.current;
		const audio = audioRef.current;
		if (!container || !audio || !audio.duration) {
			return;
		}
		const rect = container.getBoundingClientRect();
		const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
		const pct = x / rect.width;
		audio.currentTime = pct * audio.duration;
		setProgress(pct * 100);
		setCurrentTime(audio.currentTime);
	}, []);

	const handlePointerDown = useCallback(
		(e: React.PointerEvent) => {
			setIsDragging(true);
			(e.target as HTMLElement).setPointerCapture(e.pointerId);
			seekFromEvent(e.clientX);
		},
		[seekFromEvent],
	);

	const handlePointerMove = useCallback(
		(e: React.PointerEvent) => {
			if (!isDragging) {
				return;
			}
			seekFromEvent(e.clientX);
		},
		[isDragging, seekFromEvent],
	);

	const handlePointerUp = useCallback(() => {
		setIsDragging(false);
	}, []);

	const displayTime =
		isPlaying || currentTime > 0 ? currentTime : audioDuration;

	// Remaining time when playing
	const timeLabel =
		isPlaying && audioDuration > 0
			? `-${formatTime(audioDuration - currentTime)}`
			: formatTime(displayTime);

	return (
		<div className="flex items-center gap-2.5 min-w-[220px]">
			{/* biome-ignore lint/a11y/useMediaCaption: chat voice notes don't have captions */}
			<audio
				ref={audioRef}
				src={url}
				onPlay={() => setIsPlaying(true)}
				onPause={() => setIsPlaying(false)}
				onEnded={() => {
					setIsPlaying(false);
					setProgress(0);
					setCurrentTime(0);
				}}
				onTimeUpdate={handleTimeUpdate}
				onLoadedMetadata={handleLoadedMetadata}
				preload="metadata"
			/>

			{/* Play/Pause */}
			<button
				type="button"
				onClick={togglePlay}
				className={cn(
					"flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
					"bg-primary text-primary-foreground hover:bg-primary/90",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				)}
			>
				{isPlaying ? (
					<PauseIcon className="size-4 fill-current" />
				) : (
					<PlayIcon className="size-4 fill-current ml-0.5" />
				)}
			</button>

			{/* Waveform + time */}
			<div className="flex flex-1 flex-col gap-1">
				{/* Seekable waveform */}
				<div
					ref={waveformRef}
					className="relative flex h-8 cursor-pointer items-center touch-none"
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onPointerCancel={handlePointerUp}
				>
					<div className="flex h-full w-full items-center justify-between">
						{bars.map((amplitude, i) => {
							const barProgress = (i / BAR_COUNT) * 100;
							const filled = barProgress < progress;
							const minHeight = 3;
							const maxHeight = 28;
							const height =
								minHeight + amplitude * (maxHeight - minHeight);
							return (
								<div
									key={i}
									className="rounded-full transition-colors duration-75"
									style={{
										width: `${BAR_WIDTH}px`,
										height: `${height}px`,
										backgroundColor: filled
											? "hsl(var(--primary))"
											: "hsl(var(--muted-foreground) / 0.25)",
									}}
								/>
							);
						})}
					</div>

					{/* Seek dot indicator */}
					{(isPlaying || currentTime > 0) && (
						<div
							className="pointer-events-none absolute top-1/2 -translate-y-1/2 size-2.5 rounded-full bg-primary shadow-sm transition-[left] duration-75"
							style={{
								left: `calc(${progress}% - 5px)`,
							}}
						/>
					)}
				</div>

				{/* Time + speed */}
				<div className="flex items-center justify-between px-0.5">
					<span className="text-[10px] tabular-nums text-muted-foreground">
						{timeLabel}
					</span>

					{/* Playback speed toggle */}
					<button
						type="button"
						onClick={cycleSpeed}
						className={cn(
							"rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors",
							playbackSpeed === 1
								? "text-muted-foreground hover:text-foreground"
								: "bg-primary/10 text-primary hover:bg-primary/20",
						)}
					>
						{playbackSpeed}x
					</button>
				</div>
			</div>
		</div>
	);
}
