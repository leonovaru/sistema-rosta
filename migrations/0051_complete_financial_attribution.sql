-- Complete historical attribution for legacy operations that were linked
-- to a project but did not have an explicit client/direction on the row.
UPDATE income_entries
SET client_id_snapshot=COALESCE(
      client_id_snapshot,
      (SELECT p.client_id FROM projects p WHERE p.id=income_entries.project_id AND p.user_id=income_entries.user_id)
    ),
    client_name_snapshot=COALESCE(
      client_name_snapshot,
      (SELECT c.name FROM projects p JOIN clients c ON c.id=p.client_id AND c.user_id=p.user_id
       WHERE p.id=income_entries.project_id AND p.user_id=income_entries.user_id)
    ),
    direction_id_snapshot=COALESCE(
      direction_id_snapshot,
      (SELECT p.direction_id FROM projects p WHERE p.id=income_entries.project_id AND p.user_id=income_entries.user_id),
      (SELECT c.direction_id FROM clients c WHERE c.id=income_entries.client_id AND c.user_id=income_entries.user_id)
    ),
    direction_title_snapshot=COALESCE(
      direction_title_snapshot,
      (SELECT d.title FROM projects p JOIN directions d ON d.id=p.direction_id AND d.user_id=p.user_id
       WHERE p.id=income_entries.project_id AND p.user_id=income_entries.user_id),
      (SELECT d.title FROM clients c JOIN directions d ON d.id=c.direction_id AND d.user_id=c.user_id
       WHERE c.id=income_entries.client_id AND c.user_id=income_entries.user_id)
    ),
    project_id_snapshot=COALESCE(project_id_snapshot,project_id),
    project_title_snapshot=COALESCE(
      project_title_snapshot,
      (SELECT p.title FROM projects p WHERE p.id=income_entries.project_id AND p.user_id=income_entries.user_id)
    );

UPDATE expenses
SET client_id_snapshot=COALESCE(
      client_id_snapshot,
      (SELECT p.client_id FROM projects p WHERE p.id=expenses.project_id AND p.user_id=expenses.user_id)
    ),
    client_name_snapshot=COALESCE(
      client_name_snapshot,
      (SELECT c.name FROM projects p JOIN clients c ON c.id=p.client_id AND c.user_id=p.user_id
       WHERE p.id=expenses.project_id AND p.user_id=expenses.user_id)
    ),
    direction_id_snapshot=COALESCE(
      direction_id_snapshot,
      (SELECT p.direction_id FROM projects p WHERE p.id=expenses.project_id AND p.user_id=expenses.user_id),
      (SELECT c.direction_id FROM clients c WHERE c.id=expenses.client_id AND c.user_id=expenses.user_id)
    ),
    direction_title_snapshot=COALESCE(
      direction_title_snapshot,
      (SELECT d.title FROM projects p JOIN directions d ON d.id=p.direction_id AND d.user_id=p.user_id
       WHERE p.id=expenses.project_id AND p.user_id=expenses.user_id),
      (SELECT d.title FROM clients c JOIN directions d ON d.id=c.direction_id AND d.user_id=c.user_id
       WHERE c.id=expenses.client_id AND c.user_id=expenses.user_id)
    ),
    project_id_snapshot=COALESCE(project_id_snapshot,project_id),
    project_title_snapshot=COALESCE(
      project_title_snapshot,
      (SELECT p.title FROM projects p WHERE p.id=expenses.project_id AND p.user_id=expenses.user_id)
    );
