CREATE OR REPLACE FUNCTION generate_document_number(p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_year    INT    := EXTRACT(YEAR FROM NOW())::INT % 100;
  v_counter BIGINT;
  v_code    TEXT;
BEGIN
  INSERT INTO document_counters (
    prefix,
    year,
    current_value,
    updated_at
  )
  VALUES (
    p_prefix,
    v_year,
    1,
    NOW()
  )
  ON CONFLICT (prefix, year)
  DO UPDATE SET
    current_value = document_counters.current_value + 1,
    updated_at    = NOW()
  RETURNING current_value INTO v_counter;

  v_code :=
    p_prefix || '-' ||
    LPAD(v_year::TEXT, 2, '0') || '-' ||
    LPAD(v_counter::TEXT, 4, '0');

  RETURN v_code;
END;
$$;