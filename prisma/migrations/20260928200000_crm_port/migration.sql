-- CRM port from the the legacy CRM platform. Purely additive: 35 new Crm* tables, two enums, and one
-- nullable column on Employee. Nothing existing is altered or dropped; the old Lead table stays
-- in place until a later release retires it (expand/contract).


-- CreateEnum
CREATE TYPE "CrmLeadStatus" AS ENUM ('new', 'contacted', 'qualified', 'won', 'lost');

-- CreateEnum
CREATE TYPE "CrmLeadPriority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "telephonyExtension" TEXT;

-- CreateTable
CREATE TABLE "CrmPipeline" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmPipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmPipelineStage" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isWon" BOOLEAN NOT NULL DEFAULT false,
    "isLost" BOOLEAN NOT NULL DEFAULT false,
    "winProbability" INTEGER,
    "expectedDurationDays" INTEGER,
    CONSTRAINT "CrmPipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmStageGroup" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmStageGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmStageGroupStage" (
    "groupId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    CONSTRAINT "CrmStageGroupStage_pkey" PRIMARY KEY ("groupId","stageId")
);

-- CreateTable
CREATE TABLE "CrmTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    CONSTRAINT "CrmTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmTagOnLead" (
    "leadId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    CONSTRAINT "CrmTagOnLead_pkey" PRIMARY KEY ("leadId","tagId")
);

