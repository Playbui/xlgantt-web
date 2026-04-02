-- ============================================================
-- XLGantt Web - profiles 테이블에 인증 관련 컬럼 추가
-- Supabase Migration 002
-- ============================================================

-- role: 사용자 역할 (admin / pm / member / guest)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';

-- approved: 관리자 승인 여부
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT false;

-- handle_new_user 트리거 함수 업데이트: role, approved 기본값 포함
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, name, email, role, approved)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    'member',
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 관리자용 RLS 정책: 모든 프로필 조회/수정/삭제
-- ============================================================

-- 관리자가 모든 프로필을 조회할 수 있도록
CREATE POLICY "profiles_select_all_for_admin" ON profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- 관리자가 모든 프로필을 수정할 수 있도록
CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- 관리자가 프로필을 삭제할 수 있도록
CREATE POLICY "profiles_delete_admin" ON profiles
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- 관리자가 다른 사용자의 프로필을 INSERT할 수 있도록 (signUp 후 upsert용)
CREATE POLICY "profiles_insert_admin" ON profiles
  FOR INSERT WITH CHECK (
    auth.uid() = id OR
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );
