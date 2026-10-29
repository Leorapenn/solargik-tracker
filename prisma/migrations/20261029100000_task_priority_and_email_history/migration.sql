-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'MEDIUM';

-- AlterTable
ALTER TABLE "TaskUpdate" ADD COLUMN     "sourceLink" TEXT,
ADD COLUMN     "sourceSubject" TEXT;
