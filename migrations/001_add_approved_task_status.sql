-- SmartMinute
-- Migration: Allow approved task attempts
--
-- The admin task approval flow changes task_attempts.status
-- from submitted -> approved.

ALTER TABLE task_attempts
DROP CONSTRAINT IF EXISTS task_attempts_status_check;

ALTER TABLE task_attempts
ADD CONSTRAINT task_attempts_status_check
CHECK (
    status = ANY (
        ARRAY[
            'started'::text,
            'submitted'::text,
            'verified'::text,
            'approved'::text,
            'rejected'::text
        ]
    )
);
