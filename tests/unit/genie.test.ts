import { beforeEach, describe, expect, it, vi } from "vitest";

const dbx = vi.fn();
vi.mock("@/lib/databricks/sql", () => ({ dbx }));
vi.mock("@/lib/env", () => ({
  requireEnv: () => ({ DATABRICKS_GENIE_SPACE_ID: "space-123" }),
}));

const { askGenie } = await import("@/lib/databricks/genie");

describe("askGenie", () => {
  beforeEach(() => dbx.mockReset());

  it("starts a conversation, polls until completed, and reads the query result table", async () => {
    dbx
      .mockResolvedValueOnce({ conversation_id: "conv-1", message_id: "msg-1" }) // start-conversation
      .mockResolvedValueOnce({
        status: "COMPLETED",
        attachments: [
          { text: { content: "AI/ML has the most students per event." } },
          { attachment_id: "att-1", query: { query: "SELECT ..." } },
        ],
      }) // poll message
      .mockResolvedValueOnce({
        statement_response: {
          manifest: { schema: { columns: [{ name: "path_name" }, { name: "n" }] } },
          result: { data_array: [["AI/ML", "12"]] },
        },
      }); // query-result

    const answer = await askGenie("Which career paths have the most students per upcoming event?");

    expect(answer.conversationId).toBe("conv-1");
    expect(answer.text).toBe("AI/ML has the most students per event.");
    expect(answer.sql).toBe("SELECT ...");
    expect(answer.columns).toEqual(["path_name", "n"]);
    expect(answer.rows).toEqual([["AI/ML", "12"]]);
  });

  it("tolerates alternate field names for the started conversation (spec 11.10 watch-out)", async () => {
    dbx
      .mockResolvedValueOnce({ conversation: { id: "conv-2" }, message: { id: "msg-2" } })
      .mockResolvedValueOnce({ status: "COMPLETED", attachments: [] });

    const answer = await askGenie("A question");
    expect(answer.conversationId).toBe("conv-2");
    expect(answer.text).toBe("");
    expect(answer.sql).toBeNull();
    expect(answer.rows).toEqual([]);
  });

  it("stops polling once a terminal status is reached, even without a query attachment", async () => {
    dbx
      .mockResolvedValueOnce({ conversation_id: "conv-3", message_id: "msg-3" })
      .mockResolvedValueOnce({ status: "FAILED", attachments: [] });

    const answer = await askGenie("A question");
    // Only start + one poll: 2 calls total, proving it did not keep polling after FAILED.
    expect(dbx).toHaveBeenCalledTimes(2);
    expect(answer.text).toBe("");
  });

  it("continues an existing conversation by posting to its messages endpoint", async () => {
    dbx
      .mockResolvedValueOnce({ message_id: "msg-4" })
      .mockResolvedValueOnce({ status: "COMPLETED", attachments: [] });

    await askGenie("Follow up", "conv-1");
    expect(dbx).toHaveBeenNthCalledWith(
      1,
      "/api/2.0/genie/spaces/space-123/conversations/conv-1/messages",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
