/**
 * Development seed data ONLY. Never run against a production database.
 *
 * Creates one company, one user per role (two operators), three sample
 * vehicles (one assigned to an operator), two sample customers, and the
 * standard expense category list. Safe to re-run — every record is
 * upserted on a stable natural key.
 */
import { PrismaClient, UserRole, VehicleCategory, VehicleStatus, FuelType } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const DEV_PASSWORD = "ChangeMe123!";
const COMPANY_NAME = "SV Cranes (Demo)";

const DEV_USERS: { name: string; email: string; role: UserRole; phone: string; employeeCode: string }[] = [
  { name: "Vikram Rao", email: "owner@svcranes.dev", role: UserRole.SUPER_ADMIN, phone: "+91 90000 00001", employeeCode: "EMP-01" },
  { name: "Neha Kulkarni", email: "manager@svcranes.dev", role: UserRole.MANAGER, phone: "+91 90000 00002", employeeCode: "EMP-02" },
  { name: "Ramesh Iyer", email: "accountant@svcranes.dev", role: UserRole.ACCOUNTANT, phone: "+91 90000 00003", employeeCode: "EMP-03" },
  { name: "Suresh Pillai", email: "supervisor@svcranes.dev", role: UserRole.SUPERVISOR, phone: "+91 90000 00004", employeeCode: "EMP-04" },
  { name: "Ajay Singh", email: "operator1@svcranes.dev", role: UserRole.OPERATOR, phone: "+91 90000 00005", employeeCode: "EMP-05" },
  { name: "Dinesh Kumar", email: "operator2@svcranes.dev", role: UserRole.OPERATOR, phone: "+91 90000 00006", employeeCode: "EMP-06" },
];

/** The standard expense category list for Phase 1. */
const EXPENSE_CATEGORIES = [
  "Fuel",
  "Repair",
  "Spare Parts",
  "Tyres",
  "Toll",
  "Parking",
  "Operator Expense",
  "Driver Expense",
  "Accommodation",
  "Food",
  "Transportation",
  "Insurance",
  "Permit",
  "Tax",
  "Maintenance",
  "Miscellaneous",
];

async function main() {
  console.log(`Seeding development data for "${COMPANY_NAME}"...`);

  const company = await prisma.company.upsert({
    where: { id: "seed-company-sv-cranes" },
    update: {},
    create: {
      id: "seed-company-sv-cranes",
      name: COMPANY_NAME,
      phone: "+91 90000 00000",
      email: "office@svcranes.dev",
      address: "Plot 12, Industrial Estate, Pune, Maharashtra",
    },
  });

  const passwordHash = await hash(DEV_PASSWORD, 12);
  const userIdByEmail = new Map<string, string>();

  for (const user of DEV_USERS) {
    const record = await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role, phone: user.phone, employeeCode: user.employeeCode, companyId: company.id },
      create: {
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        employeeCode: user.employeeCode,
        companyId: company.id,
        passwordHash,
        isActive: true,
      },
    });
    userIdByEmail.set(user.email, record.id);
  }

  const operator1Id = userIdByEmail.get("operator1@svcranes.dev");

  const vehicles = [
    {
      code: "CR-01",
      name: "Crane 01",
      registrationNumber: "MH12AB1234",
      category: VehicleCategory.CRANE,
      capacityTons: 25,
      make: "Tadano",
      model: "GR-250N",
      year: 2019,
      status: VehicleStatus.WORKING,
      currentHourMeter: 4820,
      assignedOperatorId: operator1Id ?? null,
    },
    {
      code: "CR-02",
      name: "Crane 02",
      registrationNumber: "MH12AB5678",
      category: VehicleCategory.CRANE,
      capacityTons: 50,
      make: "Liebherr",
      model: "LTM 1050",
      year: 2017,
      status: VehicleStatus.IDLE,
      currentHourMeter: 6120,
      assignedOperatorId: null,
    },
    {
      code: "TR-01",
      name: "Support Truck 01",
      registrationNumber: "MH12CD4321",
      category: VehicleCategory.TRUCK,
      capacityTons: 9,
      make: "Tata",
      model: "LPT 1613",
      year: 2020,
      fuelType: FuelType.DIESEL,
      status: VehicleStatus.MAINTENANCE,
      currentOdometer: 58230,
      assignedOperatorId: null,
    },
  ];

  for (const vehicle of vehicles) {
    await prisma.vehicle.upsert({
      where: { registrationNumber: vehicle.registrationNumber },
      update: {
        name: vehicle.name,
        code: vehicle.code,
        category: vehicle.category,
        status: vehicle.status,
        assignedOperatorId: vehicle.assignedOperatorId,
      },
      create: { ...vehicle, companyId: company.id },
    });
  }

  const customers = [
    {
      id: "seed-customer-skyline",
      name: "Skyline Constructions Pvt Ltd",
      contactPerson: "Priya Menon",
      phone: "+91 98000 11111",
      email: "accounts@skylineconstructions.example",
    },
    {
      id: "seed-customer-metro",
      name: "Metro Infra Projects",
      contactPerson: "Arjun Nair",
      phone: "+91 98000 22222",
      email: "accounts@metroinfra.example",
    },
  ];

  for (const customer of customers) {
    await prisma.customer.upsert({
      where: { id: customer.id },
      update: { name: customer.name, contactPerson: customer.contactPerson },
      create: { ...customer, companyId: company.id },
    });
  }

  for (const name of EXPENSE_CATEGORIES) {
    await prisma.expenseCategory.upsert({
      where: { companyId_name: { companyId: company.id, name } },
      update: { isActive: true },
      create: { companyId: company.id, name },
    });
  }

  // Retire categories from earlier seed iterations that aren't part of the
  // Phase 1 canonical list and have no expenses referencing them yet.
  const obsolete = await prisma.expenseCategory.findMany({
    where: { companyId: company.id, name: { notIn: EXPENSE_CATEGORIES } },
    include: { _count: { select: { expenses: true } } },
  });
  for (const category of obsolete) {
    if (category._count.expenses === 0) {
      await prisma.expenseCategory.delete({ where: { id: category.id } });
    }
  }

  console.log("Seed complete.");
  console.log("");
  console.log("Development sign-in credentials (local use only):");
  for (const user of DEV_USERS) {
    console.log(`  ${user.role.padEnd(12)} ${user.email}  /  ${DEV_PASSWORD}`);
  }
  console.log("");
  console.log("These accounts and this password are for local development only — never reuse in production.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
