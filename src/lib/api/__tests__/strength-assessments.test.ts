import assert from "node:assert/strict";
import { describe, it, before, beforeEach } from "node:test";
import { mock } from "node:test";
import type {
  StrengthAssessment,
  StrengthPhysicalTests,
  StrengthQuestionnaire,
} from "../types.ts";

let fromImpl: (...args: unknown[]) => unknown;

const mockQuestionnaire = (): StrengthQuestionnaire => ({
  pain: [{ body_zone: "shoulder", intensity: 2 }],
  injury_history: "rien de notable",
  mobility_feel: 4,
  psychology: { confidence: 4, motivation: 5, stress: 2 },
  filled_at: "2026-05-01T10:00:00Z",
});

const mockPhysicalTests = (): StrengthPhysicalTests => ({
  mobility: { shoulder_flexion: 2, t_spine: 3, hip: 2 },
  movement: { scapula_control: 2, trunk_neck_alignment: 3, hip_hinge: 2 },
  filled_at: "2026-05-02T10:00:00Z",
});

const mockAssessment = (
  overrides: Partial<StrengthAssessment> = {},
): StrengthAssessment => ({
  id: "a1",
  athlete_id: 42,
  coach_id: 7,
  status: "questionnaire_pending",
  questionnaire: null,
  physical_tests: null,
  bucket_scores: null,
  data_confidence: "low",
  created_at: "2026-05-01T10:00:00Z",
  updated_at: "2026-05-01T10:00:00Z",
  ...overrides,
});

before(async () => {
  const real = await import("../client.ts");
  mock.module("../client.ts", {
    namedExports: {
      ...real,
      canUseSupabase: () => true,
      supabase: {
        from: (...args: unknown[]) => fromImpl(...args),
      },
    },
  });
});

beforeEach(() => {
  fromImpl = () => { throw new Error("fromImpl not configured for this test"); };
});

