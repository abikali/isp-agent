"use client";

import { DetailSection } from "@shared/components/DetailPanel";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@ui/components/alert-dialog";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import {
	CopyIcon,
	MapPinIcon,
	MoreVerticalIcon,
	NavigationIcon,
	PencilIcon,
	TrashIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	useClearCustomerLocation,
	useCreateLocationRequest,
	useUpdateCustomerLocation,
} from "../hooks/use-customers";
import {
	formatLocationRequestAge,
	isLocationRequestRecent,
} from "../lib/location-utils";

interface CustomerLocationSectionProps {
	organizationId: string;
	customerId: string;
	latitude: number | null;
	longitude: number | null;
	locationRequestedAt: Date | string | null;
}

export function CustomerLocationSection({
	organizationId,
	customerId,
	latitude,
	longitude,
	locationRequestedAt,
}: CustomerLocationSectionProps) {
	const createRequest = useCreateLocationRequest();
	const updateLocation = useUpdateCustomerLocation();
	const clearLocation = useClearCustomerLocation();

	const [editOpen, setEditOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [confirmReRequestOpen, setConfirmReRequestOpen] = useState(false);
	const [latInput, setLatInput] = useState("");
	const [lngInput, setLngInput] = useState("");

	const hasLocation =
		typeof latitude === "number" && typeof longitude === "number";
	const requestedLabel = formatLocationRequestAge(locationRequestedAt);

	function openEdit() {
		setLatInput(latitude != null ? String(latitude) : "");
		setLngInput(longitude != null ? String(longitude) : "");
		setEditOpen(true);
	}

	function doRequest() {
		createRequest.mutate(
			{ organizationId, customerId },
			{
				onSuccess: (result) => {
					if (result.whatsappSent) {
						toast.success("Location request sent on WhatsApp");
					} else {
						toast.warning(
							"Link created but WhatsApp send failed — check WPBox config",
						);
					}
				},
				onError: (err) => toast.error(err.message),
			},
		);
	}

	function handleRequestClick() {
		if (isLocationRequestRecent(locationRequestedAt)) {
			setConfirmReRequestOpen(true);
			return;
		}
		doRequest();
	}

	function handleSaveEdit() {
		const lat = Number.parseFloat(latInput);
		const lng = Number.parseFloat(lngInput);
		if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
			toast.error("Latitude must be between -90 and 90");
			return;
		}
		if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
			toast.error("Longitude must be between -180 and 180");
			return;
		}
		updateLocation.mutate(
			{ organizationId, customerId, latitude: lat, longitude: lng },
			{
				onSuccess: () => {
					toast.success("Location updated");
					setEditOpen(false);
				},
				onError: (err) => toast.error(err.message),
			},
		);
	}

	function handleDelete() {
		clearLocation.mutate(
			{ organizationId, customerId },
			{
				onSuccess: () => {
					toast.success("Location cleared");
					setDeleteOpen(false);
				},
				onError: (err) => toast.error(err.message),
			},
		);
	}

	return (
		<DetailSection
			title="Location"
			description={
				hasLocation
					? "GPS coordinates from last known location"
					: "No GPS coordinates on file"
			}
		>
			{hasLocation ? (
				<div className="flex items-center gap-3">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
						<MapPinIcon className="size-4 text-primary" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="text-sm font-medium tabular-nums">
							{latitude?.toFixed(6)}, {longitude?.toFixed(6)}
						</p>
						{requestedLabel && (
							<p className="text-xs text-muted-foreground">
								Last requested {requestedLabel}
							</p>
						)}
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<Button variant="outline" size="sm" asChild>
							<a
								href={`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`}
								target="_blank"
								rel="noopener noreferrer"
							>
								<NavigationIcon className="mr-1.5 size-3.5" />
								Directions
							</a>
						</Button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="outline"
									size="sm"
									className="size-8 p-0"
								>
									<MoreVerticalIcon className="size-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onClick={openEdit}>
									<PencilIcon className="mr-2 size-4" />
									Edit coordinates
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() => {
										void navigator.clipboard.writeText(
											`${latitude},${longitude}`,
										);
										toast.success("Coordinates copied");
									}}
								>
									<CopyIcon className="mr-2 size-4" />
									Copy coordinates
								</DropdownMenuItem>
								<DropdownMenuItem onClick={handleRequestClick}>
									<MapPinIcon className="mr-2 size-4" />
									Re-request from customer
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									className="text-destructive focus:text-destructive"
									onClick={() => setDeleteOpen(true)}
								>
									<TrashIcon className="mr-2 size-4" />
									Clear location
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
			) : (
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="min-w-0">
						<p className="text-sm text-muted-foreground">
							Send the customer a WhatsApp link to share their
							location, or enter the coordinates manually.
						</p>
						{requestedLabel && (
							<p className="mt-1 text-xs text-muted-foreground">
								Last requested {requestedLabel}
							</p>
						)}
					</div>
					<div className="flex shrink-0 flex-wrap gap-2">
						<Button variant="outline" size="sm" onClick={openEdit}>
							<PencilIcon className="mr-1.5 size-3.5" />
							Set manually
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={createRequest.isPending}
							onClick={handleRequestClick}
						>
							<MapPinIcon className="mr-1.5 size-3.5" />
							{createRequest.isPending
								? "Sending…"
								: "Request location"}
						</Button>
					</div>
				</div>
			)}

			<Dialog open={editOpen} onOpenChange={setEditOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{hasLocation
								? "Edit coordinates"
								: "Set coordinates"}
						</DialogTitle>
						<DialogDescription>
							Enter latitude and longitude. Decimal degrees (e.g.
							33.8938, 35.5018 for Beirut).
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-3 sm:grid-cols-2">
						<div>
							<Label htmlFor="loc-lat">Latitude</Label>
							<Input
								id="loc-lat"
								type="number"
								step="any"
								inputMode="decimal"
								value={latInput}
								onChange={(e) => setLatInput(e.target.value)}
								placeholder="33.8938"
							/>
						</div>
						<div>
							<Label htmlFor="loc-lng">Longitude</Label>
							<Input
								id="loc-lng"
								type="number"
								step="any"
								inputMode="decimal"
								value={lngInput}
								onChange={(e) => setLngInput(e.target.value)}
								placeholder="35.5018"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setEditOpen(false)}
						>
							Cancel
						</Button>
						<Button
							onClick={handleSaveEdit}
							disabled={updateLocation.isPending}
						>
							{updateLocation.isPending ? "Saving…" : "Save"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Clear location?</AlertDialogTitle>
						<AlertDialogDescription>
							Removes the GPS coordinates from this customer. You
							can always set them again manually or request from
							the customer.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDelete}
							disabled={clearLocation.isPending}
						>
							Clear
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={confirmReRequestOpen}
				onOpenChange={setConfirmReRequestOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Re-request location?
						</AlertDialogTitle>
						<AlertDialogDescription>
							You already requested this customer's location{" "}
							{requestedLabel}. Sending another WhatsApp now may
							feel like spam — continue anyway?
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								setConfirmReRequestOpen(false);
								doRequest();
							}}
						>
							Send anyway
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</DetailSection>
	);
}
