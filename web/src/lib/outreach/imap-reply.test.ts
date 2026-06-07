import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  correlateProspectByReply,
  extractEmailAddress,
  normalizeMessageId,
  parseImapMessageSource,
  parseMessageIdList,
} from "./imap-reply";
import { isUnsubscribeReply } from "./reply-handler";

describe("imap-reply", () => {
  it("normalizes and parses Message-IDs", () => {
    assert.equal(normalizeMessageId("<abc@mail.test>"), "abc@mail.test");
    assert.deepEqual(parseMessageIdList("<a@x> <b@y>"), ["a@x", "b@y"]);
  });

  it("extracts sender email from From header", () => {
    assert.equal(extractEmailAddress("Jane <jane@acme.com>"), "jane@acme.com");
  });

  it("parses IMAP source headers and body", () => {
    const source = [
      "From: Bob <bob@client.com>",
      "In-Reply-To: <msg-123@intentflow>",
      "Subject: Re: Quick question",
      "",
      "Please STOP emailing me",
    ].join("\r\n");
    const parsed = parseImapMessageSource(source);
    assert.equal(parsed.fromEmail, "bob@client.com");
    assert.deepEqual(parsed.inReplyToIds, ["msg-123@intentflow"]);
    assert.equal(isUnsubscribeReply(parsed.bodyText), true);
  });

  it("correlates prospect by In-Reply-To before email fallback", () => {
    const pool = [
      {
        id: "1",
        campaign: "pesttrace",
        email: "other@x.com",
        raw: { last_send: { message_id: "<msg-123@intentflow>" } },
      },
      {
        id: "2",
        campaign: "pesttrace",
        email: "bob@client.com",
        raw: {},
      },
    ];
    const match = correlateProspectByReply(pool, "bob@client.com", ["msg-123@intentflow"], []);
    assert.equal(match?.id, "1");
  });
});
