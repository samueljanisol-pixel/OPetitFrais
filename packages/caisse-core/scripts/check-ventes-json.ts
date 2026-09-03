import assert from "node:assert/strict";
import {
  emptyDayFile,
  emptyMonthFile,
  mergeSaleIntoDayFile,
  mergeSaleIntoMonthFile,
  ventesProductKey,
} from "../src/ventes-json.ts";

const sale1 = {
  soldAt: "2026-09-03T08:15:00",
  ticketNumber: 1,
  ticketRef: "M01C01T1",
  total: 10,
  clientId: null,
  clientName: null,
  isDelivery: false,
  lines: [
    {
      productId: "p1",
      productCode: "91",
      productName: "Tomate",
      qty: 2.5,
      unitPrice: 4,
      lineTotal: 10,
      salesUnit: "kg" as const,
    },
  ],
  payments: [{ mode: "cash", label: "Espèces", amount: 10 }],
};

const day1 = mergeSaleIntoDayFile(emptyDayFile(), sale1);
assert.equal(day1.total_jour, 10);
assert.equal(day1.nb_paniers, 1);
assert.equal(day1.panier_heure[8], 1);
assert.equal(day1.ventes["91"]?.qte, 2.5);
assert.equal(day1.ventes["91"]?.total, 10);
assert.equal(day1.tickets.length, 1);

const sale2 = {
  ...sale1,
  ticketNumber: 2,
  ticketRef: "M01C01T2",
  total: 5,
  lines: [
    {
      productId: "p1",
      productCode: "91",
      productName: "Tomate",
      qty: 1,
      unitPrice: 5,
      lineTotal: 5,
      salesUnit: "kg" as const,
    },
  ],
};

const day2 = mergeSaleIntoDayFile(day1, sale2);
assert.equal(day2.total_jour, 15);
assert.equal(day2.nb_paniers, 2);
assert.equal(day2.ventes["91"]?.qte, 3.5);
assert.equal(day2.tickets.length, 2);

const dup = mergeSaleIntoDayFile(day2, sale2);
assert.equal(dup, day2);

const boutique = {
  ...sale1,
  ticketNumber: 3,
  ticketRef: "M01C01T3",
  total: 20,
  lines: [
    {
      productId: "cart-9",
      productCode: "",
      productName: "Commande #9",
      qty: 1,
      unitPrice: 20,
      lineTotal: 20,
      salesUnit: "unit" as const,
    },
  ],
};
assert.equal(ventesProductKey(boutique.lines[0]!), "commande-cart-9");
const day3 = mergeSaleIntoDayFile(day2, boutique);
assert.equal(day3.ventes["commande-cart-9"]?.total, 20);

const month = mergeSaleIntoMonthFile(emptyMonthFile(), sale1);
const month2 = mergeSaleIntoMonthFile(month, sale2);
assert.equal(month2.total_mois, 15);
assert.equal(month2.nb_paniers, 2);

console.log("ventes-json ok");
