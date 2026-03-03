-- Capacity Tool — Schéma PostgreSQL Supabase
-- Exécuter dans Supabase SQL Editor après création du projet

-- Table: app_state (état applicatif par utilisateur)
CREATE TABLE app_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  products JSONB DEFAULT '[]'::jsonb,
  categories JSONB DEFAULT '[]'::jsonb,
  stakeholders JSONB DEFAULT '[]'::jsonb,
  week_templates JSONB DEFAULT '[]'::jsonb,
  keyword_rules JSONB DEFAULT '[]'::jsonb,
  ics_auto_events JSONB DEFAULT '[]'::jsonb,
  ics_manual_events JSONB DEFAULT '[]'::jsonb,
  ics_ignored_events JSONB DEFAULT '[]'::jsonb,
  llm_provider TEXT DEFAULT 'openai',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(user_id)
);

-- Table: week_entries (entrées de capacité par semaine/produit/catégorie)
CREATE TABLE week_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  week_key TEXT NOT NULL,
  entries JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Table: llm_settings (configuration LLM personnelle optionnelle)
CREATE TABLE llm_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  provider TEXT DEFAULT 'openai',
  api_key_encrypted TEXT,  -- chiffré côté client avant stockage
  custom_url TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Enable RLS sur app_state
ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_app_state" ON app_state
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_can_insert_own_app_state" ON app_state
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Enable RLS sur week_entries
ALTER TABLE week_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_week_entries" ON week_entries
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_can_insert_own_entries" ON week_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Enable RLS sur llm_settings
ALTER TABLE llm_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_llm_settings" ON llm_settings
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_can_insert_own_llm_settings" ON llm_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Index pour performance
CREATE INDEX idx_week_entries_user_id ON week_entries(user_id);
CREATE INDEX idx_week_entries_week_key ON week_entries(week_key);
CREATE INDEX idx_app_state_user_id ON app_state(user_id);
CREATE INDEX idx_llm_settings_user_id ON llm_settings(user_id);

-- Fonction pour auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_app_state_updated_at BEFORE UPDATE ON app_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_week_entries_updated_at BEFORE UPDATE ON week_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_llm_settings_updated_at BEFORE UPDATE ON llm_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
