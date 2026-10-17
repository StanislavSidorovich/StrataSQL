-- Sakila: 15 tables from StrataLab (lab.quaera.app)

CREATE TABLE country (
  country_id integer NOT NULL,
  country text NOT NULL,
  last_update timestamp,
  PRIMARY KEY (country_id)
);

CREATE TABLE language (
  language_id integer NOT NULL,
  name text NOT NULL,
  last_update timestamp NOT NULL,
  PRIMARY KEY (language_id)
);

CREATE TABLE film (
  film_id integer NOT NULL,
  title text NOT NULL,
  release_year text,
  language_id integer NOT NULL,
  original_language_id integer,
  rental_duration smallint NOT NULL,
  rental_rate numeric(4,2) NOT NULL,
  length smallint,
  replacement_cost numeric(5,2) NOT NULL,
  rating text,
  special_features text,
  last_update timestamp NOT NULL,
  PRIMARY KEY (film_id),
  FOREIGN KEY (original_language_id) REFERENCES language (language_id),
  FOREIGN KEY (language_id) REFERENCES language (language_id)
);

CREATE TABLE actor (
  actor_id integer NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  last_update timestamp NOT NULL,
  PRIMARY KEY (actor_id)
);

CREATE TABLE film_actor (
  actor_id integer NOT NULL,
  film_id integer NOT NULL,
  last_update timestamp NOT NULL,
  PRIMARY KEY (actor_id, film_id),
  FOREIGN KEY (film_id) REFERENCES film (film_id),
  FOREIGN KEY (actor_id) REFERENCES actor (actor_id)
);

CREATE TABLE category (
  category_id integer NOT NULL,
  name text NOT NULL,
  last_update timestamp NOT NULL,
  PRIMARY KEY (category_id)
);

CREATE TABLE film_category (
  film_id integer NOT NULL,
  category_id integer NOT NULL,
  last_update timestamp NOT NULL,
  PRIMARY KEY (film_id, category_id),
  FOREIGN KEY (category_id) REFERENCES category (category_id),
  FOREIGN KEY (film_id) REFERENCES film (film_id)
);

CREATE TABLE city (
  city_id integer NOT NULL,
  city text NOT NULL,
  country_id integer NOT NULL,
  last_update timestamp NOT NULL,
  PRIMARY KEY (city_id),
  FOREIGN KEY (country_id) REFERENCES country (country_id)
);

CREATE TABLE address (
  address_id integer NOT NULL,
  address text NOT NULL,
  address2 text,
  district text NOT NULL,
  city_id integer NOT NULL,
  postal_code text,
  phone text NOT NULL,
  last_update timestamp NOT NULL,
  PRIMARY KEY (address_id),
  FOREIGN KEY (city_id) REFERENCES city (city_id)
);

CREATE TABLE store (
  store_id integer NOT NULL,
  manager_staff_id integer NOT NULL,
  address_id integer NOT NULL,
  last_update timestamp NOT NULL,
  PRIMARY KEY (store_id),
  FOREIGN KEY (address_id) REFERENCES address (address_id)
);

CREATE TABLE inventory (
  inventory_id integer NOT NULL,
  film_id integer NOT NULL,
  store_id integer NOT NULL,
  last_update timestamp NOT NULL,
  PRIMARY KEY (inventory_id),
  FOREIGN KEY (film_id) REFERENCES film (film_id),
  FOREIGN KEY (store_id) REFERENCES store (store_id)
);

CREATE TABLE staff (
  staff_id integer NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  address_id integer NOT NULL,
  email text,
  store_id integer NOT NULL,
  active smallint NOT NULL,
  username text NOT NULL,
  password text,
  last_update timestamp NOT NULL,
  PRIMARY KEY (staff_id),
  FOREIGN KEY (address_id) REFERENCES address (address_id),
  FOREIGN KEY (store_id) REFERENCES store (store_id)
);

CREATE TABLE customer (
  customer_id integer NOT NULL,
  store_id integer NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  address_id integer NOT NULL,
  active text NOT NULL,
  create_date timestamp NOT NULL,
  last_update timestamp NOT NULL,
  PRIMARY KEY (customer_id),
  FOREIGN KEY (address_id) REFERENCES address (address_id),
  FOREIGN KEY (store_id) REFERENCES store (store_id)
);

CREATE TABLE rental (
  rental_id integer NOT NULL,
  rental_date timestamp NOT NULL,
  inventory_id integer NOT NULL,
  customer_id integer NOT NULL,
  return_date timestamp,
  staff_id integer NOT NULL,
  last_update timestamp NOT NULL,
  PRIMARY KEY (rental_id),
  FOREIGN KEY (customer_id) REFERENCES customer (customer_id),
  FOREIGN KEY (inventory_id) REFERENCES inventory (inventory_id),
  FOREIGN KEY (staff_id) REFERENCES staff (staff_id)
);

CREATE TABLE payment (
  payment_id integer NOT NULL,
  customer_id integer NOT NULL,
  staff_id integer NOT NULL,
  rental_id integer,
  amount numeric(5,2) NOT NULL,
  payment_date timestamp NOT NULL,
  last_update timestamp NOT NULL,
  PRIMARY KEY (payment_id),
  FOREIGN KEY (staff_id) REFERENCES staff (staff_id),
  FOREIGN KEY (customer_id) REFERENCES customer (customer_id),
  FOREIGN KEY (rental_id) REFERENCES rental (rental_id)
);
