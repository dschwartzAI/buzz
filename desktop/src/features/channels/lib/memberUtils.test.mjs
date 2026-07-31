import assert from "node:assert/strict";
import test from "node:test";

import { formatMemberName } from "./memberUtils.ts";

const member = {
  pubkey: "abcdef0123456789",
  role: "member",
  isAgent: false,
  joinedAt: null,
  displayName: null,
};

test("formatMemberName_usesFetchedProfileNameBeforePubkey", () => {
  assert.equal(
    formatMemberName(member, undefined, "Dwight (CO)"),
    "Dwight (CO)",
  );
});

test("formatMemberName_prefersChannelMemberName", () => {
  assert.equal(
    formatMemberName(
      { ...member, displayName: "Channel name" },
      undefined,
      "Profile name",
    ),
    "Channel name",
  );
});

test("formatMemberName_keepsCurrentIdentityLabel", () => {
  assert.equal(formatMemberName(member, member.pubkey, "Daniel"), "You");
});

test("formatMemberName_fallsBackToTruncatedPubkey", () => {
  assert.equal(formatMemberName(member), "abcdef01…6789");
});