describe("strength-assessments API", () => {
  describe("createAssessment", () => {
    it("inserts into strength_assessments with athlete_id/coach_id and returns the row", async () => {
      let capturedTable: unknown;
      let capturedInsert: Record<string, unknown> | undefined;
      const row = mockAssessment({ id: "a99" });
      fromImpl = (table: unknown) => {
        capturedTable = table;
        return {
          insert: (payload: unknown) => {
            capturedInsert = payload as Record<string, unknown>;
            return {
              select: () => ({
                single: () => Promise.resolve({ data: row, error: null }),
              }),
            };
          },
        };
      };
      const { createAssessment } = await import("../strength-assessments.ts");
      const result = await createAssessment({ athlete_id: 42, coach_id: 7 });
      assert.equal(capturedTable, "strength_assessments");
      assert.equal(capturedInsert?.athlete_id, 42);
      assert.equal(capturedInsert?.coach_id, 7);
      assert.equal(result.id, "a99");
    });

    it("accepts a null coach_id", async () => {
      let capturedInsert: Record<string, unknown> | undefined;
      fromImpl = () => ({
        insert: (payload: unknown) => {
          capturedInsert = payload as Record<string, unknown>;
          return {
            select: () => ({
              single: () => Promise.resolve({ data: mockAssessment(), error: null }),
            }),
          };
        },
      });
      const { createAssessment } = await import("../strength-assessments.ts");
      await createAssessment({ athlete_id: 42, coach_id: null });
      assert.equal(capturedInsert?.athlete_id, 42);
      assert.equal(capturedInsert?.coach_id, null);
    });

    it("throws on supabase error", async () => {
      fromImpl = () => ({
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: null, error: { message: "insert failed" } }),
          }),
        }),
      });
      const { createAssessment } = await import("../strength-assessments.ts");
      await assert.rejects(
        () => createAssessment({ athlete_id: 42, coach_id: 7 }),
        /insert failed/,
      );
    });
  });

  describe("getLatestAssessment", () => {
    it("filters by athlete_id, orders created_at desc, limit 1, returns first row", async () => {
      let capturedTable: unknown;
      let capturedSelect: unknown;
      let capturedEq: [unknown, unknown] | undefined;
      let capturedOrder: [unknown, unknown] | undefined;
      let capturedLimit: unknown;
      const row = mockAssessment({ id: "latest" });
      fromImpl = (table: unknown) => {
        capturedTable = table;
        return {
          select: (cols: unknown) => {
            capturedSelect = cols;
            return {
              eq: (field: unknown, value: unknown) => {
                capturedEq = [field, value];
                return {
                  order: (col: unknown, opts: unknown) => {
                    capturedOrder = [col, opts];
                    return {
                      limit: (n: unknown) => {
                        capturedLimit = n;
                        return Promise.resolve({ data: [row], error: null });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      };
      const { getLatestAssessment } = await import("../strength-assessments.ts");
      const result = await getLatestAssessment(42);
      assert.equal(capturedTable, "strength_assessments");
      assert.equal(capturedSelect, "*");
      assert.deepEqual(capturedEq, ["athlete_id", 42]);
      assert.equal(capturedOrder?.[0], "created_at");
      assert.deepEqual(capturedOrder?.[1], { ascending: false });
      assert.equal(capturedLimit, 1);
      assert.equal(result?.id, "latest");
    });

    it("returns null when there are no rows", async () => {
      fromImpl = () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        }),
      });
      const { getLatestAssessment } = await import("../strength-assessments.ts");
      const result = await getLatestAssessment(42);
      assert.equal(result, null);
    });

    it("returns null when data is null", async () => {
      fromImpl = () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      });
      const { getLatestAssessment } = await import("../strength-assessments.ts");
      const result = await getLatestAssessment(42);
      assert.equal(result, null);
    });

    it("throws on supabase error", async () => {
      fromImpl = () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: null, error: { message: "latest failed" } }),
            }),
          }),
        }),
      });
      const { getLatestAssessment } = await import("../strength-assessments.ts");
      await assert.rejects(() => getLatestAssessment(42), /latest failed/);
    });
  });

  describe("getAssessment", () => {
    it("filters by id with maybeSingle and returns the row", async () => {
      let capturedTable: unknown;
      let capturedSelect: unknown;
      let capturedEq: [unknown, unknown] | undefined;
      const row = mockAssessment({ id: "a5" });
      fromImpl = (table: unknown) => {
        capturedTable = table;
        return {
          select: (cols: unknown) => {
            capturedSelect = cols;
            return {
              eq: (field: unknown, value: unknown) => {
                capturedEq = [field, value];
                return {
                  maybeSingle: () => Promise.resolve({ data: row, error: null }),
                };
              },
            };
          },
        };
      };
      const { getAssessment } = await import("../strength-assessments.ts");
      const result = await getAssessment("a5");
      assert.equal(capturedTable, "strength_assessments");
      assert.equal(capturedSelect, "*");
      assert.deepEqual(capturedEq, ["id", "a5"]);
      assert.equal(result?.id, "a5");
    });

    it("returns null when no row matches", async () => {
      fromImpl = () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      });
      const { getAssessment } = await import("../strength-assessments.ts");
      const result = await getAssessment("missing");
      assert.equal(result, null);
    });

    it("throws on supabase error", async () => {
      fromImpl = () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: { message: "get failed" } }),
          }),
        }),
      });
      const { getAssessment } = await import("../strength-assessments.ts");
      await assert.rejects(() => getAssessment("a5"), /get failed/);
    });
  });

  describe("listAssessments", () => {
    it("filters by athlete_id, orders created_at desc, returns the array", async () => {
      let capturedTable: unknown;
      let capturedSelect: unknown;
      let capturedEq: [unknown, unknown] | undefined;
      let capturedOrder: [unknown, unknown] | undefined;
      const rows = [
        mockAssessment({ id: "a2", created_at: "2026-05-10T00:00:00Z" }),
        mockAssessment({ id: "a1", created_at: "2026-05-01T00:00:00Z" }),
      ];
      fromImpl = (table: unknown) => {
        capturedTable = table;
        return {
          select: (cols: unknown) => {
            capturedSelect = cols;
            return {
              eq: (field: unknown, value: unknown) => {
                capturedEq = [field, value];
                return {
                  order: (col: unknown, opts: unknown) => {
                    capturedOrder = [col, opts];
                    return Promise.resolve({ data: rows, error: null });
                  },
                };
              },
            };
          },
        };
      };
      const { listAssessments } = await import("../strength-assessments.ts");
      const result = await listAssessments(42);
      assert.equal(capturedTable, "strength_assessments");
      assert.equal(capturedSelect, "*");
      assert.deepEqual(capturedEq, ["athlete_id", 42]);
      assert.equal(capturedOrder?.[0], "created_at");
      assert.deepEqual(capturedOrder?.[1], { ascending: false });
      assert.equal(result.length, 2);
      assert.equal(result[0].id, "a2");
    });

    it("returns [] when data is null", async () => {
      fromImpl = () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      });
      const { listAssessments } = await import("../strength-assessments.ts");
      const result = await listAssessments(42);
      assert.deepEqual(result, []);
    });

    it("throws on supabase error", async () => {
      fromImpl = () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: null, error: { message: "list failed" } }),
          }),
        }),
      });
      const { listAssessments } = await import("../strength-assessments.ts");
      await assert.rejects(() => listAssessments(42), /list failed/);
    });
  });

  describe("updateAssessmentQuestionnaire", () => {
    it("updates questionnaire + status bilan_pending filtered by id with select('id')", async () => {
      let capturedTable: unknown;
      let capturedUpdate: Record<string, unknown> | undefined;
      let capturedEq: [unknown, unknown] | undefined;
      let capturedSelect: unknown;
      const questionnaire = mockQuestionnaire();
      fromImpl = (table: unknown) => {
        capturedTable = table;
        return {
          update: (payload: unknown) => {
            capturedUpdate = payload as Record<string, unknown>;
            return {
              eq: (field: unknown, value: unknown) => {
                capturedEq = [field, value];
                return {
                  select: (cols: unknown) => {
                    capturedSelect = cols;
                    return Promise.resolve({ data: [{ id: "a1" }], error: null });
                  },
                };
              },
            };
          },
        };
      };
      const { updateAssessmentQuestionnaire } = await import("../strength-assessments.ts");
      await updateAssessmentQuestionnaire("a1", questionnaire);
      assert.equal(capturedTable, "strength_assessments");
      assert.deepEqual(capturedUpdate?.questionnaire, questionnaire);
      assert.equal(capturedUpdate?.status, "bilan_pending");
      assert.deepEqual(capturedEq, ["id", "a1"]);
      assert.equal(capturedSelect, "id");
    });

    it("throws when the update affects no rows (§113 silent no-op guard)", async () => {
      fromImpl = () => ({
        update: () => ({
          eq: () => ({
            select: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      });
      const { updateAssessmentQuestionnaire } = await import("../strength-assessments.ts");
      await assert.rejects(
        () => updateAssessmentQuestionnaire("missing", mockQuestionnaire()),
        /not found or not allowed/,
      );
    });

    it("throws on supabase error", async () => {
      fromImpl = () => ({
        update: () => ({
          eq: () => ({
            select: () => Promise.resolve({ data: null, error: { message: "update failed" } }),
          }),
        }),
      });
      const { updateAssessmentQuestionnaire } = await import("../strength-assessments.ts");
      await assert.rejects(
        () => updateAssessmentQuestionnaire("a1", mockQuestionnaire()),
        /update failed/,
      );
    });
  });

  describe("updateAssessmentPhysicalTests", () => {
    it("updates physical_tests + status completed filtered by id with select('id')", async () => {
      let capturedTable: unknown;
      let capturedUpdate: Record<string, unknown> | undefined;
      let capturedEq: [unknown, unknown] | undefined;
      let capturedSelect: unknown;
      const physicalTests = mockPhysicalTests();
      fromImpl = (table: unknown) => {
        capturedTable = table;
        return {
          update: (payload: unknown) => {
            capturedUpdate = payload as Record<string, unknown>;
            return {
              eq: (field: unknown, value: unknown) => {
                capturedEq = [field, value];
                return {
                  select: (cols: unknown) => {
                    capturedSelect = cols;
                    return Promise.resolve({ data: [{ id: "a1" }], error: null });
                  },
                };
              },
            };
          },
        };
      };
      const { updateAssessmentPhysicalTests } = await import("../strength-assessments.ts");
      await updateAssessmentPhysicalTests("a1", physicalTests);
      assert.equal(capturedTable, "strength_assessments");
      assert.deepEqual(capturedUpdate?.physical_tests, physicalTests);
      assert.equal(capturedUpdate?.status, "completed");
      assert.deepEqual(capturedEq, ["id", "a1"]);
      assert.equal(capturedSelect, "id");
    });

    it("throws when the update affects no rows (§113 silent no-op guard)", async () => {
      fromImpl = () => ({
        update: () => ({
          eq: () => ({
            select: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      });
      const { updateAssessmentPhysicalTests } = await import("../strength-assessments.ts");
      await assert.rejects(
        () => updateAssessmentPhysicalTests("missing", mockPhysicalTests()),
        /not found or not allowed/,
      );
    });

    it("throws on supabase error", async () => {
      fromImpl = () => ({
        update: () => ({
          eq: () => ({
            select: () => Promise.resolve({ data: null, error: { message: "update failed" } }),
          }),
        }),
      });
      const { updateAssessmentPhysicalTests } = await import("../strength-assessments.ts");
      await assert.rejects(
        () => updateAssessmentPhysicalTests("a1", mockPhysicalTests()),
        /update failed/,
      );
    });
  });
});
