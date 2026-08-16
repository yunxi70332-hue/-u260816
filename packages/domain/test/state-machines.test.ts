import assert from "node:assert/strict";
import test from "node:test";
import {
  InvalidTransitionError,
  allowedOrderTransitions,
  allowedQuoteTransitions,
  transitionOrder,
  transitionQuote
} from "../src/index.js";

test("quote workflow reaches conversion only after customer confirmation", () => {
  const path = ["priced", "submitted", "approved", "customer_confirmed", "converted"] as const;
  for (let index = 0; index < path.length - 1; index += 1) {
    assert.equal(transitionQuote(path[index], path[index + 1]), path[index + 1]);
  }
  assert.deepEqual(allowedQuoteTransitions("converted"), []);
});

test("quote approval cannot skip submission", () => {
  assert.throws(() => transitionQuote("priced", "approved"), InvalidTransitionError);
});

test("order workflow follows confirmation, production and shipping", () => {
  const path = [
    "draft",
    "confirmed",
    "ready_for_production",
    "in_production",
    "ready_to_ship",
    "shipped"
  ] as const;
  for (let index = 0; index < path.length - 1; index += 1) {
    assert.equal(transitionOrder(path[index], path[index + 1]), path[index + 1]);
  }
  assert.deepEqual(allowedOrderTransitions("shipped"), []);
  assert.throws(() => transitionOrder("confirmed", "technical_review"), InvalidTransitionError);
  assert.throws(() => transitionOrder("shipped", "delivered"), InvalidTransitionError);
});

test("on-hold orders resume at confirmation", () => {
  assert.equal(transitionOrder("confirmed", "on_hold"), "on_hold");
  assert.equal(transitionOrder("on_hold", "confirmed"), "confirmed");
  assert.throws(() => transitionOrder("on_hold", "shipped"), InvalidTransitionError);
});
