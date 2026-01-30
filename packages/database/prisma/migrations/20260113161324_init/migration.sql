-- Enable pgvector extension for vector similarity search
-- Must be created before any tables that use the vector type
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "PurchaseType" AS ENUM ('SUBSCRIPTION', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('NFC_PVC_CARD', 'NFC_BAMBOO_CARD', 'NFC_METAL_CARD', 'NFC_PHONE_PIN');

-- CreateEnum
CREATE TYPE "ProductMaterial" AS ENUM ('PVC', 'BAMBOO', 'METAL', 'PLASTIC');

-- CreateEnum
CREATE TYPE "ProductColor" AS ENUM ('BLACK', 'WHITE', 'GOLD', 'SILVER', 'DARK', 'LIGHT');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'ACTIVE', 'INACTIVE', 'LOST');

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "password" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_lockout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlocksAt" TIMESTAMP(3) NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "unlockedAt" TIMESTAMP(3),
    "unlockedBy" TEXT,

    CONSTRAINT "account_lockout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_key" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "permissions" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "organizationId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulk_operation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "totalItems" INTEGER NOT NULL,
    "processedItems" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "input" JSONB,
    "result" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bulk_operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "percentage" INTEGER NOT NULL DEFAULT 100,
    "targetUsers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetOrgs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "status" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "inviterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "known_device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceFingerprint" TEXT NOT NULL,
    "deviceName" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "known_device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leadsInApp" BOOLEAN NOT NULL DEFAULT true,
    "teamInApp" BOOLEAN NOT NULL DEFAULT true,
    "analyticsInApp" BOOLEAN NOT NULL DEFAULT true,
    "securityInApp" BOOLEAN NOT NULL DEFAULT true,
    "leadsEmail" BOOLEAN NOT NULL DEFAULT true,
    "teamEmail" BOOLEAN NOT NULL DEFAULT true,
    "analyticsEmail" BOOLEAN NOT NULL DEFAULT false,
    "securityEmail" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "logo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "paymentsCustomerId" TEXT,
    "aiDefaultPersona" TEXT,
    "aiDefaultGreeting" TEXT,
    "aiProfileLimit" INTEGER,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_role" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passkey" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "publicKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialID" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL,
    "transports" TEXT,
    "aaguid" TEXT,
    "createdAt" TIMESTAMP(3),

    CONSTRAINT "passkey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "jobTitle" TEXT,
    "company" TEXT,
    "location" TEXT,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "coverPhotoUrl" TEXT,
    "companyLogoUrl" TEXT,
    "themeConfig" JSONB,
    "qrConfig" JSONB,
    "leadCaptureEnabled" BOOLEAN NOT NULL DEFAULT false,
    "leadCaptureConfig" JSONB,
    "followUpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "followUpConfig" JSONB,
    "analyticsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "analyticsConfig" JSONB,
    "vcardEnabled" BOOLEAN NOT NULL DEFAULT true,
    "vcardConfig" JSONB,
    "aiChatbotEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiChatbotConfig" JSONB,
    "aiModel" TEXT,
    "aiMonthlyUsed" INTEGER NOT NULL DEFAULT 0,
    "aiMonthlyLimit" INTEGER,
    "leadCaptureOnlyMode" BOOLEAN NOT NULL DEFAULT false,
    "singleLinkRedirectMode" BOOLEAN NOT NULL DEFAULT false,
    "redirectLinkId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_template" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "themeConfig" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_lead" (
    "id" TEXT NOT NULL,
    "profileId" TEXT,
    "organizationId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "message" TEXT,
    "customFields" JSONB,
    "source" TEXT DEFAULT 'lead_capture',
    "referrer" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "followUpSentAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'new',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_link" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "linkType" TEXT NOT NULL,
    "title" TEXT,
    "value" TEXT NOT NULL,
    "icon" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "userId" TEXT,
    "type" "PurchaseType" NOT NULL,
    "customerId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "productId" TEXT NOT NULL,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "impersonatedBy" TEXT,
    "activeOrganizationId" TEXT,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factor" (
    "id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "two_factor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_quota" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "userId" TEXT,
    "quotaType" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "limit" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_quota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "username" TEXT,
    "role" TEXT,
    "banned" BOOLEAN,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),
    "onboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "paymentsCustomerId" TEXT,
    "locale" TEXT,
    "displayUsername" TEXT,
    "twoFactorEnabled" BOOLEAN,
    "deletionScheduledAt" TIMESTAMP(3),
    "deletionReason" TEXT,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_delivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "statusCode" INTEGER,
    "response" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_connection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "providerConfigKey" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "name" TEXT,
    "providerName" TEXT NOT NULL,
    "syncMode" TEXT NOT NULL DEFAULT 'manual',
    "autoSyncEvents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'connected',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_sync_operation" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "trigger" TEXT,
    "totalContacts" INTEGER NOT NULL,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "result" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_sync_operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_catalog" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "ProductCategory" NOT NULL,
    "material" "ProductMaterial" NOT NULL,
    "color" "ProductColor" NOT NULL,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "nfcUid" TEXT,
    "shortCode" TEXT,
    "organizationId" TEXT,
    "assignedUserId" TEXT,
    "linkedProfileId" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "activatedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_analytics_event" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fingerprint" JSONB,
    "visitorId" TEXT,
    "userAgent" TEXT,
    "screenWidth" INTEGER,
    "screenHeight" INTEGER,
    "viewportWidth" INTEGER,
    "viewportHeight" INTEGER,
    "language" TEXT,
    "timezone" TEXT,
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "deviceType" TEXT,
    "connectionType" TEXT,
    "doNotTrack" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geoAccuracy" DOUBLE PRECISION,
    "address" TEXT,
    "linkId" TEXT,
    "linkType" TEXT,
    "linkUrl" TEXT,
    "pageLoadTime" INTEGER,
    "timeOnPage" INTEGER,
    "entryMethod" TEXT,
    "scrollDepth" INTEGER,
    "engagementTime" INTEGER,
    "isReturning" BOOLEAN NOT NULL DEFAULT false,
    "browserName" TEXT,
    "browserVersion" TEXT,
    "osName" TEXT,
    "osVersion" TEXT,
    "hourOfDay" INTEGER,
    "dayOfWeek" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_analytics_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geocoding_job" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "result" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "geocoding_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_session" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "visitorId" TEXT,
    "fingerprint" JSONB,
    "leadId" TEXT,
    "visitorIntent" TEXT,
    "summary" TEXT,
    "qualificationScore" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "chatbot_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_message" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "capturedData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chatbot_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_document" (
    "id" TEXT NOT NULL,
    "profileId" TEXT,
    "organizationId" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "embedding" vector(1536),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "crawlJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatbot_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_credit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "totalCredits" INTEGER NOT NULL DEFAULT 0,
    "usedCredits" INTEGER NOT NULL DEFAULT 0,
    "monthlyAllocation" INTEGER NOT NULL DEFAULT 0,
    "monthlyUsed" INTEGER NOT NULL DEFAULT 0,
    "monthlyResetAt" TIMESTAMP(3) NOT NULL,
    "bonusCredits" INTEGER NOT NULL DEFAULT 0,
    "bonusUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_credit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_credit_transaction" (
    "id" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "description" TEXT,
    "usageEventId" TEXT,
    "purchaseId" TEXT,
    "promoCode" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_credit_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_event" (
    "id" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "profileId" TEXT,
    "sessionId" TEXT,
    "operation" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cachedTokens" INTEGER NOT NULL DEFAULT 0,
    "creditsCharged" INTEGER NOT NULL,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_lockout_userId_key" ON "account_lockout"("userId");

-- CreateIndex
CREATE INDEX "account_lockout_unlocksAt_idx" ON "account_lockout"("unlocksAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_key_keyHash_key" ON "api_key"("keyHash");

-- CreateIndex
CREATE INDEX "api_key_createdById_idx" ON "api_key"("createdById");

-- CreateIndex
CREATE INDEX "api_key_keyHash_idx" ON "api_key"("keyHash");

-- CreateIndex
CREATE INDEX "api_key_organizationId_idx" ON "api_key"("organizationId");

-- CreateIndex
CREATE INDEX "audit_log_action_idx" ON "audit_log"("action");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "audit_log_organizationId_idx" ON "audit_log"("organizationId");

-- CreateIndex
CREATE INDEX "audit_log_resourceType_idx" ON "audit_log"("resourceType");

-- CreateIndex
CREATE INDEX "audit_log_userId_idx" ON "audit_log"("userId");

-- CreateIndex
CREATE INDEX "bulk_operation_organizationId_idx" ON "bulk_operation"("organizationId");

-- CreateIndex
CREATE INDEX "bulk_operation_userId_idx" ON "bulk_operation"("userId");

-- CreateIndex
CREATE INDEX "bulk_operation_status_idx" ON "bulk_operation"("status");

-- CreateIndex
CREATE INDEX "bulk_operation_createdAt_idx" ON "bulk_operation"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flag_key_key" ON "feature_flag"("key");

-- CreateIndex
CREATE INDEX "invitation_organizationId_idx" ON "invitation"("organizationId");

-- CreateIndex
CREATE INDEX "invitation_email_idx" ON "invitation"("email");

-- CreateIndex
CREATE INDEX "invitation_inviterId_idx" ON "invitation"("inviterId");

-- CreateIndex
CREATE INDEX "invitation_expiresAt_idx" ON "invitation"("expiresAt");

-- CreateIndex
CREATE INDEX "known_device_userId_idx" ON "known_device"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "known_device_userId_deviceFingerprint_key" ON "known_device"("userId", "deviceFingerprint");

-- CreateIndex
CREATE INDEX "login_attempt_email_createdAt_idx" ON "login_attempt"("email", "createdAt");

-- CreateIndex
CREATE INDEX "login_attempt_ipAddress_idx" ON "login_attempt"("ipAddress");

-- CreateIndex
CREATE INDEX "login_attempt_userId_idx" ON "login_attempt"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "member_organizationId_userId_key" ON "member"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "notification_createdAt_idx" ON "notification"("createdAt");

-- CreateIndex
CREATE INDEX "notification_userId_read_idx" ON "notification"("userId", "read");

-- CreateIndex
CREATE INDEX "notification_userId_category_idx" ON "notification"("userId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preference_userId_key" ON "notification_preference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "organization_role_organizationId_role_key" ON "organization_role"("organizationId", "role");

-- CreateIndex
CREATE INDEX "passkey_userId_idx" ON "passkey"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "profile_username_key" ON "profile"("username");

-- CreateIndex
CREATE UNIQUE INDEX "profile_redirectLinkId_key" ON "profile"("redirectLinkId");

-- CreateIndex
CREATE INDEX "profile_createdById_idx" ON "profile"("createdById");

-- CreateIndex
CREATE INDEX "profile_organizationId_idx" ON "profile"("organizationId");

-- CreateIndex
CREATE INDEX "profile_username_idx" ON "profile"("username");

-- CreateIndex
CREATE INDEX "profile_template_organizationId_idx" ON "profile_template"("organizationId");

-- CreateIndex
CREATE INDEX "profile_template_createdById_idx" ON "profile_template"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "profile_template_organizationId_name_key" ON "profile_template"("organizationId", "name");

-- CreateIndex
CREATE INDEX "profile_lead_email_idx" ON "profile_lead"("email");

-- CreateIndex
CREATE INDEX "profile_lead_createdAt_idx" ON "profile_lead"("createdAt");

-- CreateIndex
CREATE INDEX "profile_lead_profileId_idx" ON "profile_lead"("profileId");

-- CreateIndex
CREATE INDEX "profile_lead_organizationId_idx" ON "profile_lead"("organizationId");

-- CreateIndex
CREATE INDEX "profile_lead_status_idx" ON "profile_lead"("status");

-- CreateIndex
CREATE INDEX "profile_link_profileId_idx" ON "profile_link"("profileId");

-- CreateIndex
CREATE INDEX "profile_link_sortOrder_idx" ON "profile_link"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_subscriptionId_key" ON "purchase"("subscriptionId");

-- CreateIndex
CREATE INDEX "purchase_organizationId_idx" ON "purchase"("organizationId");

-- CreateIndex
CREATE INDEX "purchase_userId_idx" ON "purchase"("userId");

-- CreateIndex
CREATE INDEX "purchase_subscriptionId_idx" ON "purchase"("subscriptionId");

-- CreateIndex
CREATE INDEX "purchase_customerId_idx" ON "purchase"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "two_factor_userId_idx" ON "two_factor"("userId");

-- CreateIndex
CREATE INDEX "usage_quota_organizationId_idx" ON "usage_quota"("organizationId");

-- CreateIndex
CREATE INDEX "usage_quota_quotaType_idx" ON "usage_quota"("quotaType");

-- CreateIndex
CREATE INDEX "usage_quota_userId_idx" ON "usage_quota"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "usage_quota_organizationId_quotaType_key" ON "usage_quota"("organizationId", "quotaType");

-- CreateIndex
CREATE UNIQUE INDEX "usage_quota_userId_quotaType_key" ON "usage_quota"("userId", "quotaType");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE INDEX "webhook_organizationId_idx" ON "webhook"("organizationId");

-- CreateIndex
CREATE INDEX "webhook_delivery_createdAt_idx" ON "webhook_delivery"("createdAt");

-- CreateIndex
CREATE INDEX "webhook_delivery_webhookId_idx" ON "webhook_delivery"("webhookId");

-- CreateIndex
CREATE INDEX "integration_connection_organizationId_idx" ON "integration_connection"("organizationId");

-- CreateIndex
CREATE INDEX "integration_connection_createdById_idx" ON "integration_connection"("createdById");

-- CreateIndex
CREATE INDEX "integration_connection_status_idx" ON "integration_connection"("status");

-- CreateIndex
CREATE UNIQUE INDEX "integration_connection_organizationId_providerConfigKey_key" ON "integration_connection"("organizationId", "providerConfigKey");

-- CreateIndex
CREATE INDEX "contact_sync_operation_connectionId_idx" ON "contact_sync_operation"("connectionId");

-- CreateIndex
CREATE INDEX "contact_sync_operation_status_idx" ON "contact_sync_operation"("status");

-- CreateIndex
CREATE INDEX "contact_sync_operation_createdAt_idx" ON "contact_sync_operation"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "product_catalog_sku_key" ON "product_catalog"("sku");

-- CreateIndex
CREATE INDEX "product_catalog_category_idx" ON "product_catalog"("category");

-- CreateIndex
CREATE INDEX "product_catalog_isActive_idx" ON "product_catalog"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "product_serialNumber_key" ON "product"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "product_nfcUid_key" ON "product"("nfcUid");

-- CreateIndex
CREATE UNIQUE INDEX "product_shortCode_key" ON "product"("shortCode");

-- CreateIndex
CREATE INDEX "product_catalogId_idx" ON "product"("catalogId");

-- CreateIndex
CREATE INDEX "product_organizationId_idx" ON "product"("organizationId");

-- CreateIndex
CREATE INDEX "product_assignedUserId_idx" ON "product"("assignedUserId");

-- CreateIndex
CREATE INDEX "product_linkedProfileId_idx" ON "product"("linkedProfileId");

-- CreateIndex
CREATE INDEX "product_status_idx" ON "product"("status");

-- CreateIndex
CREATE INDEX "product_serialNumber_idx" ON "product"("serialNumber");

-- CreateIndex
CREATE INDEX "product_shortCode_idx" ON "product"("shortCode");

-- CreateIndex
CREATE INDEX "profile_analytics_event_profileId_idx" ON "profile_analytics_event"("profileId");

-- CreateIndex
CREATE INDEX "profile_analytics_event_sessionId_idx" ON "profile_analytics_event"("sessionId");

-- CreateIndex
CREATE INDEX "profile_analytics_event_visitorId_idx" ON "profile_analytics_event"("visitorId");

-- CreateIndex
CREATE INDEX "profile_analytics_event_eventType_idx" ON "profile_analytics_event"("eventType");

-- CreateIndex
CREATE INDEX "profile_analytics_event_createdAt_idx" ON "profile_analytics_event"("createdAt");

-- CreateIndex
CREATE INDEX "profile_analytics_event_profileId_eventType_idx" ON "profile_analytics_event"("profileId", "eventType");

-- CreateIndex
CREATE INDEX "profile_analytics_event_profileId_createdAt_idx" ON "profile_analytics_event"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "profile_analytics_event_profileId_eventType_createdAt_idx" ON "profile_analytics_event"("profileId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "profile_analytics_event_visitorId_profileId_idx" ON "profile_analytics_event"("visitorId", "profileId");

-- CreateIndex
CREATE UNIQUE INDEX "geocoding_job_eventId_key" ON "geocoding_job"("eventId");

-- CreateIndex
CREATE INDEX "geocoding_job_status_idx" ON "geocoding_job"("status");

-- CreateIndex
CREATE UNIQUE INDEX "chatbot_session_leadId_key" ON "chatbot_session"("leadId");

-- CreateIndex
CREATE INDEX "chatbot_session_profileId_idx" ON "chatbot_session"("profileId");

-- CreateIndex
CREATE INDEX "chatbot_session_visitorId_idx" ON "chatbot_session"("visitorId");

-- CreateIndex
CREATE INDEX "chatbot_session_startedAt_idx" ON "chatbot_session"("startedAt");

-- CreateIndex
CREATE INDEX "chatbot_message_sessionId_idx" ON "chatbot_message"("sessionId");

-- CreateIndex
CREATE INDEX "chatbot_message_createdAt_idx" ON "chatbot_message"("createdAt");

-- CreateIndex
CREATE INDEX "chatbot_document_profileId_idx" ON "chatbot_document"("profileId");

-- CreateIndex
CREATE INDEX "chatbot_document_organizationId_idx" ON "chatbot_document"("organizationId");

-- CreateIndex
CREATE INDEX "chatbot_document_sourceUrl_idx" ON "chatbot_document"("sourceUrl");

-- CreateIndex
CREATE INDEX "chatbot_document_status_idx" ON "chatbot_document"("status");

-- CreateIndex
CREATE INDEX "chatbot_document_crawlJobId_idx" ON "chatbot_document"("crawlJobId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_credit_organizationId_key" ON "ai_credit"("organizationId");

-- CreateIndex
CREATE INDEX "ai_credit_transaction_creditId_idx" ON "ai_credit_transaction"("creditId");

-- CreateIndex
CREATE INDEX "ai_credit_transaction_type_idx" ON "ai_credit_transaction"("type");

-- CreateIndex
CREATE INDEX "ai_credit_transaction_createdAt_idx" ON "ai_credit_transaction"("createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_event_creditId_idx" ON "ai_usage_event"("creditId");

-- CreateIndex
CREATE INDEX "ai_usage_event_profileId_idx" ON "ai_usage_event"("profileId");

-- CreateIndex
CREATE INDEX "ai_usage_event_operation_idx" ON "ai_usage_event"("operation");

-- CreateIndex
CREATE INDEX "ai_usage_event_createdAt_idx" ON "ai_usage_event"("createdAt");

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_lockout" ADD CONSTRAINT "account_lockout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_operation" ADD CONSTRAINT "bulk_operation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_operation" ADD CONSTRAINT "bulk_operation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "known_device" ADD CONSTRAINT "known_device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_attempt" ADD CONSTRAINT "login_attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_role" ADD CONSTRAINT "organization_role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile" ADD CONSTRAINT "profile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile" ADD CONSTRAINT "profile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile" ADD CONSTRAINT "profile_redirectLinkId_fkey" FOREIGN KEY ("redirectLinkId") REFERENCES "profile_link"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_template" ADD CONSTRAINT "profile_template_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_template" ADD CONSTRAINT "profile_template_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_lead" ADD CONSTRAINT "profile_lead_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_lead" ADD CONSTRAINT "profile_lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_lead" ADD CONSTRAINT "profile_lead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_link" ADD CONSTRAINT "profile_link_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase" ADD CONSTRAINT "purchase_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase" ADD CONSTRAINT "purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_quota" ADD CONSTRAINT "usage_quota_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_quota" ADD CONSTRAINT "usage_quota_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook" ADD CONSTRAINT "webhook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_connection" ADD CONSTRAINT "integration_connection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_connection" ADD CONSTRAINT "integration_connection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_sync_operation" ADD CONSTRAINT "contact_sync_operation_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "integration_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "product_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_linkedProfileId_fkey" FOREIGN KEY ("linkedProfileId") REFERENCES "profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_analytics_event" ADD CONSTRAINT "profile_analytics_event_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_analytics_event" ADD CONSTRAINT "profile_analytics_event_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "profile_link"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_session" ADD CONSTRAINT "chatbot_session_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_session" ADD CONSTRAINT "chatbot_session_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "profile_lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_message" ADD CONSTRAINT "chatbot_message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chatbot_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_document" ADD CONSTRAINT "chatbot_document_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_document" ADD CONSTRAINT "chatbot_document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_credit" ADD CONSTRAINT "ai_credit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_credit_transaction" ADD CONSTRAINT "ai_credit_transaction_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "ai_credit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_event" ADD CONSTRAINT "ai_usage_event_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "ai_credit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create IVFFlat index for fast cosine similarity search on embeddings
CREATE INDEX "chatbot_document_embedding_idx" ON "chatbot_document"
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
