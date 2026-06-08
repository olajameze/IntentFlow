import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySnapshotUrlToHtml } from "./snapshot-send";

describe("applySnapshotUrlToHtml", () => {
  it("leaves html unchanged when no placeholder", () => {
    const html = '<a href="https://pesttrace.com">trial</a>';
    assert.equal(applySnapshotUrlToHtml(html, {}, "https://app.example.com").html, html);
  });

  it("replaces placeholder with absolute snapshot url", () => {
    const raw = { snapshot: { token: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" } };
    const result = applySnapshotUrlToHtml(
      '<a href="__SNAPSHOT_URL__">view</a>',
      raw,
      "https://app.example.com",
    );
    assert.equal(result.error, undefined);
    assert.ok(
      result.html.includes("https://app.example.com/r/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
    );
  });

  it("returns error when base url missing", () => {
    const result = applySnapshotUrlToHtml('<a href="__SNAPSHOT_URL__">x</a>', {}, "");
    assert.match(result.error ?? "", /OUTREACH_PUBLIC_BASE_URL/);
  });

  it("returns error when token missing", () => {
    const result = applySnapshotUrlToHtml(
      '<a href="__SNAPSHOT_URL__">x</a>',
      {},
      "https://app.example.com",
    );
    assert.match(result.error ?? "", /no snapshot token/);
  });
});
