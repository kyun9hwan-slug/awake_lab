import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import {
  blockingStatuses,
  defaultConfig,
  type BookingStatus,
  type DiscountType,
  type ServiceKey,
  type SiteConfig,
} from "@/lib/site-config";
import {
  formatDisplayTimeRange,
  getDailyClosingHour,
  getSlotStartHours,
  hoursOverlap,
  isClosedDate,
} from "@/lib/time";

export interface BookingRecord {
  id: string;
  applicantName: string;
  phone: string;
  email: string;
  teamName: string;
  headCount: number;
  extraPeople: number;
  discountType: DiscountType;
  serviceKey: ServiceKey;
  date: string;
  startHour: number;
  durationHours: number;
  totalPrice: number;
  withEngineer: boolean;
  attachmentPath: string | null;
  attachmentName: string | null;
  status: BookingStatus;
  createdAt: string;
}

export interface HoldRecord {
  id: string;
  sessionToken: string;
  date: string;
  startHour: number;
  durationHours: number;
  expiresAt: string;
  createdAt: string;
}

export interface DiscountCodeRecord {
  code: string;
  discountRate: number;
  description: string;
  createdAt: string;
}

interface Interval {
  startHour: number;
  durationHours: number;
}

interface HoldInput {
  sessionToken: string;
  date: string;
  startHour: number;
  durationHours: number;
  replaceHoldId?: string;
}

interface BookingInput {
  applicantName: string;
  phone: string;
  email: string;
  teamName: string;
  headCount: number;
  extraPeople: number;
  discountType: DiscountType;
  serviceKey: ServiceKey;
  date: string;
  startHour: number;
  durationHours: number;
  totalPrice: number;
  withEngineer: boolean;
  attachmentPath?: string | null;
  attachmentName?: string | null;
}

let database: Database.Database | null = null;

function toDiscountCodeRecord(row: Record<string, unknown>): DiscountCodeRecord {
  return {
    code: String(row.code),
    discountRate: Number(row.discount_rate),
    description: String(row.description),
    createdAt: String(row.created_at),
  };
}

export function getDiscountCodes(): DiscountCodeRecord[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM discount_codes ORDER BY created_at DESC")
    .all()
    .map((row) => toDiscountCodeRecord(row as Record<string, unknown>));
}

export function createDiscountCode(code: string, discountRate: number, description: string): DiscountCodeRecord {
  const db = getDb();
  const createdAt = nowIso();
  db.prepare("INSERT INTO discount_codes (code, discount_rate, description, created_at) VALUES (?, ?, ?, ?)").run(
    code,
    discountRate,
    description,
    createdAt
  );
  return { code, discountRate, description, createdAt };
}

export function deleteDiscountCode(code: string): void {
  const db = getDb();
  db.prepare("DELETE FROM discount_codes WHERE code = ?").run(code);
}

export function getDiscountCode(code: string): DiscountCodeRecord | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM discount_codes WHERE code = ?").get(code) as Record<string, unknown> | undefined;
  return row ? toDiscountCodeRecord(row) : null;
}


