-- Northwind: 13 tables from StrataLab (lab.quaera.app)

CREATE TABLE "Customers" (
  "CustomerID" text NOT NULL,
  "CompanyName" text NOT NULL,
  "ContactName" text,
  "ContactTitle" text,
  "Address" text,
  "City" text,
  "Region" text,
  "PostalCode" text,
  "Country" text,
  "Phone" text,
  "Fax" text,
  PRIMARY KEY ("CustomerID")
);

CREATE TABLE "CustomerDemographics" (
  "CustomerTypeID" text NOT NULL,
  "CustomerDesc" text,
  PRIMARY KEY ("CustomerTypeID")
);

CREATE TABLE "CustomerCustomerDemo" (
  "CustomerID" text NOT NULL,
  "CustomerTypeID" text NOT NULL,
  PRIMARY KEY ("CustomerID", "CustomerTypeID"),
  FOREIGN KEY ("CustomerID") REFERENCES "Customers" ("CustomerID"),
  FOREIGN KEY ("CustomerTypeID") REFERENCES "CustomerDemographics" ("CustomerTypeID")
);

CREATE TABLE "Shippers" (
  "ShipperID" integer NOT NULL,
  "CompanyName" text NOT NULL,
  "Phone" text,
  PRIMARY KEY ("ShipperID")
);

CREATE TABLE "Suppliers" (
  "SupplierID" integer NOT NULL,
  "CompanyName" text NOT NULL,
  "ContactName" text,
  "ContactTitle" text,
  "Address" text,
  "City" text,
  "Region" text,
  "PostalCode" text,
  "Country" text,
  "Phone" text,
  "Fax" text,
  "HomePage" text,
  PRIMARY KEY ("SupplierID")
);

CREATE TABLE "Categories" (
  "CategoryID" integer NOT NULL,
  "CategoryName" text NOT NULL,
  "Description" text,
  PRIMARY KEY ("CategoryID")
);

CREATE TABLE "Region" (
  "RegionID" integer NOT NULL,
  "RegionDescription" text NOT NULL,
  PRIMARY KEY ("RegionID")
);

CREATE TABLE "Employees" (
  "EmployeeID" integer NOT NULL,
  "LastName" text NOT NULL,
  "FirstName" text NOT NULL,
  "Title" text,
  "TitleOfCourtesy" text,
  "BirthDate" date,
  "HireDate" date,
  "Address" text,
  "City" text,
  "Region" text,
  "PostalCode" text,
  "Country" text,
  "HomePhone" text,
  "Extension" text,
  "Notes" text,
  "ReportsTo" integer,
  "PhotoPath" text,
  PRIMARY KEY ("EmployeeID"),
  FOREIGN KEY ("ReportsTo") REFERENCES "Employees" ("EmployeeID")
);

CREATE TABLE "Territories" (
  "TerritoryID" text NOT NULL,
  "TerritoryDescription" text NOT NULL,
  "RegionID" integer NOT NULL,
  PRIMARY KEY ("TerritoryID"),
  FOREIGN KEY ("RegionID") REFERENCES "Region" ("RegionID")
);

CREATE TABLE "EmployeeTerritories" (
  "EmployeeID" integer NOT NULL,
  "TerritoryID" text NOT NULL,
  PRIMARY KEY ("EmployeeID", "TerritoryID"),
  FOREIGN KEY ("EmployeeID") REFERENCES "Employees" ("EmployeeID"),
  FOREIGN KEY ("TerritoryID") REFERENCES "Territories" ("TerritoryID")
);

CREATE TABLE "Orders" (
  "OrderID" integer NOT NULL,
  "CustomerID" text,
  "EmployeeID" integer,
  "OrderDate" date,
  "RequiredDate" date,
  "ShippedDate" date,
  "ShipVia" integer,
  "Freight" numeric(10,2),
  "ShipName" text,
  "ShipAddress" text,
  "ShipCity" text,
  "ShipRegion" text,
  "ShipPostalCode" text,
  "ShipCountry" text,
  PRIMARY KEY ("OrderID"),
  FOREIGN KEY ("CustomerID") REFERENCES "Customers" ("CustomerID"),
  FOREIGN KEY ("EmployeeID") REFERENCES "Employees" ("EmployeeID"),
  FOREIGN KEY ("ShipVia") REFERENCES "Shippers" ("ShipperID")
);

CREATE TABLE "Products" (
  "ProductID" integer NOT NULL,
  "ProductName" text NOT NULL,
  "SupplierID" integer,
  "CategoryID" integer,
  "QuantityPerUnit" text,
  "UnitPrice" numeric(10,2),
  "UnitsInStock" smallint,
  "UnitsOnOrder" smallint,
  "ReorderLevel" smallint,
  "Discontinued" boolean NOT NULL,
  PRIMARY KEY ("ProductID"),
  FOREIGN KEY ("SupplierID") REFERENCES "Suppliers" ("SupplierID"),
  FOREIGN KEY ("CategoryID") REFERENCES "Categories" ("CategoryID"),
  CHECK (UnitPrice >= 0),
  CHECK (UnitsInStock >= 0),
  CHECK (UnitsOnOrder >= 0),
  CHECK (ReorderLevel >= 0)
);

CREATE TABLE "Order Details" (
  "OrderID" integer NOT NULL,
  "ProductID" integer NOT NULL,
  "UnitPrice" numeric(10,2) NOT NULL,
  "Quantity" smallint NOT NULL,
  "Discount" double precision NOT NULL,
  PRIMARY KEY ("OrderID", "ProductID"),
  FOREIGN KEY ("OrderID") REFERENCES "Orders" ("OrderID"),
  FOREIGN KEY ("ProductID") REFERENCES "Products" ("ProductID"),
  CHECK (UnitPrice >= 0),
  CHECK (Quantity > 0),
  CHECK ((Discount >= 0) AND (Discount <= 1))
);
