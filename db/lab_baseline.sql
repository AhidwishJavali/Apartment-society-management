CREATE DATABASE IF NOT EXISTS apartment_society;
USE apartment_society;

CREATE TABLE Apartment (
    apartment_id INT PRIMARY KEY,
    block VARCHAR(10) NOT NULL,
    floor_no INT NOT NULL,
    flat_no VARCHAR(10) NOT NULL,
    bhk INT NOT NULL
);

CREATE TABLE Resident (
    resident_id INT PRIMARY KEY,
    apartment_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(15) UNIQUE,
    email VARCHAR(100) UNIQUE,
    resident_type ENUM('OWNER', 'TENANT') NOT NULL,
    FOREIGN KEY (apartment_id) REFERENCES Apartment(apartment_id)
);

CREATE TABLE Staff (
    staff_id INT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL,
    phone VARCHAR(15) UNIQUE,
    salary DECIMAL(10,2)
);

CREATE TABLE ParkingSpace (
    parking_id INT PRIMARY KEY,
    apartment_id INT NOT NULL,
    slot_number VARCHAR(10) UNIQUE NOT NULL,
    vehicle_type ENUM('CAR', 'BIKE') NOT NULL,
    status ENUM('ALLOCATED', 'AVAILABLE') NOT NULL,
    FOREIGN KEY (apartment_id) REFERENCES Apartment(apartment_id)
);

CREATE TABLE Vehicle (
    vehicle_id INT PRIMARY KEY,
    resident_id INT NOT NULL,
    parking_id INT,
    vehicle_number VARCHAR(20) UNIQUE NOT NULL,
    vehicle_type ENUM('CAR', 'BIKE') NOT NULL,
    brand VARCHAR(50),
    FOREIGN KEY (resident_id) REFERENCES Resident(resident_id),
    FOREIGN KEY (parking_id) REFERENCES ParkingSpace(parking_id)
);

CREATE TABLE MaintenancePayment (
    payment_id INT PRIMARY KEY,
    apartment_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_month VARCHAR(20) NOT NULL,
    payment_date DATE,
    status ENUM('PAID', 'PENDING') NOT NULL,
    FOREIGN KEY (apartment_id) REFERENCES Apartment(apartment_id)
);

CREATE TABLE Complaint (
    complaint_id INT PRIMARY KEY,
    resident_id INT NOT NULL,
    staff_id INT,
    category VARCHAR(50) NOT NULL,
    description VARCHAR(255),
    complaint_date DATE NOT NULL,
    status ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED') NOT NULL,
    FOREIGN KEY (resident_id) REFERENCES Resident(resident_id),
    FOREIGN KEY (staff_id) REFERENCES Staff(staff_id)
);

INSERT INTO Apartment VALUES
(1, 'A', 1, '101', 2),
(2, 'A', 1, '102', 3),
(3, 'A', 2, '201', 2),
(4, 'A', 2, '202', 3),
(5, 'B', 1, '101', 2),
(6, 'B', 1, '102', 3),
(7, 'B', 2, '201', 2),
(8, 'B', 2, '202', 3),
(9, 'C', 1, '101', 2),
(10, 'C', 1, '102', 3);

INSERT INTO Resident VALUES
(1, 1, 'Arjun Rao', '9876500001', 'arjun@gmail.com', 'OWNER'),
(2, 2, 'Priya Sharma', '9876500002', 'priya@gmail.com', 'OWNER'),
(3, 3, 'Rahul Mehta', '9876500003', 'rahul@gmail.com', 'TENANT'),
(4, 4, 'Sneha Iyer', '9876500004', 'sneha@gmail.com', 'OWNER'),
(5, 5, 'Vikram Singh', '9876500005', 'vikram@gmail.com', 'OWNER'),
(6, 6, 'Ananya Patel', '9876500006', 'ananya@gmail.com', 'TENANT'),
(7, 7, 'Karan Joshi', '9876500007', 'karan@gmail.com', 'OWNER'),
(8, 8, 'Neha Kapoor', '9876500008', 'neha@gmail.com', 'OWNER'),
(9, 9, 'Rohan Desai', '9876500009', 'rohan@gmail.com', 'TENANT'),
(10, 10, 'Meera Nair', '9876500010', 'meera@gmail.com', 'OWNER');

INSERT INTO Staff VALUES
(1, 'Suresh Kumar', 'Electrician', '9000000001', 25000),
(2, 'Ramesh Babu', 'Plumber', '9000000002', 24000),
(3, 'Mahesh Rao', 'Security Guard', '9000000003', 22000),
(4, 'Ganesh Kumar', 'Security Guard', '9000000004', 22000),
(5, 'Ajay Singh', 'Maintenance Supervisor', '9000000005', 32000),
(6, 'Mohan Das', 'Cleaner', '9000000006', 20000),
(7, 'Sunil Patil', 'Electrician', '9000000007', 25000),
(8, 'Ravi Kumar', 'Plumber', '9000000008', 24000),
(9, 'Deepak Shah', 'Cleaner', '9000000009', 20000),
(10, 'Vijay Nair', 'Maintenance Supervisor', '9000000010', 32000);