-- CreateTable
CREATE TABLE "CrmSourceConnection" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "connectedAccountLabel" TEXT,
    "lastReceivedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "webhookToken" TEXT NOT NULL,
    "fieldMapping" JSONB,
    "credentials" JSONB,
    "metaPageId" TEXT,
    "metaPageAccessToken" TEXT,
    "metaAppId" TEXT,
    "metaAppSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmSourceConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmLead" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL DEFAULT '',
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "city" TEXT,
    "company" TEXT,
    "jobTitle" TEXT,
    "country" TEXT DEFAULT 'India',
    "requirement" TEXT,
    "serviceInterest" TEXT,
    "budgetRange" TEXT,
    "services" TEXT[],
    "website" TEXT,
    "industry" TEXT,
    "legacyLeadId" TEXT,
    "phoneNormalized" TEXT,
    "emailNormalized" TEXT,
    "convertedClientId" TEXT,
    "source" TEXT NOT NULL,
    "otherSource" TEXT,
    "externalLeadId" TEXT,
    "sourceConnectionId" TEXT,
    "adDetail" JSONB,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "landingPage" TEXT,
    "referrerUrl" TEXT,
    "status" "CrmLeadStatus" NOT NULL DEFAULT 'new',
    "priority" "CrmLeadPriority" NOT NULL DEFAULT 'normal',
    "leadScore" INTEGER NOT NULL DEFAULT 0,
    "isStarred" BOOLEAN NOT NULL DEFAULT false,
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "receivedOutsideBusinessHours" BOOLEAN NOT NULL DEFAULT false,
    "pipelineId" TEXT,
    "pipelineStageId" TEXT,
    "stageEnteredAt" TIMESTAMP(3),
    "dealValue" INTEGER,
    "dealCurrency" TEXT,
    "expectedCloseDate" TIMESTAMP(3),
    "wonValue" INTEGER,
    "wonAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "lostAt" TIMESTAMP(3),
    "assignedUserId" TEXT,
    "assignedTeamId" TEXT,
    "assignedTo" TEXT,
    "notes" TEXT,
    "contactedAt" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmCustomField" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "options" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmCustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmCustomValue" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "CrmCustomValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmActivity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "userId" TEXT,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmNote" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmFollowUp" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "reminderAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "priority" "CrmLeadPriority" NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assignedUserId" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmStageHistoryEntry" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "fromStageName" TEXT,
    "toStageName" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmStageHistoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmAssignmentHistoryEntry" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmAssignmentHistoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmAutomation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "respectBusinessHours" BOOLEAN NOT NULL DEFAULT false,
    "triggerType" TEXT NOT NULL,
    "triggerConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmAutomationStep" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL,
    CONSTRAINT "CrmAutomationStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmAutomationCursor" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "dealt" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmAutomationCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmAutomationRun" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "automationName" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "nextStepIndex" INTEGER,
    "resumeAt" TIMESTAMP(3),
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmAutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmTelephonySettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "provider" TEXT NOT NULL DEFAULT 'airphone',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "baseUrl" TEXT NOT NULL DEFAULT 'https://airphone.in/api',
    "apiToken" TEXT,
    "virtualNumber" TEXT,
    "webhookToken" TEXT NOT NULL,
    "fallbackNumber" TEXT,
    "stickyRouting" BOOLEAN NOT NULL DEFAULT true,
    "outboundMode" TEXT NOT NULL DEFAULT 'c2c',
    "testRouteNumber" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmTelephonySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmTelephonyEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "request" JSONB,
    "response" JSONB,
    "errorMessage" TEXT,
    "callLogId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmTelephonyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmCallLog" (
    "id" TEXT NOT NULL,
    "uniqueId" TEXT,
    "requestId" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'incoming',
    "status" TEXT NOT NULL DEFAULT 'routing',
    "callerNumber" TEXT NOT NULL,
    "agentNumber" TEXT,
    "virtualNumber" TEXT,
    "leadId" TEXT,
    "agentUserId" TEXT,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "recordingUrl" TEXT,
    "recordingDurationSeconds" INTEGER NOT NULL DEFAULT 0,
    "dtmf" TEXT,
    "feedback" TEXT,
    "rawPayload" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmEmailSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "provider" TEXT NOT NULL DEFAULT 'brevo',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "apiKey" TEXT,
    "fromName" TEXT NOT NULL DEFAULT '',
    "fromEmail" TEXT NOT NULL DEFAULT '',
    "replyToEmail" TEXT NOT NULL DEFAULT '',
    "inboundWebhookToken" TEXT NOT NULL,
    "footerText" TEXT NOT NULL DEFAULT 'You are receiving this because you enquired with us.',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmEmailSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmEmailSuppression" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'unsubscribed',
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmEmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmWhatsAppAccount" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "displayPhone" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "wabaId" TEXT,
    "accessToken" TEXT,
    "appSecret" TEXT,
    "verifyToken" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "lastError" TEXT,
    "createLeadOnInbound" BOOLEAN NOT NULL DEFAULT true,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmWhatsAppAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmWhatsAppConversation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactName" TEXT,
    "leadId" TEXT,
    "assignedUserId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "lastInboundAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "intervened" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmWhatsAppConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmWhatsAppMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "direction" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "body" TEXT NOT NULL DEFAULT '',
    "mediaUrl" TEXT,
    "mediaMimeType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "error" TEXT,
    "sentByUserId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmWhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmIntegrationActivity" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "leadId" TEXT,
    "leadsCreated" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "rawPayload" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "CrmIntegrationActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmForm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayTitle" TEXT,
    "description" TEXT,
    "submitLabel" TEXT NOT NULL DEFAULT 'Submit',
    "thankYouMessage" TEXT,
    "redirectUrl" TEXT,
    "isMultiStep" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "pipelineId" TEXT,
    "pipelineStageId" TEXT,
    "assignedUserId" TEXT,
    "accentColor" TEXT NOT NULL DEFAULT '#C34245',
    "layout" TEXT NOT NULL DEFAULT 'card',
    "recaptchaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "recaptchaSiteKey" TEXT,
    "recaptchaSecretKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmFormField" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "placeholder" TEXT,
    "fieldKey" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CrmFormField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmFormSubmission" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "leadId" TEXT,
    "data" JSONB NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "pageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmFormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmBusinessHours" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "schedule" JSONB NOT NULL,
    "closedMessage" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmBusinessHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmAiSdrAgent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "goal" TEXT NOT NULL DEFAULT 'qualify_lead',
    "channel" TEXT NOT NULL DEFAULT 'email',
    "persona" TEXT,
    "offerContext" TEXT,
    "maxFollowUps" INTEGER NOT NULL DEFAULT 4,
    "minHoursBetweenFollowUps" INTEGER NOT NULL DEFAULT 24,
    "respectBusinessHours" BOOLEAN NOT NULL DEFAULT true,
    "handoffUserId" TEXT,
    "meetingType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmAiSdrAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmAiSdrEnrollment" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "followUpsSent" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "nextEligibleAt" TIMESTAMP(3),
    "handedOffAt" TIMESTAMP(3),
    "handedOffToUserId" TEXT,
    "stoppedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmAiSdrEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmAiSdrMessage" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author" TEXT NOT NULL DEFAULT 'human',
    "status" TEXT NOT NULL DEFAULT 'logged',
    "deliveryNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmAiSdrMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmPipelineStage_pipelineId_idx" ON "CrmPipelineStage"("pipelineId");

-- CreateIndex
CREATE INDEX "CrmStageGroup_pipelineId_idx" ON "CrmStageGroup"("pipelineId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmStageGroupStage_stageId_key" ON "CrmStageGroupStage"("stageId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmSourceConnection_webhookToken_key" ON "CrmSourceConnection"("webhookToken");

-- CreateIndex
CREATE UNIQUE INDEX "CrmLead_legacyLeadId_key" ON "CrmLead"("legacyLeadId");

-- CreateIndex
CREATE INDEX "CrmLead_sourceConnectionId_idx" ON "CrmLead"("sourceConnectionId");

-- CreateIndex
CREATE INDEX "CrmLead_status_idx" ON "CrmLead"("status");

-- CreateIndex
CREATE INDEX "CrmLead_createdAt_idx" ON "CrmLead"("createdAt");

-- CreateIndex
CREATE INDEX "CrmLead_lastActivityAt_idx" ON "CrmLead"("lastActivityAt");

-- CreateIndex
CREATE INDEX "CrmLead_phoneNormalized_idx" ON "CrmLead"("phoneNormalized");

-- CreateIndex
CREATE INDEX "CrmLead_emailNormalized_idx" ON "CrmLead"("emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCustomField_key_key" ON "CrmCustomField"("key");

-- CreateIndex
CREATE INDEX "CrmCustomValue_fieldId_value_idx" ON "CrmCustomValue"("fieldId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCustomValue_leadId_fieldId_key" ON "CrmCustomValue"("leadId", "fieldId");

-- CreateIndex
CREATE INDEX "CrmActivity_leadId_idx" ON "CrmActivity"("leadId");

-- CreateIndex
CREATE INDEX "CrmNote_leadId_idx" ON "CrmNote"("leadId");

-- CreateIndex
CREATE INDEX "CrmFollowUp_leadId_idx" ON "CrmFollowUp"("leadId");

-- CreateIndex
CREATE INDEX "CrmFollowUp_reminderSentAt_reminderAt_idx" ON "CrmFollowUp"("reminderSentAt", "reminderAt");

-- CreateIndex
CREATE INDEX "CrmStageHistoryEntry_leadId_idx" ON "CrmStageHistoryEntry"("leadId");

-- CreateIndex
CREATE INDEX "CrmAssignmentHistoryEntry_leadId_idx" ON "CrmAssignmentHistoryEntry"("leadId");

-- CreateIndex
CREATE INDEX "CrmAssignmentHistoryEntry_toUserId_idx" ON "CrmAssignmentHistoryEntry"("toUserId");

-- CreateIndex
CREATE INDEX "CrmAutomationStep_automationId_idx" ON "CrmAutomationStep"("automationId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmAutomationCursor_automationId_stepIndex_key" ON "CrmAutomationCursor"("automationId", "stepIndex");

-- CreateIndex
CREATE INDEX "CrmAutomationRun_automationId_idx" ON "CrmAutomationRun"("automationId");

-- CreateIndex
CREATE INDEX "CrmAutomationRun_status_resumeAt_idx" ON "CrmAutomationRun"("status", "resumeAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmTelephonySettings_webhookToken_key" ON "CrmTelephonySettings"("webhookToken");

-- CreateIndex
CREATE INDEX "CrmTelephonyEvent_receivedAt_idx" ON "CrmTelephonyEvent"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCallLog_uniqueId_key" ON "CrmCallLog"("uniqueId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCallLog_requestId_key" ON "CrmCallLog"("requestId");

-- CreateIndex
CREATE INDEX "CrmCallLog_leadId_idx" ON "CrmCallLog"("leadId");

-- CreateIndex
CREATE INDEX "CrmCallLog_agentUserId_idx" ON "CrmCallLog"("agentUserId");

-- CreateIndex
CREATE INDEX "CrmCallLog_status_idx" ON "CrmCallLog"("status");

-- CreateIndex
CREATE INDEX "CrmCallLog_startedAt_idx" ON "CrmCallLog"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmEmailSettings_inboundWebhookToken_key" ON "CrmEmailSettings"("inboundWebhookToken");

-- CreateIndex
CREATE UNIQUE INDEX "CrmEmailSuppression_email_key" ON "CrmEmailSuppression"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CrmWhatsAppAccount_displayPhone_key" ON "CrmWhatsAppAccount"("displayPhone");

-- CreateIndex
CREATE UNIQUE INDEX "CrmWhatsAppAccount_phoneNumberId_key" ON "CrmWhatsAppAccount"("phoneNumberId");

-- CreateIndex
CREATE INDEX "CrmWhatsAppConversation_leadId_idx" ON "CrmWhatsAppConversation"("leadId");

-- CreateIndex
CREATE INDEX "CrmWhatsAppConversation_lastMessageAt_idx" ON "CrmWhatsAppConversation"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmWhatsAppConversation_accountId_contactPhone_key" ON "CrmWhatsAppConversation"("accountId", "contactPhone");

-- CreateIndex
CREATE UNIQUE INDEX "CrmWhatsAppMessage_providerMessageId_key" ON "CrmWhatsAppMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "CrmWhatsAppMessage_conversationId_sentAt_idx" ON "CrmWhatsAppMessage"("conversationId", "sentAt");

-- CreateIndex
CREATE INDEX "CrmIntegrationActivity_connectionId_idx" ON "CrmIntegrationActivity"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmForm_slug_key" ON "CrmForm"("slug");

-- CreateIndex
CREATE INDEX "CrmForm_slug_idx" ON "CrmForm"("slug");

-- CreateIndex
CREATE INDEX "CrmFormField_formId_idx" ON "CrmFormField"("formId");

-- CreateIndex
CREATE INDEX "CrmFormSubmission_formId_idx" ON "CrmFormSubmission"("formId");

-- CreateIndex
CREATE INDEX "CrmFormSubmission_createdAt_idx" ON "CrmFormSubmission"("createdAt");

-- CreateIndex
CREATE INDEX "CrmAiSdrEnrollment_status_nextEligibleAt_idx" ON "CrmAiSdrEnrollment"("status", "nextEligibleAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmAiSdrEnrollment_agentId_leadId_key" ON "CrmAiSdrEnrollment"("agentId", "leadId");

-- CreateIndex
CREATE INDEX "CrmAiSdrMessage_enrollmentId_idx" ON "CrmAiSdrMessage"("enrollmentId");

-- AddForeignKey
ALTER TABLE "CrmPipelineStage" ADD CONSTRAINT "CrmPipelineStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "CrmPipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmStageGroup" ADD CONSTRAINT "CrmStageGroup_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "CrmPipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmStageGroupStage" ADD CONSTRAINT "CrmStageGroupStage_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CrmStageGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmStageGroupStage" ADD CONSTRAINT "CrmStageGroupStage_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "CrmPipelineStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTagOnLead" ADD CONSTRAINT "CrmTagOnLead_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTagOnLead" ADD CONSTRAINT "CrmTagOnLead_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "CrmTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_sourceConnectionId_fkey" FOREIGN KEY ("sourceConnectionId") REFERENCES "CrmSourceConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "CrmPipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_pipelineStageId_fkey" FOREIGN KEY ("pipelineStageId") REFERENCES "CrmPipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCustomValue" ADD CONSTRAINT "CrmCustomValue_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCustomValue" ADD CONSTRAINT "CrmCustomValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CrmCustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmNote" ADD CONSTRAINT "CrmNote_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFollowUp" ADD CONSTRAINT "CrmFollowUp_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmStageHistoryEntry" ADD CONSTRAINT "CrmStageHistoryEntry_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmAssignmentHistoryEntry" ADD CONSTRAINT "CrmAssignmentHistoryEntry_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmAutomationStep" ADD CONSTRAINT "CrmAutomationStep_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "CrmAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmAutomationCursor" ADD CONSTRAINT "CrmAutomationCursor_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "CrmAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmAutomationRun" ADD CONSTRAINT "CrmAutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "CrmAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCallLog" ADD CONSTRAINT "CrmCallLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCallLog" ADD CONSTRAINT "CrmCallLog_agentUserId_fkey" FOREIGN KEY ("agentUserId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmWhatsAppConversation" ADD CONSTRAINT "CrmWhatsAppConversation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CrmWhatsAppAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmWhatsAppConversation" ADD CONSTRAINT "CrmWhatsAppConversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmWhatsAppMessage" ADD CONSTRAINT "CrmWhatsAppMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CrmWhatsAppConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmIntegrationActivity" ADD CONSTRAINT "CrmIntegrationActivity_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CrmSourceConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmForm" ADD CONSTRAINT "CrmForm_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "CrmPipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmForm" ADD CONSTRAINT "CrmForm_pipelineStageId_fkey" FOREIGN KEY ("pipelineStageId") REFERENCES "CrmPipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFormField" ADD CONSTRAINT "CrmFormField_formId_fkey" FOREIGN KEY ("formId") REFERENCES "CrmForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFormSubmission" ADD CONSTRAINT "CrmFormSubmission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "CrmForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFormSubmission" ADD CONSTRAINT "CrmFormSubmission_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmAiSdrEnrollment" ADD CONSTRAINT "CrmAiSdrEnrollment_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "CrmAiSdrAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmAiSdrEnrollment" ADD CONSTRAINT "CrmAiSdrEnrollment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmAiSdrMessage" ADD CONSTRAINT "CrmAiSdrMessage_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "CrmAiSdrEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- lastActivityAt is kept current by the database, not by application code (ported verbatim from
-- the legacy CRM's 20260922070000_lead_last_activity_at, retargeted at the renamed tables). GREATEST,
-- not assignment, so an out-of-order insert (a backfill, an imported history) cannot drag it back.
CREATE OR REPLACE FUNCTION crm_lead_touch_last_activity() RETURNS TRIGGER AS $$
BEGIN
  UPDATE "CrmLead"
  SET "lastActivityAt" = GREATEST(COALESCE("lastActivityAt", NEW."createdAt"), NEW."createdAt")
  WHERE id = NEW."leadId";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crm_activity_touches_lead ON "CrmActivity";
CREATE TRIGGER crm_activity_touches_lead
  AFTER INSERT ON "CrmActivity"
  FOR EACH ROW EXECUTE FUNCTION crm_lead_touch_last_activity();
