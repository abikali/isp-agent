"use client";

import { cn } from "@ui/lib";
import { PauseIcon, PlayIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

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

/** Generate deterministic pseudo-random waveform heights (0..1) seeded by index */
function generateStaticBars(count: number): number[] {
	return Array.from({ length: count }, (_, i) => {
		const seed = Math.sin(i * 127.1 + 311.7) * 43758.5453;
		const pseudo = seed - Math.floor(seed);
		return 0.15 + Math.sin(i * 0.5) * 0.25 + pseudo * 0.35;
	});
}

// Cache audio contexts per element to avoid re-connecting
const connectedElements = new WeakSet<HTMLAudioElement>();

// Deterministic fallback waveform — same for every bubble, computed once.
const STATIC_BARS = generateStaticBars(BAR_COUNT);

// react-doctor-disable-next-line react-doctor/prefer-useReducer -- cohesive audio-player component; the playback values are independent slices, a reducer would obscure them
export function AudioBubble({ url, duration }: AudioBubbleProps) {
	const audioRef = useRef<HTMLAudioElement>(null);
	const waveformRef = useRef<HTMLDivElement>(null);
	const analyserRef = useRef<AnalyserNode | null>(null);
	const animFrameRef = useRef<number>(0);

	const [isPlaying, setIsPlaying] = useState(false);
	const [progress, setProgress] = useState(0);
	const [currentTime, setCurrentTime] = useState(0);
	const [audioDuration, setAudioDuration] = useState(duration ?? 0);
	const [speedIndex, setSpeedIndex] = useState(0);
	// Drag state is only read inside event handlers, never in render
	const isDraggingRef = useRef(false);

	// Live waveform bars (updated by analyser during playback)
	const [liveBars, setLiveBars] = useState<number[] | null>(null);
	// Snapshot of the waveform when paused (freezes the last live state)
	const snapshotRef = useRef<number[] | null>(null);

	const playbackSpeed = SPEED_OPTIONS[speedIndex] ?? 1;

	// Connect AnalyserNode to audio element on first play
	const ensureAnalyser = useCallback(() => {
		const audio = audioRef.current;
		if (!audio || connectedElements.has(audio)) {
			return;
		}
		try {
			const ctx = new AudioContext();
			const source = ctx.createMediaElementSource(audio);
			const analyser = ctx.createAnalyser();
			analyser.fftSize = 256;
			source.connect(analyser);
			analyser.connect(ctx.destination);
			analyserRef.current = analyser;
			connectedElements.add(audio);
		} catch {
			// Fallback: analyser won't be available
		}
	}, []);

	// Animation loop: read frequency data while playing
	useEffect(() => {
		if (!isPlaying) {
			cancelAnimationFrame(animFrameRef.current);
			return;
		}

		const analyser = analyserRef.current;
		if (!analyser) {
			return;
		}

		const dataArray = new Uint8Array(analyser.frequencyBinCount);

		function tick() {
			if (!analyser) {
				return;
			}
			analyser.getByteFrequencyData(dataArray);

			// Map frequency bins to our bar count
			const binsPerBar = Math.floor(dataArray.length / BAR_COUNT);
			const bars: number[] = [];
			for (let i = 0; i < BAR_COUNT; i++) {
				let sum = 0;
				for (let j = 0; j < binsPerBar; j++) {
					sum += dataArray[i * binsPerBar + j] ?? 0;
				}
				bars.push(sum / binsPerBar / 255); // normalize 0..1
			}
			setLiveBars(bars);
			snapshotRef.current = bars;
			animFrameRef.current = requestAnimationFrame(tick);
		}

		animFrameRef.current = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(animFrameRef.current);
		};
	}, [isPlaying]);

	// Determine which bars to render
	const displayBars = isPlaying
		? (liveBars ?? STATIC_BARS)
		: (snapshotRef.current ?? STATIC_BARS);

	const togglePlay = useCallback(() => {
		const audio = audioRef.current;
		if (!audio) {
			return;
		}
		ensureAnalyser();
		if (isPlaying) {
			audio.pause();
		} else {
			audio.play();
		}
	}, [isPlaying, ensureAnalyser]);

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
		if (!audio || !audio.duration || isDraggingRef.current) {
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
			isDraggingRef.current = true;
			(e.target as HTMLElement).setPointerCapture(e.pointerId);
			seekFromEvent(e.clientX);
		},
		[seekFromEvent],
	);

	const handlePointerMove = useCallback(
		(e: React.PointerEvent) => {
			if (!isDraggingRef.current) {
				return;
			}
			seekFromEvent(e.clientX);
		},
		[seekFromEvent],
	);

	const handlePointerUp = useCallback(() => {
		isDraggingRef.current = false;
	}, []);

	const displayTime =
		isPlaying || currentTime > 0 ? currentTime : audioDuration;

	const timeLabel =
		isPlaying && audioDuration > 0
			? `-${formatTime(audioDuration - currentTime)}`
			: formatTime(displayTime);

	return (
		<div className="flex items-center gap-2.5 min-w-[220px]">
			{/* react-doctor-disable-next-line react-doctor/media-has-caption -- chat voice notes have no captions track to attach */}
			{/* biome-ignore lint/a11y/useMediaCaption: chat voice notes don't have captions */}
			<audio
				ref={audioRef}
				aria-label="Voice message"
				src={url}
				crossOrigin="anonymous"
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
						{displayBars.map((amplitude, i) => {
							const barProgress = (i / BAR_COUNT) * 100;
							const filled = barProgress < progress;
							const minHeight = 3;
							const maxHeight = 28;
							const height =
								minHeight + amplitude * (maxHeight - minHeight);
							return (
								<div
									key={i}
									className="rounded-full"
									style={{
										width: `${BAR_WIDTH}px`,
										height: `${height}px`,
										backgroundColor: filled
											? "var(--primary)"
											: "color-mix(in srgb, var(--muted-foreground) 25%, transparent)",
										transition: isPlaying
											? "height 100ms ease-out"
											: "background-color 75ms",
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
