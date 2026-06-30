-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "notify_worker_on_task_assigned" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_worker_on_task_cancelled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_worker_on_task_updated" BOOLEAN NOT NULL DEFAULT true;
