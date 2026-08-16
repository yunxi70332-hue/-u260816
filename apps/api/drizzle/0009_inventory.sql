CREATE TYPE stock_document_type AS ENUM ('receive', 'issue', 'adjust', 'transfer');
CREATE TYPE stock_document_status AS ENUM ('draft', 'posted', 'reversed');
CREATE TYPE inventory_ledger_direction AS ENUM ('receive', 'issue', 'adjust', 'reserve', 'release', 'reverse');

CREATE TABLE warehouses (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouses_tenant_code_unique UNIQUE (tenant_id, code)
);
CREATE INDEX warehouses_tenant_idx ON warehouses(tenant_id);

CREATE TABLE material_variants (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  material_key text NOT NULL,
  spec_key text NOT NULL,
  color text NOT NULL DEFAULT '',
  finish text NOT NULL DEFAULT '',
  name text NOT NULL,
  specification text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'pcs',
  active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_variants_tenant_key_unique UNIQUE (tenant_id, material_key, spec_key, color, finish)
);
CREATE INDEX material_variants_tenant_idx ON material_variants(tenant_id);

CREATE TABLE inventory_balances (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  warehouse_id text NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  material_id text NOT NULL REFERENCES material_variants(id) ON DELETE CASCADE,
  on_hand_qty integer NOT NULL DEFAULT 0,
  reserved_qty integer NOT NULL DEFAULT 0,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_balances_unique UNIQUE (tenant_id, warehouse_id, material_id),
  CONSTRAINT inventory_balances_nonnegative CHECK (on_hand_qty >= 0 AND reserved_qty >= 0 AND reserved_qty <= on_hand_qty)
);

CREATE TABLE stock_documents (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  code text NOT NULL,
  type stock_document_type NOT NULL,
  status stock_document_status NOT NULL DEFAULT 'draft',
  warehouse_id text NOT NULL REFERENCES warehouses(id),
  target_warehouse_id text REFERENCES warehouses(id),
  note text,
  lines jsonb NOT NULL,
  posted_at timestamptz,
  posted_by_user_id text REFERENCES "user"(id) ON DELETE SET NULL,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_documents_tenant_code_unique UNIQUE (tenant_id, code)
);
CREATE INDEX stock_documents_tenant_status_idx ON stock_documents(tenant_id, status);

CREATE TABLE inventory_ledger (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  warehouse_id text NOT NULL REFERENCES warehouses(id),
  material_id text NOT NULL REFERENCES material_variants(id),
  direction inventory_ledger_direction NOT NULL,
  quantity integer NOT NULL,
  delta_qty integer NOT NULL,
  reference_type text NOT NULL,
  reference_id text,
  note text,
  actor_user_id text REFERENCES "user"(id) ON DELETE SET NULL,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_ledger_tenant_created_idx ON inventory_ledger(tenant_id, created_at);
CREATE INDEX inventory_ledger_material_idx ON inventory_ledger(tenant_id, warehouse_id, material_id);

CREATE TABLE inventory_reservations (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  warehouse_id text NOT NULL REFERENCES warehouses(id),
  material_id text NOT NULL REFERENCES material_variants(id),
  qty integer NOT NULL,
  status text NOT NULL DEFAULT 'active',
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_reservations_qty_positive CHECK (qty > 0)
);
CREATE INDEX inventory_reservations_order_idx ON inventory_reservations(tenant_id, order_id);
