"use client";

import { Badge } from "@ui/components/badge";
import { Card, CardContent } from "@ui/components/card";
import { Input } from "@ui/components/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import { SearchIcon, UsersIcon, WifiIcon } from "lucide-react";
import { useState } from "react";
import { useAccessPoints } from "../hooks/use-access-points";

export function AccessPointsList() {
	const { accessPoints } = useAccessPoints();
	const [search, setSearch] = useState("");

	const filtered = search
		? accessPoints.filter(
				(ap) =>
					ap.name.toLowerCase().includes(search.toLowerCase()) ||
					ap.ipAddress
						?.toLowerCase()
						.includes(search.toLowerCase()) ||
					ap.macAddress
						?.toLowerCase()
						.includes(search.toLowerCase()) ||
					ap.station?.name
						?.toLowerCase()
						.includes(search.toLowerCase()),
			)
		: accessPoints;

	const onlineCount = accessPoints.filter((ap) => ap.online).length;

	return (
		<div>
			<div className="mb-6">
				<h1 className="text-2xl font-bold">Access Points</h1>
				<p className="text-muted-foreground">
					{accessPoints.length} access points ({onlineCount} online)
				</p>
			</div>

			<div className="mb-4">
				<div className="relative max-w-sm">
					<SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search by name, IP, MAC, or station..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-9"
					/>
				</div>
			</div>

			{filtered.length === 0 ? (
				<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
					<WifiIcon className="mb-3 size-10 text-muted-foreground" />
					<h3 className="mb-1 text-lg font-medium">
						{search
							? "No access points match your search"
							: "No access points yet"}
					</h3>
					<p className="text-sm text-muted-foreground">
						{search
							? "Try a different search term."
							: "Access points will appear here after syncing from iRadius."}
					</p>
				</div>
			) : (
				<Card>
					<CardContent className="p-0">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead className="hidden sm:table-cell">
										Station
									</TableHead>
									<TableHead className="hidden md:table-cell">
										IP Address
									</TableHead>
									<TableHead className="hidden lg:table-cell">
										Signal
									</TableHead>
									<TableHead className="hidden lg:table-cell">
										Board
									</TableHead>
									<TableHead>Status</TableHead>
									<TableHead className="text-right">
										Customers
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filtered.map((ap) => (
									<TableRow key={ap.id}>
										<TableCell>
											<div>
												<p className="font-medium">
													{ap.name}
												</p>
												{ap.macAddress && (
													<p className="font-mono text-xs text-muted-foreground">
														{ap.macAddress}
													</p>
												)}
											</div>
										</TableCell>
										<TableCell className="hidden text-sm sm:table-cell">
											{ap.station?.name ?? (
												<span className="text-muted-foreground">
													-
												</span>
											)}
										</TableCell>
										<TableCell className="hidden font-mono text-xs md:table-cell">
											{ap.ipAddress ?? "-"}
										</TableCell>
										<TableCell className="hidden text-sm lg:table-cell">
											{ap.signal ?? "-"}
										</TableCell>
										<TableCell className="hidden text-xs lg:table-cell">
											{ap.boardName ?? "-"}
										</TableCell>
										<TableCell>
											<Badge
												variant={
													ap.online
														? "default"
														: "destructive"
												}
											>
												{ap.online
													? "Online"
													: "Offline"}
											</Badge>
										</TableCell>
										<TableCell className="text-right">
											<span className="flex items-center justify-end gap-1 text-sm text-muted-foreground">
												<UsersIcon className="size-3" />
												{ap._count.customers}
											</span>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
