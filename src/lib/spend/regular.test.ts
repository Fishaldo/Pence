import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addFreq,
  contractEndMessage,
  dueText,
  findRegulars,
  payeeKey,
  reminderMessage,
  remindersDue,
  reminderStep,
  rollForward,
  findRise,
  workingDaysUntil,
  type RegularSpend,
} from "./regular.ts";

const spend = (merchant: string, amountPence: number, spentOn: string, category: RegularSpend["category"], description?: string): RegularSpend => ({
  merchant,
  amountPence,
  spentOn,
  category,
  description,
});

describe("regular payments", () => {
  it("steps dates by a month, keeping to the same day where it exists", () => {
    assert.equal(addFreq("2026-01-31", "monthly"), "2026-02-28");
    assert.equal(addFreq("2026-02-28", "monthly", 31), "2026-03-31");
    assert.equal(addFreq("2026-11-15", "quarterly"), "2027-02-15");
    assert.equal(addFreq("2026-10-11", "weekly"), "2026-10-18");
    assert.equal(addFreq("2026-10-11", "yearly"), "2027-10-11");
    assert.equal(rollForward("2026-07-05", "monthly", "2026-10-11"), "2026-11-05");
    assert.equal(rollForward("2026-10-05", "once", "2026-10-11"), "2026-10-05");
  });

  it("lists every subscription, even one paid once", () => {
    const list = findRegulars(
      [
        spend("Netflix", 1099, "2026-08-14", "subscriptions"),
        spend("Netflix", 1099, "2026-09-14", "subscriptions"),
        spend("Spotify", 1199, "2026-10-02", "subscriptions"),
        spend("ASDA", 2050, "2026-10-01", "groceries"),
      ],
      [],
      "2026-10-11",
    );
    const netflix = list.find((item) => item.name === "Netflix");
    const spotify = list.find((item) => item.name === "Spotify");
    assert.ok(netflix && spotify);
    assert.equal(netflix.freq, "monthly");
    assert.equal(netflix.guessed, false);
    assert.equal(netflix.nextDue, "2026-10-14");
    assert.equal(netflix.daysLeft, 3);
    assert.equal(spotify.guessed, true);
    assert.equal(spotify.nextDue, "2026-11-02");
    assert.equal(list.some((item) => item.name === "ASDA"), false);
    assert.equal(list[0].name, "Netflix");
  });

  it("finds rent and steady bills, but not a weekly food shop", () => {
    const list = findRegulars(
      [
        spend("Rent", 85000, "2026-08-01", "bills"),
        spend("Rent", 85000, "2026-09-01", "bills"),
        spend("Tesco", 4200, "2026-09-20", "groceries"),
        spend("Tesco", 4100, "2026-09-27", "groceries"),
        spend("Tesco", 4300, "2026-10-04", "groceries"),
        spend("PureGym", 2499, "2026-07-20", "health"),
        spend("PureGym", 2499, "2026-08-20", "health"),
        spend("PureGym", 2499, "2026-09-20", "health"),
      ],
      [],
      "2026-10-11",
    );
    const names = list.map((item) => item.name);
    assert.ok(names.includes("Rent"));
    assert.ok(names.includes("PureGym"));
    assert.equal(names.includes("Tesco"), false);
    const rent = list.find((item) => item.name === "Rent");
    assert.equal(rent?.lapsed, false);
    assert.equal(rent?.nextDue, "2026-11-01");
  });

  it("treats the same statement description as one payee", () => {
    const list = findRegulars(
      [
        spend("MyPerfectCV", 2395, "2026-08-03", "subscriptions", "BLD*MYPERFECTCV.CO 4421"),
        spend("Bld Myperfectcv", 2395, "2026-09-03", "other", "BLD*MYPERFECTCV.CO 9902"),
      ],
      [],
      "2026-10-11",
    );
    assert.equal(list.length, 1);
    assert.equal(list[0].times, 2);
    assert.equal(list[0].key, payeeKey({ merchant: "x", description: "BLD*MYPERFECTCV.CO" }));
  });

  it("marks a payment not seen for a long time as maybe cancelled", () => {
    const list = findRegulars(
      [spend("Disney+", 499, "2026-05-10", "subscriptions"), spend("Disney+", 499, "2026-06-10", "subscriptions")],
      [],
      "2026-10-11",
    );
    assert.equal(list[0].lapsed, true);
  });

  it("uses what the person changed, and adds free trials they typed in", () => {
    const spends = [spend("Spotify", 1199, "2026-10-02", "subscriptions")];
    const key = payeeKey(spends[0]);
    const list = findRegulars(
      spends,
      [
        { key, name: "Spotify Family", amountPence: 1999, freq: "monthly", nextDue: "2026-10-20", stopped: false, remind: true },
        { key: "m:trial", name: "Audible trial", amountPence: 899, freq: "once", nextDue: "2026-10-18", stopped: false, remind: true },
        { key: "m:old", name: "Old trial", amountPence: 0, freq: "once", nextDue: "2026-09-01", stopped: false, remind: true },
      ],
      "2026-10-11",
    );
    const spotify = list.find((item) => item.key === key);
    assert.equal(spotify?.name, "Spotify Family");
    assert.equal(spotify?.amountPence, 1999);
    assert.equal(spotify?.nextDue, "2026-10-20");
    assert.equal(spotify?.guessed, false);
    const trial = list.find((item) => item.key === "m:trial");
    assert.equal(trial?.daysLeft, 7);
    assert.equal(trial?.manual, true);
    assert.equal(list.some((item) => item.key === "m:old"), false);
    assert.equal(list[0].key, "m:trial");
  });

  it("shows a cancelled payment again when it is paid after that", () => {
    const spends = [spend("Netflix", 1099, "2026-09-01", "subscriptions"), spend("Netflix", 1099, "2026-10-01", "subscriptions")];
    const list = findRegulars(
      spends,
      [{ key: payeeKey(spends[0]), name: "", amountPence: null, freq: null, nextDue: null, stopped: true, stoppedOn: "2026-09-10", remind: true }],
      "2026-10-11",
    );
    assert.equal(list[0].paidAfterStop, true);
    assert.equal(list[0].stopped, false);
  });

  it("puts stopped payments last", () => {
    const spends = [spend("Netflix", 1099, "2026-10-01", "subscriptions"), spend("Spotify", 1199, "2026-10-09", "subscriptions")];
    const list = findRegulars(
      spends,
      [{ key: payeeKey(spends[0]), name: "", amountPence: null, freq: null, nextDue: null, stopped: true, remind: true }],
      "2026-10-11",
    );
    assert.equal(list[list.length - 1].name, "Netflix");
    assert.equal(list[list.length - 1].stopped, true);
  });

  it("reminds a week, three days and two working days before", () => {
    assert.deepEqual(
      [8, 7, 6, 4, 3, 2, 1, 0, -1].map((days) => reminderStep(days)),
      [null, 7, 7, 7, 3, 2, 2, 2, null],
    );
    // Thursday 15 October, due Monday 19 October: Friday and Monday are the two working days.
    assert.equal(workingDaysUntil("2026-10-15", "2026-10-19"), 2);
    assert.equal(reminderStep(4, 2), 2);
    // Christmas: 25 and 28 December 2026 are bank holidays, so 23 December is two working days before the 29th.
    assert.equal(workingDaysUntil("2026-12-23", "2026-12-29"), 2);
    assert.equal(workingDaysUntil("2026-12-22", "2026-12-29"), 3);
    assert.equal(dueText({ nextDue: "2026-10-12", daysLeft: 1 }), "Due tomorrow");
    assert.equal(dueText({ nextDue: "2026-10-11", daysLeft: 0 }), "Due today");
    assert.match(dueText({ nextDue: "2026-10-18", daysLeft: 7 }), /in 7 days$/);
  });

  it("sends each reminder step once, and skips one already passed", () => {
    const spends = [spend("Netflix", 1099, "2026-09-14", "subscriptions"), spend("Netflix", 1099, "2026-08-14", "subscriptions")];
    const key = payeeKey(spends[0]);
    // Netflix is due Wed 14 Oct, three days from today.
    const list = findRegulars(spends, [], "2026-10-11");
    assert.deepEqual(
      remindersDue(list, []).map((row) => row.step),
      [3],
    );
    assert.equal(remindersDue(list, [{ key, due: "2026-10-14", daysBefore: 3 }]).length, 0);
    assert.equal(remindersDue(list, [{ key, due: "2026-10-14", daysBefore: 1 }]).length, 0);
    // The week-before step does not stop the three-day one.
    assert.equal(remindersDue(list, [{ key, due: "2026-10-14", daysBefore: 7 }]).length, 1);
    // Last month's reminder is for another due date.
    assert.equal(remindersDue(list, [{ key, due: "2026-09-14", daysBefore: 3 }]).length, 1);
    const off = findRegulars(spends, [{ key, name: "", amountPence: null, freq: null, nextDue: null, stopped: false, remind: false }], "2026-10-11");
    assert.equal(remindersDue(off, []).length, 0);
  });

  it("notices a bill or subscription going up", () => {
    const spends = [
      spend("Vodafone", 2000, "2026-07-03", "bills"),
      spend("Vodafone", 2000, "2026-08-03", "bills"),
      spend("Vodafone", 2000, "2026-09-03", "bills"),
      spend("Vodafone", 2290, "2026-10-03", "bills"),
    ];
    const vodafone = findRegulars(spends, [], "2026-10-11").find((item) => item.name === "Vodafone");
    assert.ok(vodafone);
    assert.deepEqual(vodafone.rise, { fromPence: 2000, toPence: 2290, on: "2026-10-03" });
    assert.equal(vodafone.lastPence, 2290);
  });

  it("does not call a bill that moves with use a price rise", () => {
    assert.equal(
      findRise([
        { amountPence: 4100, spentOn: "2026-08-01" },
        { amountPence: 5600, spentOn: "2026-09-01" },
        { amountPence: 6300, spentOn: "2026-10-01" },
      ]),
      null,
    );
    assert.equal(findRise([{ amountPence: 999, spentOn: "2026-09-01" }, { amountPence: 1019, spentOn: "2026-10-01" }]), null);
  });

  it("keeps a contract end the person gave", () => {
    const spends = [spend("Sky", 3500, "2026-09-05", "bills"), spend("Sky", 3500, "2026-08-05", "bills")];
    const key = payeeKey(spends[0]);
    const list = findRegulars(
      spends,
      [{ key, name: "", amountPence: null, freq: null, nextDue: null, stopped: false, remind: true, contractEnd: "2026-11-30" }],
      "2026-10-11",
    );
    assert.equal(list[0].contractEnd, "2026-11-30");
  });

  it("words the phone message plainly", () => {
    const spends = [spend("Netflix", 1099, "2026-09-14", "subscriptions"), spend("Netflix", 1099, "2026-08-14", "subscriptions")];
    const list = findRegulars(
      spends,
      [{ key: "m:t", name: "Audible trial", amountPence: 0, freq: "once", nextDue: "2026-10-12", stopped: false, remind: true }],
      "2026-10-11",
    );
    const netflix = list.find((item) => item.name === "Netflix");
    const trial = list.find((item) => item.key === "m:t");
    assert.ok(netflix && trial);
    const one = reminderMessage([netflix]);
    assert.equal(one.title, "Netflix comes out in 3 days");
    assert.match(one.body, /^£10\.99 on .+14 Oct\. Still need it\?/);
    assert.equal(one.url, "/regular");
    assert.equal(reminderMessage([trial]).title, "Audible trial ends tomorrow");
    assert.match(reminderMessage([trial]).body, /^Cancel before .+ if you don’t want to pay\.$/);
    assert.equal(reminderMessage([trial, netflix]).title, "2 payments coming out soon");
  });
});

describe("contract ends", () => {
  it("tells the person once, with time to switch", () => {
    const message = contractEndMessage("Vodafone", "2026-11-30");
    assert.equal(message.title, "Vodafone: contract ends Mon 30 Nov");
    assert.equal(message.url, "/bills");
    assert.match(message.body, /better one/);
  });
});
