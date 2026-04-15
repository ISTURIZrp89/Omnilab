-- OmniLab Supabase Schema SQL
-- Ejecutar en SQL Editor de Supabase Dashboard

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla EQUIPOS
CREATE TABLE IF NOT EXISTS EQUIPOS (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  tipo TEXT,
  modelo TEXT,
  serie TEXT,
  ubicacion TEXT,
  estado TEXT DEFAULT 'operativo',
  mantenimiento TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla RECEPCION
CREATE TABLE IF NOT EXISTS RECEPCION (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio TEXT,
  fecha_entrada TIMESTAMPTZ DEFAULT NOW(),
  proveedor TEXT,
  material TEXT,
  cantidad TEXT,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla BITACORA
CREATE TABLE IF NOT EXISTS BITACORA (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meta TEXT,
  actividades TEXT,
  cajas TEXT,
  recursos TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla COND_AMB
CREATE TABLE IF NOT EXISTS COND_AMB (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fecha TIMESTAMPTZ DEFAULT NOW(),
  temperatura REAL,
  humedad REAL,
  presion REAL,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla CAJAS
CREATE TABLE IF NOT EXISTS CAJAS (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT,
  tipo TEXT,
  capacidad INTEGER,
  ubicacion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_equipos_nombre ON EQUIPOS(nombre);
CREATE INDEX IF NOT EXISTS idx_equipos_estado ON EQUIPOS(estado);
CREATE INDEX IF NOT EXISTS idx_recepcion_fecha ON RECEPCION(fecha_entrada);
CREATE INDEX IF NOT EXISTS idx_recepcion_proveedor ON RECEPCION(proveedor);
CREATE INDEX IF NOT EXISTS idx_bitacora_fecha ON BITACORA(created_at);
CREATE INDEX IF NOT EXISTS idx_condamb_fecha ON COND_AMB(fecha);
CREATE INDEX IF NOT EXISTS idx_cajas_nombre ON CAJAS(nombre);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at automático
CREATE TRIGGER update_equipos_updated_at 
  BEFORE UPDATE ON EQUIPOS 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recepcion_updated_at 
  BEFORE UPDATE ON RECEPCION 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bitacora_updated_at 
  BEFORE UPDATE ON BITACORA 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_condamb_updated_at 
  BEFORE UPDATE ON COND_AMB 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cajas_updated_at 
  BEFORE UPDATE ON CAJAS 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Políticas RLS (Row Level Security)
ALTER TABLE EQUIPOS ENABLE ROW LEVEL SECURITY;
ALTER TABLE RECEPCION ENABLE ROW LEVEL SECURITY;
ALTER TABLE BITACORA ENABLE ROW LEVEL SECURITY;
ALTER TABLE COND_AMB ENABLE ROW LEVEL SECURITY;
ALTER TABLE CAJAS ENABLE ROW LEVEL SECURITY;

-- Policy para usuarios autenticados pueden leer
CREATE POLICY "Allow read" ON EQUIPOS FOR SELECT USING (auth.role() IN ('authenticated', 'anon'));
CREATE POLICY "Allow read" ON RECEPCION FOR SELECT USING (auth.role() IN ('authenticated', 'anon'));
CREATE POLICY "Allow read" ON BITACORA FOR SELECT USING (auth.role() IN ('authenticated', 'anon'));
CREATE POLICY "Allow read" ON COND_AMB FOR SELECT USING (auth.role() IN ('authenticated', 'anon'));
CREATE POLICY "Allow read" ON CAJAS FOR SELECT USING (auth.role() IN ('authenticated', 'anon'));

-- Policy para usuarios autenticados pueden modificar
CREATE POLICY "Allow all" ON EQUIPOS FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all" ON RECEPCION FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all" ON BITACORA FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all" ON COND_AMB FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all" ON CAJAS FOR ALL USING (auth.role() = 'authenticated');