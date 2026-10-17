-- AdventureWorks LT: 10 tables from StrataLab (lab.quaera.app)

CREATE TABLE "Customer" (
  "CustomerID" integer NOT NULL,
  "NameStyle" boolean NOT NULL,
  "Title" text,
  "FirstName" text NOT NULL,
  "MiddleName" text,
  "LastName" text NOT NULL,
  "Suffix" text,
  "CompanyName" text,
  "SalesPerson" text,
  "EmailAddress" text,
  "Phone" text,
  "PasswordHash" text NOT NULL,
  "PasswordSalt" text NOT NULL,
  rowguid uuid NOT NULL,
  "ModifiedDate" timestamp NOT NULL,
  PRIMARY KEY ("CustomerID"),
  UNIQUE (rowguid)
);

CREATE TABLE "Address" (
  "AddressID" integer NOT NULL,
  "AddressLine1" text NOT NULL,
  "AddressLine2" text,
  "City" text NOT NULL,
  "StateProvince" text NOT NULL,
  "CountryRegion" text NOT NULL,
  "PostalCode" text NOT NULL,
  rowguid uuid NOT NULL,
  "ModifiedDate" timestamp NOT NULL,
  PRIMARY KEY ("AddressID"),
  UNIQUE (rowguid)
);

CREATE TABLE "CustomerAddress" (
  "CustomerID" integer NOT NULL,
  "AddressID" integer NOT NULL,
  "AddressType" text NOT NULL,
  rowguid uuid NOT NULL,
  "ModifiedDate" timestamp NOT NULL,
  PRIMARY KEY ("CustomerID", "AddressID"),
  UNIQUE (rowguid),
  FOREIGN KEY ("CustomerID") REFERENCES "Customer" ("CustomerID"),
  FOREIGN KEY ("AddressID") REFERENCES "Address" ("AddressID")
);

CREATE TABLE "ProductCategory" (
  "ProductCategoryID" integer NOT NULL,
  "ParentProductCategoryID" integer,
  "Name" text NOT NULL,
  rowguid uuid NOT NULL,
  "ModifiedDate" timestamp NOT NULL,
  PRIMARY KEY ("ProductCategoryID"),
  UNIQUE ("Name"),
  UNIQUE (rowguid),
  FOREIGN KEY ("ParentProductCategoryID") REFERENCES "ProductCategory" ("ProductCategoryID")
);

CREATE TABLE "ProductModel" (
  "ProductModelID" integer NOT NULL,
  "Name" text NOT NULL,
  "CatalogDescription" text,
  rowguid uuid NOT NULL,
  "ModifiedDate" timestamp NOT NULL,
  PRIMARY KEY ("ProductModelID"),
  UNIQUE ("Name"),
  UNIQUE (rowguid)
);

CREATE TABLE "ProductDescription" (
  "ProductDescriptionID" integer NOT NULL,
  "Description" text NOT NULL,
  rowguid uuid NOT NULL,
  "ModifiedDate" timestamp NOT NULL,
  PRIMARY KEY ("ProductDescriptionID"),
  UNIQUE (rowguid)
);

CREATE TABLE "ProductModelProductDescription" (
  "ProductModelID" integer NOT NULL,
  "ProductDescriptionID" integer NOT NULL,
  "Culture" text NOT NULL,
  rowguid uuid NOT NULL,
  "ModifiedDate" timestamp NOT NULL,
  PRIMARY KEY ("ProductModelID", "ProductDescriptionID", "Culture"),
  UNIQUE (rowguid),
  FOREIGN KEY ("ProductModelID") REFERENCES "ProductModel" ("ProductModelID"),
  FOREIGN KEY ("ProductDescriptionID") REFERENCES "ProductDescription" ("ProductDescriptionID")
);

