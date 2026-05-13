-- CreateTable
CREATE TABLE "user_pref" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pref_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_view" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_view_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_pref_userId_idx" ON "user_pref"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_pref_userId_key_key" ON "user_pref"("userId", "key");

-- CreateIndex
CREATE INDEX "saved_view_userId_organizationId_resource_idx" ON "saved_view"("userId", "organizationId", "resource");

-- CreateIndex
CREATE INDEX "saved_view_organizationId_idx" ON "saved_view"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "saved_view_userId_organizationId_resource_name_key" ON "saved_view"("userId", "organizationId", "resource", "name");

-- AddForeignKey
ALTER TABLE "user_pref" ADD CONSTRAINT "user_pref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
