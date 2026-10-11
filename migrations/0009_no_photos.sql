-- Pence keeps what it reads from a receipt photo or PDF, never the picture itself.
-- Clear the pictures saved before this change; the column stays so older code still runs.
update transactions set image_data = null where image_data is not null;
