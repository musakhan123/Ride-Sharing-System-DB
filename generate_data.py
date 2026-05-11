import csv
import random
from faker import Faker
from datetime import datetime, timedelta

fake = Faker()

# -------------------------------------------------------
# Helper
# -------------------------------------------------------
def write_csv(filename, headers, rows):
    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)
    print(f"Generated {filename} ({len(rows)} rows)")

# -------------------------------------------------------
# 1. USERS (100 rows)
# -------------------------------------------------------
users = []
roles = ['driver', 'passenger']
for i in range(1, 101):
    users.append([
        i,
        fake.name(),
        fake.unique.email(),
        fake.numerify('03#########'),
        fake.password(length=12),
        random.choice(roles),
        fake.date_time_between(start_date='-2y', end_date='now').strftime('%Y-%m-%d %H:%M:%S')
    ])
write_csv('USERS.csv', ['UserID','Name','Email','Phone','Password','Role','CreatedAT'], users)

# -------------------------------------------------------
# 2. VEHICLES (60 rows) — only drivers own vehicles
# -------------------------------------------------------
driver_ids = [u[0] for u in users if u[5] == 'driver']
makes = ['Toyota', 'Honda', 'Suzuki', 'Hyundai', 'KIA', 'Nissan', 'Daihatsu']
models = ['Corolla', 'Civic', 'Alto', 'Cultus', 'Sportage', 'Mira', 'Prado']
colors = ['White', 'Black', 'Silver', 'Red', 'Blue', 'Grey']

vehicles = []
for i in range(1, 61):
    vehicles.append([
        i,
        random.choice(driver_ids),
        random.choice(makes),
        random.choice(models),
        random.choice(colors),
        fake.unique.bothify('???-###').upper(),
        random.randint(4, 7)
    ])
write_csv('VEHICLES.csv', ['VehicleID','DriverID','Make','Model','Color','PlateNumber','SeatingCapacity'], vehicles)

# -------------------------------------------------------
# 3. LOCATIONS (50 rows)
# -------------------------------------------------------
peshawar_areas = [
    ('Hayatabad', 'Peshawar'), ('University Town', 'Peshawar'),
    ('Saddar', 'Peshawar'), ('Gulbahar', 'Peshawar'),
    ('Kohat Road', 'Peshawar'), ('Dalazak Road', 'Peshawar'),
    ('Ring Road', 'Peshawar'), ('Warsak Road', 'Peshawar'),
    ('Cantt', 'Peshawar'), ('Phase 4', 'Peshawar'),
    ('Phase 5', 'Peshawar'), ('Regi', 'Peshawar'),
    ('Nauthia', 'Peshawar'), ('Faqirabad', 'Peshawar'),
    ('Bara Road', 'Peshawar'), ('Jamrud Road', 'Peshawar'),
    ('GT Road', 'Peshawar'), ('Charsadda Road', 'Peshawar'),
    ('IMSciences', 'Peshawar'), ('Arbab Road', 'Peshawar')
]

locations = []
for i in range(1, 51):
    area_city = random.choice(peshawar_areas)
    locations.append([
        i,
        f"{area_city[0]} Stop {i}",
        area_city[0],
        area_city[1]
    ])
write_csv('LOCATIONS.csv', ['LocationID','LocationName','Area','City'], locations)

# -------------------------------------------------------
# 4. RIDES (80 rows)
# -------------------------------------------------------
vehicle_driver_map = {v[0]: v[1] for v in vehicles}
statuses = ['active', 'completed', 'cancelled']

rides = []
for i in range(1, 81):
    vehicle_id = random.choice(list(vehicle_driver_map.keys()))
    driver_id = vehicle_driver_map[vehicle_id]
    origin_id = random.randint(1, 50)
    dest_id = random.randint(1, 50)
    while dest_id == origin_id:
        dest_id = random.randint(1, 50)
    total_seats = random.randint(2, 6)
    available_seats = random.randint(0, total_seats)
    departure = fake.date_time_between(start_date='-6m', end_date='+1m')
    rides.append([
        i,
        driver_id,
        vehicle_id,
        origin_id,
        dest_id,
        departure.strftime('%Y-%m-%d %H:%M:%S'),
        total_seats,
        available_seats,
        random.choice(statuses)
    ])
