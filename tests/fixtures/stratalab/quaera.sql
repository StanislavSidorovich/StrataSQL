-- Kaiyo Trading (Quaera): 13 tables from StrataLab (lab.quaera.app)

CREATE TABLE dim_customer (
  customer_id integer NOT NULL,
  customer_name text,
  customer_type text,
  channel text,
  chain_name text,
  region_id integer,
  city text,
  opened_date date,
  is_active integer,
  served_by_distributor_id integer,
  rep_id integer,
  PRIMARY KEY (customer_id)
);

CREATE TABLE dim_date (
  date_id date NOT NULL,
  year integer,
  quarter integer,
  month integer,
  month_name text,
  month_start date,
  week_start date,
  iso_week integer,
  day_of_week integer,
  day_name text,
  is_weekend integer,
  PRIMARY KEY (date_id)
);

CREATE TABLE dim_product (
  product_id integer NOT NULL,
  sku_code text,
  product_name text,
  brand text,
  category text,
  subcategory text,
  division text,
  pack_size double precision,
  unit text,
  list_price double precision,
  launch_date date,
  PRIMARY KEY (product_id)
);

CREATE TABLE dim_promo (
  promo_id integer NOT NULL,
  promo_name text,
  brand text,
  mechanic text,
  start_date date,
  end_date date,
  discount_pct double precision,
  channel text,
  PRIMARY KEY (promo_id)
);

CREATE TABLE dim_region (
  region_id integer NOT NULL,
  region_name text,
  macro_region text,
  population integer,
  tier integer,
  PRIMARY KEY (region_id)
);

CREATE TABLE dim_rep (
  rep_id integer NOT NULL,
  rep_name text,
  team text,
  role text,
  region_id integer,
  hired_date date,
  manager_id integer,
  PRIMARY KEY (rep_id)
);

CREATE TABLE fact_forecast_snapshot (
  forecast_id integer NOT NULL,
  snapshot_month date,
  month_start date,
  lag_months integer,
  product_id integer,
  forecast_units integer,
  PRIMARY KEY (forecast_id)
);

CREATE TABLE fact_price (
  price_id integer NOT NULL,
  month_start date,
  product_id integer,
  list_price double precision,
  promo_price double precision,
  PRIMARY KEY (price_id)
);

CREATE TABLE fact_sellin (
  sellin_id integer NOT NULL,
  order_date date,
  ship_date date,
  month_start date,
  distributor_id integer,
  product_id integer,
  units integer,
  gross_amount double precision,
  discount_amount double precision,
  net_amount double precision,
  PRIMARY KEY (sellin_id)
);

CREATE TABLE fact_sellout (
  sellout_id integer NOT NULL,
  week_start date,
  customer_id integer,
  product_id integer,
  units integer,
  revenue double precision,
  avg_price double precision,
  promo_id integer,
  PRIMARY KEY (sellout_id)
);

CREATE TABLE fact_stock (
  stock_id integer NOT NULL,
  month_start date,
  month_end date,
  distributor_id integer,
  product_id integer,
  units_on_hand integer,
  units_in_transit integer,
  PRIMARY KEY (stock_id)
);

CREATE TABLE fact_target (
  target_id integer NOT NULL,
  month_start date,
  rep_id integer,
  division text,
  target_units integer,
  target_revenue double precision,
  PRIMARY KEY (target_id)
);

CREATE TABLE staging_raw_sellout (
  raw_id integer NOT NULL,
  sale_date text,
  customer_name text,
  sku_code text,
  units text,
  revenue text,
  source_file text,
  PRIMARY KEY (raw_id)
);
