-- Make spreadsheet columns nullable so prospects can be created without a Google Sheet
ALTER TABLE prospect_dashboards
ALTER COLUMN spreadsheet_id DROP NOT NULL;

ALTER TABLE prospect_dashboards
ALTER COLUMN spreadsheet_url DROP NOT NULL;

COMMENT ON COLUMN prospect_dashboards.spreadsheet_id IS 'Google Sheets spreadsheet ID (optional - can be added later)';
COMMENT ON COLUMN prospect_dashboards.spreadsheet_url IS 'Google Sheets URL (optional - can be added later)';