write_csv('RIDES.csv', ['RideID','DriverID','VehicleID','OriginID','DestinationID','DepartureTime','TotalSeats','AvailableSeats','Status'], rides)

# -------------------------------------------------------
# 5. BOOKINGS (100 rows)
# -------------------------------------------------------
passenger_ids = [u[0] for u in users if u[5] == 'passenger']
booking_statuses = ['confirmed', 'cancelled']

bookings = []
for i in range(1, 101):
    bookings.append([
        i,
        random.randint(1, 80),
        random.choice(passenger_ids),
        fake.date_time_between(start_date='-6m', end_date='now').strftime('%Y-%m-%d %H:%M:%S'),
        random.choice(booking_statuses)
    ])
write_csv('BOOKINGS.csv', ['BookingID','RideID','PassengerID','BookingTime','Status'], bookings)

# -------------------------------------------------------
# 6. REVIEWS (70 rows)
# -------------------------------------------------------
reviews = []
for i in range(1, 71):
    reviews.append([
        i,
        random.randint(1, 80),
        random.choice(passenger_ids),
        random.choice(driver_ids),
        random.randint(1, 5),
        fake.sentence(nb_words=10),
        fake.date_time_between(start_date='-6m', end_date='now').strftime('%Y-%m-%d %H:%M:%S')
    ])
write_csv('REVIEWS.csv', ['ReviewID','RideID','PassengerID','DriverID','Rating','Comment','ReviewDate'], reviews)

# -------------------------------------------------------
# 7. PAYMENTS (100 rows)
# -------------------------------------------------------
payment_methods = ['cash', 'online']
payment_statuses = ['pending', 'completed', 'failed']

payments = []
for i in range(1, 101):
    payments.append([
        i,
        random.randint(1, 100),
        round(random.uniform(50, 500), 2),
        random.choice(payment_methods),
        random.choice(payment_statuses),
        fake.date_time_between(start_date='-6m', end_date='now').strftime('%Y-%m-%d %H:%M:%S')
    ])
write_csv('PAYMENTS.csv', ['PaymentID','BookingID','Amount','Method','Status','PaymentDate'], payments)

# -------------------------------------------------------
# 8. IDENTITY_VERIFICATION (100 rows)
# -------------------------------------------------------
doc_types = ['CNIC', 'student_card', 'passport']
verify_statuses = ['pending', 'verified', 'rejected']

identity_verifications = []
used_docs = set()
for i in range(1, 101):
    doc_num = fake.unique.numerify('####-#######-#')
    identity_verifications.append([
        i,
        i,  # one per user
        random.choice(doc_types),
        doc_num,
        random.choice(verify_statuses),
        fake.date_time_between(start_date='-1y', end_date='now').strftime('%Y-%m-%d %H:%M:%S')
    ])
write_csv('IDENTITY_VERIFICATION.csv', ['VerificationID','UserID','DocumentType','DocumentNumber','Status','SubmittedAt'], identity_verifications)

# -------------------------------------------------------
# 9. VEHICLE_REGISTRATION (60 rows)
# -------------------------------------------------------
reg_statuses = ['active', 'expired', 'suspended']

vehicle_registrations = []
for i in range(1, 61):
    expiry = fake.date_between(start_date='-1y', end_date='+2y')
    vehicle_registrations.append([
        i,
        i,  # one per vehicle
        fake.unique.bothify('REG-######').upper(),
        expiry.strftime('%Y-%m-%d'),
        random.choice(reg_statuses)
    ])
write_csv('VEHICLE_REGISTRATION.csv', ['RegistrationID','VehicleID','RegistrationNumber','ExpiryDate','Status'], vehicle_registrations)

# -------------------------------------------------------
# 10. VERIFICATION_CHECKLIST (100 rows)
# -------------------------------------------------------
checklists = []
for i in range(1, 101):
    checklists.append([
        i,
        i,  # one per user
        random.randint(0, 1),
        random.randint(0, 1),
        random.randint(0, 1),
        random.randint(0, 1),
        fake.date_time_between(start_date='-1y', end_date='now').strftime('%Y-%m-%d %H:%M:%S')
    ])
write_csv('VERIFICATION_CHECKLIST.csv', ['CheckListID','UserID','IdentityVerified','VehicleRegistered','ProfileCompleted','PaymentSetup','UpdatedAt'], checklists)

print("\nAll CSV files generated successfully!")