function getDb(): Database.Database {
  if (database) {
    return database;
  }

  const dataDir = path.join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "awakelab.sqlite");

  database = new Database(dbPath);
  database.pragma("journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      applicant_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      team_name TEXT NOT NULL,
      head_count INTEGER NOT NULL,
      extra_people INTEGER NOT NULL,
      discount_type TEXT NOT NULL,
      service_key TEXT NOT NULL,
      date TEXT NOT NULL,
      start_hour INTEGER NOT NULL,
      duration_hours INTEGER NOT NULL,
      total_price INTEGER NOT NULL,
      with_engineer INTEGER NOT NULL DEFAULT 0,
      attachment_path TEXT,
      attachment_name TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS holds (
      id TEXT PRIMARY KEY,
      session_token TEXT NOT NULL,
      date TEXT NOT NULL,
      start_hour INTEGER NOT NULL,
      duration_hours INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const existingConfig = database
    .prepare("SELECT data FROM app_config WHERE id = 1")
    .get() as { data: string } | undefined;

  if (!existingConfig) {
    database
      .prepare("INSERT INTO app_config (id, data) VALUES (1, ?)")
      .run(JSON.stringify(defaultConfig));
  }

  const bookingColumns = database.prepare("PRAGMA table_info(bookings)").all() as Array<{ name: string }>;
  if (!bookingColumns.some((column) => column.name === "with_engineer")) {
    database.exec("ALTER TABLE bookings ADD COLUMN with_engineer INTEGER NOT NULL DEFAULT 0");
  }

  return database;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeConfig(config: Partial<SiteConfig>): SiteConfig {
  const savedServices = Array.isArray(config.services) ? config.services : [];

  return {
    ...defaultConfig,
    ...config,
    equipmentItems: Array.isArray(config.equipmentItems) ? config.equipmentItems : defaultConfig.equipmentItems,
    requiredNotices: Array.isArray(config.requiredNotices)
      ? config.requiredNotices
      : defaultConfig.requiredNotices,
    heroImages: Array.isArray(config.heroImages) ? config.heroImages : defaultConfig.heroImages,
    services: defaultConfig.services.map((service) => {
      const saved = savedServices.find((item) => item.key === service.key);
      return {
        ...service,
        ...saved,
      };
    }),
  };
}

export function cleanupExpiredHolds(): void {
  const db = getDb();
  db.prepare("DELETE FROM holds WHERE expires_at <= ?").run(nowIso());
}

export function getConfig(): SiteConfig {
  const db = getDb();
  const row = db.prepare("SELECT data FROM app_config WHERE id = 1").get() as { data: string };
  return normalizeConfig(JSON.parse(row.data) as Partial<SiteConfig>);
}

export function saveConfig(config: SiteConfig): SiteConfig {
  const db = getDb();
  const normalized = normalizeConfig(config);
  db.prepare("UPDATE app_config SET data = ? WHERE id = 1").run(JSON.stringify(normalized));
  return normalized;
}

function toBookingRecord(row: Record<string, unknown>): BookingRecord {
  return {
    id: String(row.id),
    applicantName: String(row.applicant_name),
    phone: String(row.phone),
    email: String(row.email),
    teamName: String(row.team_name),
    headCount: Number(row.head_count),
    extraPeople: Number(row.extra_people),
    discountType: row.discount_type as DiscountType,
    serviceKey: row.service_key as ServiceKey,
    date: String(row.date),
    startHour: Number(row.start_hour),
    durationHours: Number(row.duration_hours),
    totalPrice: Number(row.total_price),
    withEngineer: Number(row.with_engineer ?? 0) === 1,
    attachmentPath: row.attachment_path ? String(row.attachment_path) : null,
    attachmentName: row.attachment_name ? String(row.attachment_name) : null,
    status: row.status as BookingStatus,
    createdAt: String(row.created_at),
  };
}

function toHoldRecord(row: Record<string, unknown>): HoldRecord {
  return {
    id: String(row.id),
    sessionToken: String(row.session_token),
    date: String(row.date),
    startHour: Number(row.start_hour),
    durationHours: Number(row.duration_hours),
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
  };
}

export function getBookings(): BookingRecord[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM bookings ORDER BY date DESC, start_hour DESC, created_at DESC")
    .all()
    .map((row) => toBookingRecord(row as Record<string, unknown>));
}

export function updateBookingStatus(id: string, status: BookingStatus): BookingRecord | null {
  const db = getDb();
  db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(status, id);
  const row = db.prepare("SELECT * FROM bookings WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? toBookingRecord(row) : null;
}

function getBlockingIntervals(date: string, sessionToken?: string, excludeHoldId?: string): Interval[] {
  const db = getDb();
  cleanupExpiredHolds();

  const bookingRows = db
    .prepare(
      `SELECT start_hour, duration_hours FROM bookings
       WHERE date = ? AND status IN (${blockingStatuses.map(() => "?").join(",")})`,
    )
    .all(date, ...blockingStatuses) as Array<Record<string, unknown>>;

  const holdRows = db
    .prepare(
      `SELECT id, start_hour, duration_hours FROM holds
       WHERE date = ? AND expires_at > ?
         AND (? IS NULL OR session_token != ?)
         AND (? IS NULL OR id != ?)`,
    )
    .all(
      date,
      nowIso(),
      sessionToken ?? null,
      sessionToken ?? null,
      excludeHoldId ?? null,
      excludeHoldId ?? null,
    ) as Array<Record<string, unknown>>;

  return [
    ...bookingRows.map((row) => ({
      startHour: Number(row.start_hour),
      durationHours: Number(row.duration_hours),
    })),
    ...holdRows.map((row) => ({
      startHour: Number(row.start_hour),
      durationHours: Number(row.duration_hours),
    })),
  ];
}

function hasConflict(
  date: string,
  startHour: number,
  durationHours: number,
  sessionToken?: string,
  excludeHoldId?: string,
): boolean {
  return getBlockingIntervals(date, sessionToken, excludeHoldId).some((interval) =>
    hoursOverlap(startHour, durationHours, interval.startHour, interval.durationHours),
  );
}

function computeMaxDuration(
  date: string,
  startHour: number,
  config: SiteConfig,
  sessionToken?: string,
  excludeHoldId?: string,
): number {
  const closingHour = getDailyClosingHour(date, config);
  let durationHours = config.minBookingHours;

  while (startHour + durationHours <= closingHour) {
    const nextDuration = durationHours + 1;
    if (startHour + nextDuration > closingHour) {
      break;
    }

    if (hasConflict(date, startHour, nextDuration, sessionToken, excludeHoldId)) {
      break;
    }

    durationHours = nextDuration;
  }

  return durationHours;
}

export function getAvailabilityForDate(date: string, sessionToken?: string) {
  const config = getConfig();
  if (isClosedDate(date, config)) {
    return [];
  }

  return getSlotStartHours(date, config).map((startHour) => {
    const available = !hasConflict(date, startHour, config.minBookingHours, sessionToken);
    const maxDuration = available ? computeMaxDuration(date, startHour, config, sessionToken) : 0;

    return {
      startHour,
      available,
      maxDuration,
      displayRange: formatDisplayTimeRange(startHour, config.minBookingHours),
    };
  });
}

export function getMonthAvailability(monthKey: string, sessionToken?: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const config = getConfig();

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = `${monthKey}-${String(day).padStart(2, "0")}`;
    if (isClosedDate(date, config)) {
      return { date, status: "closed", availableStarts: 0 };
    }

    const slots = getAvailabilityForDate(date, sessionToken);
    const availableStarts = slots.filter((slot) => slot.available).length;

    return {
      date,
      status: availableStarts > 0 ? "available" : "full",
      availableStarts,
    };
  });
}

export function createHold({ sessionToken, date, startHour, durationHours, replaceHoldId }: HoldInput): HoldRecord {
  const db = getDb();
  const config = getConfig();
  cleanupExpiredHolds();

  if (replaceHoldId) {
    db.prepare("DELETE FROM holds WHERE id = ? AND session_token = ?").run(replaceHoldId, sessionToken);
  }

  const closingHour = getDailyClosingHour(date, config);
  if (isClosedDate(date, config) || startHour + durationHours > closingHour) {
    throw new Error("운영 시간 밖의 예약입니다.");
  }

  if (durationHours < config.minBookingHours) {
    throw new Error("최소 예약 시간보다 짧습니다.");
  }

  if (hasConflict(date, startHour, durationHours, sessionToken, replaceHoldId)) {
    throw new Error("이미 선점된 시간입니다.");
  }

  const id = randomUUID();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + config.holdMinutes * 60_000).toISOString();

  db.prepare(
    `INSERT INTO holds (id, session_token, date, start_hour, duration_hours, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, sessionToken, date, startHour, durationHours, expiresAt, createdAt);

  return { id, sessionToken, date, startHour, durationHours, expiresAt, createdAt };
}

export function releaseHold(id: string, sessionToken?: string): void {
  const db = getDb();
  if (sessionToken) {
    db.prepare("DELETE FROM holds WHERE id = ? AND session_token = ?").run(id, sessionToken);
    return;
  }
  db.prepare("DELETE FROM holds WHERE id = ?").run(id);
}

export function createBooking(input: BookingInput, holdId?: string, sessionToken?: string): BookingRecord {
  const db = getDb();
  const config = getConfig();
  cleanupExpiredHolds();

  const closingHour = getDailyClosingHour(input.date, config);
  if (isClosedDate(input.date, config) || input.startHour + input.durationHours > closingHour) {
    throw new Error("운영 시간 밖의 예약입니다.");
  }

  if (holdId) {
    const holdRow = db
      .prepare("SELECT * FROM holds WHERE id = ? AND session_token = ? AND expires_at > ?")
      .get(holdId, sessionToken ?? "", nowIso()) as Record<string, unknown> | undefined;

    if (!holdRow) {
      throw new Error("시간 선점이 만료되었습니다. 다시 선택해 주세요.");
    }

    const hold = toHoldRecord(holdRow);
    if (hold.date !== input.date || hold.startHour !== input.startHour || hold.durationHours !== input.durationHours) {
      throw new Error("선점된 시간과 예약 정보가 다릅니다.");
    }
  }

  if (hasConflict(input.date, input.startHour, input.durationHours, sessionToken, holdId)) {
    throw new Error("이미 예약이 접수된 시간입니다.");
  }

  const id = randomUUID();
  const createdAt = nowIso();

  db.prepare(
    `INSERT INTO bookings (
      id, applicant_name, phone, email, team_name, head_count, extra_people,
      discount_type, service_key, date, start_hour, duration_hours, total_price,
      with_engineer, attachment_path, attachment_name, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.applicantName,
    input.phone,
    input.email,
    input.teamName,
    input.headCount,
    input.extraPeople,
    input.discountType,
    input.serviceKey,
    input.date,
    input.startHour,
    input.durationHours,
    input.totalPrice,
    input.withEngineer ? 1 : 0,
    input.attachmentPath ?? null,
    input.attachmentName ?? null,
    "pending",
    createdAt,
  );

  if (holdId) {
    releaseHold(holdId, sessionToken);
  }

  return {
    id,
    applicantName: input.applicantName,
    phone: input.phone,
    email: input.email,
    teamName: input.teamName,
    headCount: input.headCount,
    extraPeople: input.extraPeople,
    discountType: input.discountType,
    serviceKey: input.serviceKey,
    date: input.date,
    startHour: input.startHour,
    durationHours: input.durationHours,
    totalPrice: input.totalPrice,
    withEngineer: input.withEngineer,
    attachmentPath: input.attachmentPath ?? null,
    attachmentName: input.attachmentName ?? null,
    status: "pending",
    createdAt,
  };
}

export function getSaeedenWeeklyHours(phone: string, date: string): number {
  const db = getDb();
  const row = db.prepare(`
    SELECT SUM(duration_hours) as total_hours 
    FROM bookings 
    WHERE phone = ? 
      AND discount_type = 'saeeden' 
      AND status IN ('pending', 'approved')
      AND strftime('%Y-%W', date) = strftime('%Y-%W', ?)
  `).get(phone, date) as { total_hours: number | null };
  return row?.total_hours ?? 0;
}
