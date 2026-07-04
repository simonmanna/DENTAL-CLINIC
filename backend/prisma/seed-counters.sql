INSERT INTO document_counters (prefix, year, current_value, updated_at)
SELECT
  prefix,
  year,
  max_seq,
  NOW()
FROM (
  -- VIS codes
  SELECT
    'VIS' AS prefix,
    EXTRACT(YEAR FROM NOW())::INT % 100 AS year,
    COALESCE(
      MAX(CAST(SPLIT_PART("visitCode", '-', 3) AS BIGINT)), 0
    ) AS max_seq
  FROM visits
  WHERE "visitCode" ~ '^VIS-\d{2}-\d+$'

  UNION ALL

  -- RX codes
  SELECT
    'RX',
    EXTRACT(YEAR FROM NOW())::INT % 100,
    COALESCE(
      MAX(CAST(SPLIT_PART("prescriptionCode", '-', 3) AS BIGINT)), 0
    )
  FROM prescriptions
  WHERE "prescriptionCode" ~ '^RX-\d{2}-\d+$'
) src
ON CONFLICT (prefix, year)
DO UPDATE SET
  current_value = GREATEST(
    document_counters.current_value,
    EXCLUDED.current_value
  ),
  updated_at = NOW();