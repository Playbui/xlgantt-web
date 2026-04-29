UPDATE storage.buckets
SET public = true
WHERE id = 'workspace-attachments';

DROP POLICY IF EXISTS "workspace_attachments_storage_select" ON storage.objects;

CREATE POLICY "workspace_attachments_storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'workspace-attachments');
