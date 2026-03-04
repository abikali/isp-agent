"use client";

import { Button } from "@ui/components/button";
import { PauseIcon, PlayIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface AudioBubbleProps {
	url: string;
	duration?: number | null | undefined;
}

export function AudioBubble({ url, duration }: AudioBubbleProps) {
	const audioRef = useRef<HTMLAudioElement>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [progress, setProgress] = useState(0);
	const [currentTime, setCurrentTime] = useState(0);

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

	function handleTimeUpdate() {
		const audio = audioRef.current;
		if (!audio || !audio.duration) {
			return;
		}
		setProgress((audio.currentTime / audio.duration) * 100);
		setCurrentTime(audio.currentTime);
	}

	function formatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, "0")}`;
	}

	const displayDuration = duration ?? 0;

	return (
		<div className="flex items-center gap-2">
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
				preload="metadata"
			/>

			<Button
				variant="ghost"
				size="icon"
				className="size-8 shrink-0 rounded-full"
				onClick={togglePlay}
			>
				{isPlaying ? (
					<PauseIcon className="size-4" />
				) : (
					<PlayIcon className="size-4" />
				)}
			</Button>

			{/* Waveform placeholder bars */}
			<div className="flex flex-1 items-center gap-px">
				{Array.from({ length: 30 }, (_, i) => {
					const barHeight =
						4 + Math.sin(i * 0.7) * 8 + Math.random() * 4;
					const filled = (i / 30) * 100 < progress;
					return (
						<div
							key={i}
							className="w-1 rounded-full transition-colors"
							style={{
								height: `${barHeight}px`,
								backgroundColor: filled
									? "hsl(var(--primary))"
									: "hsl(var(--muted-foreground) / 0.3)",
							}}
						/>
					);
				})}
			</div>

			<span className="shrink-0 text-[10px] text-muted-foreground">
				{isPlaying
					? formatTime(currentTime)
					: formatTime(displayDuration)}
			</span>
		</div>
	);
}
