import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acceptPayload,
  handleWayforpayNotification,
  hmacMd5,
  onePracticeAmount,
  openDayAmount,
  openDayLines,
  openDayPurchase,
  parseWayforpayBody,
  openDayReturnState,
  pickSignup,
  purchaseSignatureString,
  serviceSignatureString,
  signupIdFromOrder,
  verifyServiceSignature,
} from "./wayforpay.js";

const secret = "test-secret";
const merchant = "test_merch_n1";

function signed(extra) {
  const body = {
    merchantAccount: merchant,
    orderReference: "OD-1",
    amount: 1800,
    currency: "UAH",
    authCode: "541963",
    cardPan: "41****8217",
    transactionStatus: "Approved",
    reasonCode: "1100",
    phone: "+380501234567",
    ...extra,
  };
  body.merchantSignature = hmacMd5(serviceSignatureString(body), secret);
  return body;
}

describe("WayForPay service signature", () => {
  it("accepts a callback signed the way WayForPay describes", async () => {
    const body = signed();
    assert.equal(verifyServiceSignature(body, secret), true);
    const saved = [];
    const result = await handleWayforpayNotification(body, {
      secret,
      merchantAccount: merchant,
      now: () => 1415379863,
      save: async (payload) => saved.push(payload.orderReference),
    });
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.payload, acceptPayload("OD-1", secret, 1415379863));
    assert.deepEqual(saved, ["OD-1"]);
    assert.equal(verifyServiceSignature(result.payload, secret), false);
    assert.equal(result.payload.signature, hmacMd5("OD-1;accept;1415379863", secret));
  });

  it("keeps empty auth and reason fields inside the signed string", () => {
    const body = signed({ authCode: "", cardPan: "", reasonCode: "" });
    assert.equal(
      serviceSignatureString(body),
      "test_merch_n1;OD-1;1800;UAH;;;Approved;",
    );
    assert.equal(verifyServiceSignature(body, secret), true);
  });

  it("does not accept a bad signature or the wrong shop", async () => {
    const body = signed();
    body.amount = 1;
    assert.equal((await handleWayforpayNotification(body, { secret, merchantAccount: merchant })).statusCode, 400);
    const otherShop = signed({ merchantAccount: "other" });
    otherShop.merchantSignature = hmacMd5(serviceSignatureString(otherShop), secret);
    assert.equal((await handleWayforpayNotification(otherShop, { secret, merchantAccount: merchant })).statusCode, 400);
    assert.equal((await handleWayforpayNotification(signed(), { secret: "", merchantAccount: merchant })).statusCode, 503);
  });
});

describe("pickSignup", () => {
  const rows = [
    { id: "old", phone: "0501234567", pass: "full", paid_at: null, created_at: "2026-09-01" },
    { id: "new", phone: "+380 50 123 45 67", pass: "one", paid_at: null, created_at: "2026-09-20" },
  ];

  it("matches the unpaid signup with the same phone and pass amount", () => {
    assert.equal(pickSignup(rows, "380501234567", 400).id, "new");
    assert.equal(pickSignup(rows, "380501234567", 1800).id, "old");
  });
});

describe("several practices", () => {
  it("charges 400 for each selected practice", () => {
    assert.equal(onePracticeAmount(1), 400);
    assert.equal(onePracticeAmount(2), 800);
    assert.equal(onePracticeAmount(0), 0);
    assert.equal(onePracticeAmount(2.5), 0);
  });

  it("names every paid practice on the invoice", () => {
    const lines = openDayLines("one", ["game", "health"]);
    assert.deepEqual(lines, [
      { name: "Open Day, 04.10 12:00–13:00, Рух як гра", price: 400, count: 1 },
      { name: "Open Day, 04.10 15:00–16:00, Dance and health", price: 400, count: 1 },
    ]);
    assert.equal(openDayAmount("full", []), 1800);
    assert.equal(openDayAmount("grunt", []), 600);
    assert.equal(openDayAmount("sprouts", []), 1400);
    const fields = {
      merchantAccount: merchant,
      merchantDomainName: "mozok-tilo-ruh.kyiv.ua",
      orderReference: "od-1",
      orderDate: 10,
      amount: 800,
      productName: lines.map((line) => line.name),
      productCount: [1, 1],
      productPrice: [400, 400],
    };
    const params = openDayPurchase({ ...fields, secret, pass: "one", practices: ["game", "health"] });
    assert.equal(params.get("amount"), "800");
    assert.deepEqual(params.getAll("productName[]"), fields.productName);
    assert.equal(params.get("merchantSignature"), hmacMd5(purchaseSignatureString(fields), secret));
    assert.equal(params.get("returnUrl"), null);
  });

  it("reads a signup id only from its own order reference", () => {
    const id = "11111111-2222-4333-8444-555555555555";
    assert.equal(signupIdFromOrder("od-" + id), id);
    assert.equal(signupIdFromOrder("wfp-order"), "");
  });
});

describe("return page", () => {
  it("follows transactionStatus and ignores the order number", () => {
    assert.equal(openDayReturnState({ transactionStatus: "Approved" }), "paid");
    assert.equal(openDayReturnState("transactionStatus=Approved&orderReference=od-1"), "paid");
    assert.equal(openDayReturnState(signed()), "paid");
    assert.equal(openDayReturnState({ transactionStatus: "Declined", orderReference: "od-1" }), "failed");
    assert.equal(openDayReturnState({ orderReference: "od-1" }), "failed");
    assert.equal(openDayReturnState(signed({ transactionStatus: "Expired" })), "failed");
  });
});

describe("parseWayforpayBody", () => {
  it("reads JSON and form bodies", () => {
    const json = Buffer.from(JSON.stringify(signed()), "utf8");
    assert.equal(parseWayforpayBody(json).orderReference, "OD-1");
    const form = "merchantAccount=test_merch_n1&orderReference=OD-2&amount=400";
    assert.equal(parseWayforpayBody(form).orderReference, "OD-2");
    assert.deepEqual(parseWayforpayBody(""), {});
  });
});
