-- Chinook: 11 tables from StrataLab (lab.quaera.app)

CREATE TABLE "Artist" (
  "ArtistId" integer NOT NULL,
  "Name" text,
  PRIMARY KEY ("ArtistId")
);

CREATE TABLE "Employee" (
  "EmployeeId" integer NOT NULL,
  "LastName" text NOT NULL,
  "FirstName" text NOT NULL,
  "Title" text,
  "ReportsTo" integer,
  "BirthDate" timestamp,
  "HireDate" timestamp,
  "Address" text,
  "City" text,
  "State" text,
  "Country" text,
  "PostalCode" text,
  "Phone" text,
  "Fax" text,
  "Email" text,
  PRIMARY KEY ("EmployeeId"),
  FOREIGN KEY ("ReportsTo") REFERENCES "Employee" ("EmployeeId")
);

CREATE TABLE "Customer" (
  "CustomerId" integer NOT NULL,
  "FirstName" text NOT NULL,
  "LastName" text NOT NULL,
  "Company" text,
  "Address" text,
  "City" text,
  "State" text,
  "Country" text,
  "PostalCode" text,
  "Phone" text,
  "Fax" text,
  "Email" text NOT NULL,
  "SupportRepId" integer,
  PRIMARY KEY ("CustomerId"),
  FOREIGN KEY ("SupportRepId") REFERENCES "Employee" ("EmployeeId")
);

CREATE TABLE "MediaType" (
  "MediaTypeId" integer NOT NULL,
  "Name" text,
  PRIMARY KEY ("MediaTypeId")
);

CREATE TABLE "Genre" (
  "GenreId" integer NOT NULL,
  "Name" text,
  PRIMARY KEY ("GenreId")
);

CREATE TABLE "Album" (
  "AlbumId" integer NOT NULL,
  "Title" text NOT NULL,
  "ArtistId" integer NOT NULL,
  PRIMARY KEY ("AlbumId"),
  FOREIGN KEY ("ArtistId") REFERENCES "Artist" ("ArtistId")
);

CREATE TABLE "Track" (
  "TrackId" integer NOT NULL,
  "Name" text NOT NULL,
  "AlbumId" integer,
  "MediaTypeId" integer NOT NULL,
  "GenreId" integer,
  "Composer" text,
  "Milliseconds" integer NOT NULL,
  "Bytes" integer,
  "UnitPrice" numeric(10,2) NOT NULL,
  PRIMARY KEY ("TrackId"),
  FOREIGN KEY ("MediaTypeId") REFERENCES "MediaType" ("MediaTypeId"),
  FOREIGN KEY ("GenreId") REFERENCES "Genre" ("GenreId"),
  FOREIGN KEY ("AlbumId") REFERENCES "Album" ("AlbumId")
);

CREATE TABLE "Invoice" (
  "InvoiceId" integer NOT NULL,
  "CustomerId" integer NOT NULL,
  "InvoiceDate" timestamp NOT NULL,
  "BillingAddress" text,
  "BillingCity" text,
  "BillingState" text,
  "BillingCountry" text,
  "BillingPostalCode" text,
  "Total" numeric(10,2) NOT NULL,
  PRIMARY KEY ("InvoiceId"),
  FOREIGN KEY ("CustomerId") REFERENCES "Customer" ("CustomerId")
);

CREATE TABLE "InvoiceLine" (
  "InvoiceLineId" integer NOT NULL,
  "InvoiceId" integer NOT NULL,
  "TrackId" integer NOT NULL,
  "UnitPrice" numeric(10,2) NOT NULL,
  "Quantity" integer NOT NULL,
  PRIMARY KEY ("InvoiceLineId"),
  FOREIGN KEY ("TrackId") REFERENCES "Track" ("TrackId"),
  FOREIGN KEY ("InvoiceId") REFERENCES "Invoice" ("InvoiceId")
);

CREATE TABLE "Playlist" (
  "PlaylistId" integer NOT NULL,
  "Name" text,
  PRIMARY KEY ("PlaylistId")
);

CREATE TABLE "PlaylistTrack" (
  "PlaylistId" integer NOT NULL,
  "TrackId" integer NOT NULL,
  PRIMARY KEY ("PlaylistId", "TrackId"),
  FOREIGN KEY ("TrackId") REFERENCES "Track" ("TrackId"),
  FOREIGN KEY ("PlaylistId") REFERENCES "Playlist" ("PlaylistId")
);