CREATE TABLE "SalesOrderHeader" (
  "SalesOrderID" integer NOT NULL,
  "RevisionNumber" smallint NOT NULL,
  "OrderDate" date NOT NULL,
  "DueDate" date NOT NULL,
  "ShipDate" date,
  "Status" smallint NOT NULL,
  "OnlineOrderFlag" boolean NOT NULL,
  "SalesOrderNumber" text NOT NULL,
  "PurchaseOrderNumber" text,
  "AccountNumber" text,
  "CustomerID" integer NOT NULL,
  "ShipToAddressID" integer,
  "BillToAddressID" integer,
  "ShipMethod" text NOT NULL,
  "CreditCardApprovalCode" text,
  "SubTotal" numeric(19,4) NOT NULL,
  "TaxAmt" numeric(19,4) NOT NULL,
  "Freight" numeric(19,4) NOT NULL,
  "TotalDue" numeric(19,4) NOT NULL,
  "Comment" text,
  rowguid uuid NOT NULL,
  "ModifiedDate" timestamp NOT NULL,
  PRIMARY KEY ("SalesOrderID"),
  UNIQUE ("SalesOrderNumber"),
  UNIQUE (rowguid),
  FOREIGN KEY ("CustomerID") REFERENCES "Customer" ("CustomerID"),
  FOREIGN KEY ("ShipToAddressID") REFERENCES "Address" ("AddressID"),
  FOREIGN KEY ("BillToAddressID") REFERENCES "Address" ("AddressID"),
  CHECK ((Status >= 0) AND (Status <= 8)),
  CHECK (SubTotal >= 0),
  CHECK (TaxAmt >= 0),
  CHECK (Freight >= 0),
  CHECK (DueDate >= OrderDate),
  CHECK ((ShipDate >= OrderDate) OR (ShipDate IS NULL))
);

CREATE TABLE "Product" (
  "ProductID" integer NOT NULL,
  "Name" text NOT NULL,
  "ProductNumber" text NOT NULL,
  "Color" text,
  "StandardCost" numeric(19,4) NOT NULL,
  "ListPrice" numeric(19,4) NOT NULL,
  "Size" text,
  "Weight" numeric(8,2),
  "ProductCategoryID" integer,
  "ProductModelID" integer,
  "SellStartDate" date NOT NULL,
  "SellEndDate" date,
  "DiscontinuedDate" date,
  "ThumbnailPhotoFileName" text,
  rowguid uuid NOT NULL,
  "ModifiedDate" timestamp NOT NULL,
  PRIMARY KEY ("ProductID"),
  UNIQUE ("Name"),
  UNIQUE ("ProductNumber"),
  UNIQUE (rowguid),
  FOREIGN KEY ("ProductCategoryID") REFERENCES "ProductCategory" ("ProductCategoryID"),
  FOREIGN KEY ("ProductModelID") REFERENCES "ProductModel" ("ProductModelID"),
  CHECK (StandardCost >= 0),
  CHECK (ListPrice >= 0),
  CHECK (Weight > 0),
  CHECK ((SellEndDate >= SellStartDate) OR (SellEndDate IS NULL))
);

CREATE TABLE "SalesOrderDetail" (
  "SalesOrderID" integer NOT NULL,
  "SalesOrderDetailID" integer NOT NULL,
  "OrderQty" smallint NOT NULL,
  "ProductID" integer NOT NULL,
  "UnitPrice" numeric(19,4) NOT NULL,
  "UnitPriceDiscount" numeric(19,4) NOT NULL,
  "LineTotal" numeric(38,6) NOT NULL,
  rowguid uuid NOT NULL,
  "ModifiedDate" timestamp NOT NULL,
  PRIMARY KEY ("SalesOrderID", "SalesOrderDetailID"),
  UNIQUE (rowguid),
  FOREIGN KEY ("SalesOrderID") REFERENCES "SalesOrderHeader" ("SalesOrderID"),
  FOREIGN KEY ("ProductID") REFERENCES "Product" ("ProductID"),
  CHECK (OrderQty > 0),
  CHECK (UnitPrice >= 0),
  CHECK (UnitPriceDiscount >= 0)
);
