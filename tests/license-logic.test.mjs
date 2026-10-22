import test from "node:test";
import assert from "node:assert/strict";
import { planOf, keyState, receiptOf } from "../supabase/functions/license/logic.ts";

// Run from the repo root:  node --test tests/license-logic.test.mjs
// Build 8.3.23: the pure rules behind the licence function, with made-up order data (no real purchase is read).

test("only keys from our store and our two products count, and the product gives the plan", () => {
  assert.equal(planOf({ store_id: 7, product_id: 9 }, "7", "9", "10"), "monthly");
  assert.equal(planOf({ store_id: 7, product_id: 10 }, "7", "9", "10"), "yearly");
  assert.equal(planOf({ store_id: 7, product_id: 11 }, "7", "9", "10"), null);
  assert.equal(planOf({ store_id: 8, product_id: 10 }, "7", "9", "10"), null);
  assert.equal(planOf(undefined, "7", "9", "10"), null);
});

test("key status maps to valid, expired or invalid", () => {
  assert.equal(keyState({ status: "active" }, false), "valid");
  assert.equal(keyState({ status: "inactive" }, false), "valid");
  assert.equal(keyState({ status: "expired" }, false), "expired");
  assert.equal(keyState({ status: "disabled" }, false), "expired");
  assert.equal(keyState({ status: "weird" }, false), "invalid");
  assert.equal(keyState(undefined, false), "invalid");
});

test("test-mode keys are refused unless testing is switched on", () => {
  assert.equal(keyState({ status: "active", test_mode: true }, false), "invalid");
  assert.equal(keyState({ status: "active", test_mode: true }, true), "valid");
});

test("the receipt carries only what the order has, in whole currency units", () => {
  const r = receiptOf({ attributes: { order_number: 1042, created_at: "2026-10-22T10:00:00Z", currency: "USD", subtotal: 1000, tax: 200, tax_name: "VAT", total: 1200, first_order_item: { product_name: "Whole Life Premium", variant_name: "Monthly" } } });
  assert.deepEqual(r, { orderNo: "1042", date: "22 OCT 2026", currency: "USD", items: [{ label: "Whole Life Premium · Monthly", amount: 10 }], taxes: [{ label: "VAT", amount: 2 }], total: 12 });
});

test("a zero-tax order has an empty tax list, and a missing tax field has none at all", () => {
  assert.deepEqual(receiptOf({ attributes: { tax: 0, total: 500, subtotal: 500, currency: "EUR" } }).taxes, []);
  assert.equal("taxes" in receiptOf({ attributes: { total: 500, currency: "EUR" } }), false);
});

test("no order, no receipt; nothing is invented", () => {
  assert.equal(receiptOf(undefined), undefined);
  assert.deepEqual(receiptOf({ attributes: {} }), {});
});
