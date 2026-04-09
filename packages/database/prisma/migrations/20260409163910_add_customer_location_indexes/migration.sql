-- CreateIndex
CREATE INDEX "customer_organizationId_latitude_longitude_idx" ON "customer"("organizationId", "latitude", "longitude");

-- CreateIndex
CREATE INDEX "customer_organizationId_locationRequestedAt_idx" ON "customer"("organizationId", "locationRequestedAt");
