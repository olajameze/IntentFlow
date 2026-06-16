import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { insertOutreachMessage } from "./messages";

function mockSb(existingId: string | null) {
  const inserts: Record<string, unknown>[] = [];
  return {
    inserts,
    client: {
      from(table: string) {
        if (table !== "outreach_messages") throw new Error("unexpected table");
        return {
          select() {
            return {
              eq(_col: string, _val: string) {
                return {
                  async maybeSingle() {
                    return { data: existingId ? { id: existingId } : null };
                  },
                };
              },
            };
          },
          insert(row: Record<string, unknown>) {
            inserts.push(row);
            return {
              select() {
                return {
                  async single() {
                    return { data: { id: "new-msg-id" } };
                  },
                };
              },
            };
          },
        };
      },
    } as never,
  };
}

describe("outreach messages", () => {
  it("dedupes by message_id", async () => {
    const { client } = mockSb("existing-uuid");
    const r = await insertOutreachMessage(client, {
      prospectId: "p1",
      direction: "inbound",
      messageId: "msg-123",
      bodyText: "hello",
    });
    assert.equal(r.duplicate, true);
    assert.equal(r.id, "existing-uuid");
  });

  it("inserts when message_id is new", async () => {
    const m = mockSb(null);
    const r = await insertOutreachMessage(m.client, {
      prospectId: "p1",
      direction: "outbound",
      messageId: "msg-new",
      bodyText: "hi",
    });
    assert.equal(r.duplicate, false);
    assert.equal(r.id, "new-msg-id");
    assert.equal(m.inserts.length, 1);
  });
});
