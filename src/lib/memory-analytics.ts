import { randomUUID } from "node:crypto";
import { ensureCoreMemoryTables } from "@/lib/db";
import { getDb } from "@/lib/turso";

type InjectionEventRecord = {
  id: string;
  userId: string;
  memoryIds: string[];
  resultCount: number;
  conversationId: string | null;
  createdAt: string;
};

export type QualitySignalRecord = {
  id: string;
  userId: string;
  conversationId: string | null;
  signalType: string;
  patternMatched: string;
  createdAt: string;
};

export type DetectedQualitySignal = Pick<QualitySignalRecord, "signalType" | "patternMatched">;

export type TrendPoint = {
  date: string;
  label: string;
  value: number;
};

export type TopMemoryRecord = {
  id: string;
  title: string;
  accessCount: number;
};

export type PatternBreakdownRecord = {
  pattern: string;
  signalType: string;
  count: number;
};

export type FlaggedConversationRecord = {
  conversationId: string;
  signalCount: number;
  lastSignalAt: string;
};

export type MemoryAnalyticsDashboard = {
  memoryActivity: {
    recallsThisWeek: number;
    recallsPreviousWeek: number;
    recallsTrend: TrendPoint[];
    memoriesCreatedThisWeek: number;
    memoriesCreatedPreviousWeek: number;
    memoriesCreatedTrend: TrendPoint[];
    mostAccessedMemories: TopMemoryRecord[];
  };
  qualitySignals: {
    correctionEvents: QualitySignalRecord[];
    patternBreakdown: PatternBreakdownRecord[];
    flaggedConversations: FlaggedConversationRecord[];
  };
  injectionLog: {
    total: number;
    events: InjectionEventRecord[];
  };
};

type QualityPattern = {
  signalType: string;
  label: string;
  pattern: RegExp;
};