INSERT INTO ParkingSpace VALUES
(1, 1, 'A-P01', 'CAR', 'ALLOCATED'),
(2, 2, 'A-P02', 'CAR', 'ALLOCATED'),
(3, 3, 'A-P03', 'BIKE', 'ALLOCATED'),
(4, 4, 'A-P04', 'CAR', 'ALLOCATED'),
(5, 5, 'B-P01', 'CAR', 'ALLOCATED'),
(6, 6, 'B-P02', 'BIKE', 'ALLOCATED'),
(7, 7, 'B-P03', 'CAR', 'ALLOCATED'),
(8, 8, 'B-P04', 'CAR', 'ALLOCATED'),
(9, 9, 'C-P01', 'BIKE', 'ALLOCATED'),
(10, 10, 'C-P02', 'CAR', 'ALLOCATED');

INSERT INTO Vehicle VALUES
(1, 1, 1, 'KA01AB1234', 'CAR', 'Hyundai'),
(2, 2, 2, 'KA02CD5678', 'CAR', 'Honda'),
(3, 3, 3, 'KA03EF9012', 'BIKE', 'Yamaha'),
(4, 4, 4, 'KA04GH3456', 'CAR', 'Maruti'),
(5, 5, 5, 'KA05IJ7890', 'CAR', 'Tata'),
(6, 6, 6, 'KA06KL1234', 'BIKE', 'Honda'),
(7, 7, 7, 'KA07MN5678', 'CAR', 'Toyota'),
(8, 8, 8, 'KA08OP9012', 'CAR', 'Kia'),
(9, 9, 9, 'KA09QR3456', 'BIKE', 'TVS'),
(10, 10, 10, 'KA10ST7890', 'CAR', 'Hyundai');

INSERT INTO MaintenancePayment VALUES
(1, 1, 3500, 'October 2026', '2026-10-05', 'PAID'),
(2, 2, 4000, 'October 2026', '2026-10-06', 'PAID'),
(3, 3, 3500, 'October 2026', NULL, 'PENDING'),
(4, 4, 4000, 'October 2026', '2026-10-08', 'PAID'),
(5, 5, 3500, 'October 2026', NULL, 'PENDING'),
(6, 6, 4000, 'October 2026', '2026-10-09', 'PAID'),
(7, 7, 3500, 'October 2026', '2026-10-10', 'PAID'),
(8, 8, 4000, 'October 2026', NULL, 'PENDING'),
(9, 9, 3500, 'October 2026', '2026-10-11', 'PAID'),
(10, 10, 4000, 'October 2026', '2026-10-12', 'PAID');

INSERT INTO Complaint VALUES
(1, 1, 1, 'Electrical', 'Corridor light not working', '2026-10-01', 'RESOLVED'),
(2, 2, 2, 'Plumbing', 'Water leakage in kitchen', '2026-10-02', 'IN_PROGRESS'),
(3, 3, 3, 'Security', 'Intercom not working', '2026-10-03', 'OPEN'),
(4, 4, 1, 'Electrical', 'Power issue in bedroom', '2026-10-04', 'RESOLVED'),
(5, 5, 2, 'Plumbing', 'Bathroom tap leakage', '2026-10-05', 'RESOLVED'),
(6, 6, 5, 'Maintenance', 'Lift maintenance required', '2026-10-06', 'IN_PROGRESS'),
(7, 7, 6, 'Cleaning', 'Staircase requires cleaning', '2026-10-07', 'OPEN'),
(8, 8, 7, 'Electrical', 'Parking light not working', '2026-10-08', 'RESOLVED'),
(9, 9, 8, 'Plumbing', 'Low water pressure', '2026-10-09', 'IN_PROGRESS'),
(10, 10, 5, 'Maintenance', 'Door repair required', '2026-10-10', 'OPEN');

SHOW TABLES;

SELECT * FROM Apartment;
SELECT * FROM Resident;
SELECT * FROM Staff;
SELECT * FROM ParkingSpace;
SELECT * FROM Vehicle;
SELECT * FROM MaintenancePayment;
SELECT * FROM Complaint;

SELECT 'Apartment' AS table_name, COUNT(*) AS record_count FROM Apartment
UNION ALL
SELECT 'Resident', COUNT(*) FROM Resident
UNION ALL
SELECT 'Staff', COUNT(*) FROM Staff
UNION ALL
SELECT 'ParkingSpace', COUNT(*) FROM ParkingSpace
UNION ALL
SELECT 'Vehicle', COUNT(*) FROM Vehicle
UNION ALL
SELECT 'MaintenancePayment', COUNT(*) FROM MaintenancePayment
UNION ALL
SELECT 'Complaint', COUNT(*) FROM Complaint;