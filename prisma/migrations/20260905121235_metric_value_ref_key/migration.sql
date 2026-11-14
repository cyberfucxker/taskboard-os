-- DropForeignKey
ALTER TABLE "MetricValue" DROP CONSTRAINT "MetricValue_metricKey_fkey";

-- AddForeignKey
ALTER TABLE "MetricValue" ADD CONSTRAINT "MetricValue_metricKey_fkey" FOREIGN KEY ("metricKey") REFERENCES "Metric"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