const QUALITY_PATTERNS: QualityPattern[] = [
  {
    signalType: "correction",
    label: "actually / no wait / I meant",
    pattern: /\b(actually|no wait|I meant|correction|sorry,? I meant)\b/i,
  },
  {
    signalType: "correction",
    label: "not X but Y",
    pattern: /\bnot .{1,30},? but\b/i,
  },
  {
    signalType: "review",
    label: "that is wrong / incorrect",
    pattern: /\b(that(?:'s| is) wrong|incorrect|not correct|you got that wrong)\b/i,
  },
  {
    signalType: "review",
    label: "change/update previous answer",
    pattern: /\b(change|update|fix|revise) (?:that|this|your answer|the answer)\b/i,
  },
];

let initialized = false;
let initializingPromise: Promise<void> | null = null;

function normalizeConversationId(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function createAnalyticsConversationId(
  namespace: "chatbot" | "session",
  id: string,
): string {
  return `${namespace}:${id}`;
}

async function getTableColumns(tableName: string): Promise<string[]> {
  const client = getDb();
  const result = await client.execute(`PRAGMA table_info(${tableName})`);
  return result.rows
    .map((row) => String((row as Record<string, unknown>).name ?? ""))
    .filter(Boolean);
}

async function ensureAnalyticsTables(): Promise<void> {
  if (initialized) {
    return;
  }

  if (initializingPromise) {
    await initializingPromise;
    return;
  }

  const client = getDb();
  initializingPromise = (async () => {
    const injectionColumns = await getTableColumns("injection_events");
    if (injectionColumns.length === 0) {
      await client.executeMultiple(`
        CREATE TABLE injection_events (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          memory_ids TEXT NOT NULL,
          result_count INTEGER NOT NULL DEFAULT 0,
          conversation_id TEXT,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_injection_events_user_created_at
        ON injection_events(user_id, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_injection_events_user_conversation_created_at
        ON injection_events(user_id, conversation_id, created_at DESC);
      `);
    } else if (injectionColumns.includes("query") || !injectionColumns.includes("result_count")) {
      await client.executeMultiple(`
        DROP INDEX IF EXISTS idx_injection_events_user_created_at;
        DROP INDEX IF EXISTS idx_injection_events_user_conversation_created_at;

        CREATE TABLE injection_events_new (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          memory_ids TEXT NOT NULL,
          result_count INTEGER NOT NULL DEFAULT 0,
          conversation_id TEXT,
          created_at TEXT NOT NULL
        );

        INSERT INTO injection_events_new (
          id, user_id, memory_ids, result_count, conversation_id, created_at
        )
        SELECT
          id,
          user_id,
          memory_ids,
          0,
          conversation_id,
          created_at
        FROM injection_events;

        DROP TABLE injection_events;
        ALTER TABLE injection_events_new RENAME TO injection_events;

        CREATE INDEX IF NOT EXISTS idx_injection_events_user_created_at
        ON injection_events(user_id, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_injection_events_user_conversation_created_at
        ON injection_events(user_id, conversation_id, created_at DESC);
      `);
    }

    const qualitySignalColumns = await getTableColumns("quality_signals");
    if (qualitySignalColumns.length === 0) {
      await client.executeMultiple(`
        CREATE TABLE quality_signals (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          conversation_id TEXT,
          signal_type TEXT NOT NULL,
          pattern_matched TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_quality_signals_user_created_at
        ON quality_signals(user_id, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_quality_signals_user_conversation_created_at
        ON quality_signals(user_id, conversation_id, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_quality_signals_user_pattern_created_at
        ON quality_signals(user_id, pattern_matched, created_at DESC);
      `);
    } else if (qualitySignalColumns.includes("snippet")) {
      await client.executeMultiple(`
        DROP INDEX IF EXISTS idx_quality_signals_user_created_at;
        DROP INDEX IF EXISTS idx_quality_signals_user_conversation_created_at;
        DROP INDEX IF EXISTS idx_quality_signals_user_pattern_created_at;

        CREATE TABLE quality_signals_new (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          conversation_id TEXT,
          signal_type TEXT NOT NULL,
          pattern_matched TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        INSERT INTO quality_signals_new (
          id, user_id, conversation_id, signal_type, pattern_matched, created_at
        )
        SELECT
          id,
          user_id,
          conversation_id,
          signal_type,
          pattern_matched,
          created_at
        FROM quality_signals;

        DROP TABLE quality_signals;
        ALTER TABLE quality_signals_new RENAME TO quality_signals;

        CREATE INDEX IF NOT EXISTS idx_quality_signals_user_created_at
        ON quality_signals(user_id, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_quality_signals_user_conversation_created_at
        ON quality_signals(user_id, conversation_id, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_quality_signals_user_pattern_created_at
        ON quality_signals(user_id, pattern_matched, created_at DESC);
      `);
    }

    initialized = true;
    initializingPromise = null;
  })().catch((error) => {
    initializingPromise = null;
    throw error;
  });

  await initializingPromise;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function buildTrend(rows: Array<Record<string, unknown>>, days: number): TrendPoint[] {
  const today = startOfDay(new Date());
  const start = addDays(today, -(days - 1));
  const counts = new Map<string, number>();

  for (const row of rows) {
    const date = typeof row.day === "string" ? row.day : "";
    if (date) {
      counts.set(date, Number(row.count ?? 0));
    }
  }

  return Array.from({ length: days }, (_, index) => {
    const pointDate = addDays(start, index);
    const isoDate = pointDate.toISOString().slice(0, 10);
    return {
      date: isoDate,
      label: pointDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      value: counts.get(isoDate) ?? 0,
    };
  });
}

function mapInjectionEvent(row: Record<string, unknown>): InjectionEventRecord {
  let memoryIds: string[] = [];
  if (typeof row.memory_ids === "string" && row.memory_ids.trim()) {
    try {
      const parsed = JSON.parse(row.memory_ids) as unknown;
      if (Array.isArray(parsed)) {
        memoryIds = parsed.filter((value): value is string => typeof value === "string");
      }
    } catch {
      memoryIds = [];
    }
  }

  return {
    id: String(row.id),
    userId: String(row.user_id),
    memoryIds,
    resultCount: Number(row.result_count ?? memoryIds.length),
    conversationId: row.conversation_id ? String(row.conversation_id) : null,
    createdAt: String(row.created_at),
  };
}

function mapQualitySignal(row: Record<string, unknown>): QualitySignalRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    conversationId: row.conversation_id ? String(row.conversation_id) : null,
    signalType: String(row.signal_type),
    patternMatched: String(row.pattern_matched),
    createdAt: String(row.created_at),
  };
}

export function detectQualitySignals(text: string): DetectedQualitySignal[] {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return [];
  }

  const signals: DetectedQualitySignal[] = [];

  for (const candidate of QUALITY_PATTERNS) {
    if (!candidate.pattern.test(normalized)) {
      continue;
    }

    signals.push({
      signalType: candidate.signalType,
      patternMatched: candidate.label,
    });
  }

  return signals;
}

export async function recordInjectionEvent(params: {
  userId: string;
  memoryIds: string[];
  resultCount: number;
  conversationId?: string | null;
  createdAt?: string;
}): Promise<void> {
  await ensureAnalyticsTables();

  const memoryIds = Array.from(
    new Set(params.memoryIds.map((id) => id.trim()).filter(Boolean)),
  );

  const client = getDb();
  await client.execute({
    sql: `
      INSERT INTO injection_events (
        id, user_id, memory_ids, result_count, conversation_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    args: [
      randomUUID(),
      params.userId,
      JSON.stringify(memoryIds),
      Math.max(0, Math.floor(params.resultCount)),
      normalizeConversationId(params.conversationId),
      params.createdAt ?? new Date().toISOString(),
    ],
  });
}

export async function recordQualitySignals(params: {
  userId: string;
  conversationId?: string | null;
  signals: DetectedQualitySignal[];
  createdAt?: string;
}): Promise<number> {
  await ensureAnalyticsTables();

  if (params.signals.length === 0) {
    return 0;
  }

  const client = getDb();
  const createdAt = params.createdAt ?? new Date().toISOString();

  for (const signal of params.signals) {
    await client.execute({
      sql: `
        INSERT INTO quality_signals (
          id, user_id, conversation_id, signal_type, pattern_matched, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [
        randomUUID(),
        params.userId,
        normalizeConversationId(params.conversationId),
        signal.signalType,
        signal.patternMatched,
        createdAt,
      ],
    });
  }

  return params.signals.length;
}

export async function getMemoryAnalyticsDashboard(
  userId: string,
  options?: { conversationId?: string | null; logLimit?: number },
): Promise<MemoryAnalyticsDashboard> {
  await ensureCoreMemoryTables();
  await ensureAnalyticsTables();

  const client = getDb();
  const now = new Date();
  const thisWeekCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const previousWeekCutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const logLimit = options?.logLimit ?? 200;
  const conversationId = normalizeConversationId(options?.conversationId);

  const recallCountResult = await client.execute({
    sql: `
      SELECT
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS this_week,
        SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS previous_week
      FROM injection_events
      WHERE user_id = ?
    `,
    args: [thisWeekCutoff, previousWeekCutoff, thisWeekCutoff, userId],
  });

  const recallTrendResult = await client.execute({
    sql: `
      SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
      FROM injection_events
      WHERE user_id = ? AND created_at >= ?
      GROUP BY substr(created_at, 1, 10)
      ORDER BY day ASC
    `,
    args: [userId, thisWeekCutoff],
  });

  const memoryCountResult = await client.execute({
    sql: `
      SELECT
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS this_week,
        SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS previous_week
      FROM memories
      WHERE user_id = ? AND archived_at IS NULL
    `,
    args: [thisWeekCutoff, previousWeekCutoff, thisWeekCutoff, userId],
  });

  const memoryTrendResult = await client.execute({
    sql: `
      SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
      FROM memories
      WHERE user_id = ? AND archived_at IS NULL AND created_at >= ?
      GROUP BY substr(created_at, 1, 10)
      ORDER BY day ASC
    `,
    args: [userId, thisWeekCutoff],
  });

  const topMemoriesResult = await client.execute({
    sql: `
      SELECT id, title, access_count
      FROM memories
      WHERE user_id = ? AND archived_at IS NULL
      ORDER BY access_count DESC, created_at DESC
      LIMIT 10
    `,
    args: [userId],
  });

  const correctionEventsResult = await client.execute({
    sql: `
      SELECT id, user_id, conversation_id, signal_type, pattern_matched, created_at
      FROM quality_signals
      WHERE user_id = ?
        AND signal_type = 'correction'
        AND (? IS NULL OR conversation_id = ?)
      ORDER BY created_at DESC
      LIMIT 20
    `,
    args: [userId, conversationId, conversationId],
  });

  const patternBreakdownResult = await client.execute({
    sql: `
      SELECT pattern_matched, signal_type, COUNT(*) AS count
      FROM quality_signals
      WHERE user_id = ?
        AND (? IS NULL OR conversation_id = ?)
      GROUP BY pattern_matched, signal_type
      ORDER BY count DESC, pattern_matched ASC
      LIMIT 12
    `,
    args: [userId, conversationId, conversationId],
  });

  const flaggedConversationsResult = await client.execute({
    sql: `
      SELECT conversation_id, COUNT(*) AS signal_count, MAX(created_at) AS last_signal_at
      FROM quality_signals
      WHERE user_id = ?
        AND conversation_id IS NOT NULL
      GROUP BY conversation_id
      ORDER BY last_signal_at DESC
      LIMIT 20
    `,
    args: [userId],
  });

  const injectionCountResult = await client.execute({
    sql: `
      SELECT COUNT(*) AS total
      FROM injection_events
      WHERE user_id = ?
        AND (? IS NULL OR conversation_id = ?)
    `,
    args: [userId, conversationId, conversationId],
  });

  const injectionEventsResult = await client.execute({
    sql: `
      SELECT id, user_id, memory_ids, result_count, conversation_id, created_at
      FROM injection_events
      WHERE user_id = ?
        AND (? IS NULL OR conversation_id = ?)
      ORDER BY created_at DESC
      LIMIT ?
    `,
    args: [userId, conversationId, conversationId, logLimit],
  });

  const recallCountRow = recallCountResult.rows[0] as Record<string, unknown> | undefined;
  const memoryCountRow = memoryCountResult.rows[0] as Record<string, unknown> | undefined;
  const injectionCountRow = injectionCountResult.rows[0] as Record<string, unknown> | undefined;

  return {
    memoryActivity: {
      recallsThisWeek: Number(recallCountRow?.this_week ?? 0),
      recallsPreviousWeek: Number(recallCountRow?.previous_week ?? 0),
      recallsTrend: buildTrend(
        recallTrendResult.rows as Array<Record<string, unknown>>,
        7,
      ),
      memoriesCreatedThisWeek: Number(memoryCountRow?.this_week ?? 0),
      memoriesCreatedPreviousWeek: Number(memoryCountRow?.previous_week ?? 0),
      memoriesCreatedTrend: buildTrend(
        memoryTrendResult.rows as Array<Record<string, unknown>>,
        7,
      ),
      mostAccessedMemories: topMemoriesResult.rows.map((row) => ({
        id: String((row as Record<string, unknown>).id),
        title: String((row as Record<string, unknown>).title),
        accessCount: Number((row as Record<string, unknown>).access_count ?? 0),
      })),
    },
    qualitySignals: {
      correctionEvents: correctionEventsResult.rows.map((row) =>
        mapQualitySignal(row as Record<string, unknown>),
      ),
      patternBreakdown: patternBreakdownResult.rows.map((row) => ({
        pattern: String((row as Record<string, unknown>).pattern_matched),
        signalType: String((row as Record<string, unknown>).signal_type),
        count: Number((row as Record<string, unknown>).count ?? 0),
      })),
      flaggedConversations: flaggedConversationsResult.rows.map((row) => ({
        conversationId: String((row as Record<string, unknown>).conversation_id),
        signalCount: Number((row as Record<string, unknown>).signal_count ?? 0),
        lastSignalAt: String((row as Record<string, unknown>).last_signal_at),
      })),
    },
    injectionLog: {
      total: Number(injectionCountRow?.total ?? 0),
      events: injectionEventsResult.rows.map((row) =>
        mapInjectionEvent(row as Record<string, unknown>),
      ),
    },
  };
}
