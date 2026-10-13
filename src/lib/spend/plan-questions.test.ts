import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { answerBrief, answerWords, PLAN_QUESTIONS, questionsFor } from "./plan-questions.ts";

describe("Plan questions", () => {
  it("never asks more than three, each with something to tap", () => {
    for (const [kind, list] of Object.entries(PLAN_QUESTIONS)) {
      assert.ok(questionsFor(kind).length <= 3, kind);
      for (const question of list) assert.ok(question.choices.length >= 2, `${kind} ${question.id}`);
    }
  });

  it("asks who, which meal and food for eating out", () => {
    assert.deepEqual(
      questionsFor("dining").map((q) => q.id),
      ["who", "meal", "food"],
    );
  });

  it("turns answers into search words and a brief", () => {
    const answers = { who: "Family", meal: "Dinner", food: "Indian" };
    assert.equal(answerWords("dining", answers), "family dinner indian");
    assert.equal(answerBrief("dining", answers), "Who's going: Family. Which meal: Dinner. Food: Indian.");
  });

  it("asks nothing for something else, and ignores answers it does not know", () => {
    assert.deepEqual(questionsFor("other"), []);
    assert.equal(answerWords("dining", { who: "Aliens" }), "");
  });
});
