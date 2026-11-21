"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

require(path.join(__dirname, "../js/engine.js"));
require(path.join(__dirname, "../js/strategies.js"));

const IPD = globalThis.IPD;
const S = IPD.STRATEGIES;

function match(a, b, opts) {
  return IPD.playMatch(a, b, opts || {});
}

describe("payoffs", function () {
  it("uses the standard R=3 T=5 P=1 S=0 matrix", function () {
    assert.deepEqual(IPD.payoff("C", "C"), [3, 3]);
    assert.deepEqual(IPD.payoff("C", "D"), [0, 5]);
    assert.deepEqual(IPD.payoff("D", "C"), [5, 0]);
    assert.deepEqual(IPD.payoff("D", "D"), [1, 1]);
  });

  it("rejects invalid moves", function () {
    assert.throws(function () {
      IPD.payoff("X", "C");
    });
  });

  it("respects a custom matrix", function () {
    const p = { R: 4, T: 6, P: 2, S: 0 };
    assert.deepEqual(IPD.payoff("C", "C", p), [4, 4]);
    assert.deepEqual(IPD.payoff("D", "C", p), [6, 0]);
  });
});

describe("seeded rng", function () {
  it("is deterministic for a given seed", function () {
    const a = IPD.makeRng(42);
    const b = IPD.makeRng(42);
    const seqA = Array.from({ length: 20 }, function () {
      return a();
    });
    const seqB = Array.from({ length: 20 }, function () {
      return b();
    });
    assert.deepEqual(seqA, seqB);
  });

  it("differs across seeds", function () {
    const a = IPD.makeRng(1);
    const b = IPD.makeRng(2);
    const seqA = Array.from({ length: 8 }, function () {
      return a();
    });
    const seqB = Array.from({ length: 8 }, function () {
      return b();
    });
    assert.notDeepEqual(seqA, seqB);
  });

  it("seedPair is symmetric-order sensitive and stable", function () {
    const ab = IPD.seedPair(7, "tft", "joss");
    const ab2 = IPD.seedPair(7, "tft", "joss");
    const ba = IPD.seedPair(7, "joss", "tft");
    const other = IPD.seedPair(8, "tft", "joss");
    assert.equal(ab, ab2);
    assert.notEqual(ab, ba);
    assert.notEqual(ab, other);
  });
});

describe("known strategy outcomes", function () {
  it("TFT vs TFT cooperates every round and each scores 3n", function () {
    const m = match(S.tft, S.tft, { rounds: 200, seed: 1, noise: 0 });
    assert.equal(m.rounds, 200);
    assert.ok(m.movesA.every(function (x) { return x === "C"; }));
    assert.ok(m.movesB.every(function (x) { return x === "C"; }));
    assert.equal(m.totalA, 600);
    assert.equal(m.totalB, 600);
    assert.equal(m.echo, null);
  });

  it("Always Defect vs Always Cooperate: 5n and 0", function () {
    const m = match(S.alld, S.allc, { rounds: 200, seed: 1, noise: 0 });
    assert.ok(m.movesA.every(function (x) { return x === "D"; }));
    assert.ok(m.movesB.every(function (x) { return x === "C"; }));
    assert.equal(m.totalA, 1000);
    assert.equal(m.totalB, 0);
  });

  it("Always Defect vs itself: each scores 1n", function () {
    const m = match(S.alld, S.alld, { rounds: 200, seed: 1, noise: 0 });
    assert.equal(m.totalA, 200);
    assert.equal(m.totalB, 200);
  });

  it("Grim vs TFT cooperates throughout", function () {
    const m = match(S.grim, S.tft, { rounds: 80, seed: 3, noise: 0 });
    assert.ok(m.movesA.every(function (x) { return x === "C"; }));
    assert.ok(m.movesB.every(function (x) { return x === "C"; }));
    assert.equal(m.totalA, 240);
    assert.equal(m.totalB, 240);
  });

  it("Grim vs Always Defect: one sucker's payoff, then mutual punishment", function () {
    const n = 50;
    const m = match(S.grim, S.alld, { rounds: n, seed: 1, noise: 0 });
    assert.equal(m.movesA[0], "C");
    assert.ok(m.movesA.slice(1).every(function (x) { return x === "D"; }));
    assert.ok(m.movesB.every(function (x) { return x === "D"; }));
    assert.equal(m.totalA, 0 + 1 * (n - 1));
    assert.equal(m.totalB, 5 + 1 * (n - 1));
  });

  it("Tit for Two Tats forgives a single isolated defection", function () {
    const probe = IPD.scripted(["C", "D", "C", "C", "C", "C"], "probe-once");
    const m = match(S.tftt, probe, { rounds: 6, seed: 1, noise: 0 });
    assert.deepEqual(m.movesA, ["C", "C", "C", "C", "C", "C"]);
    assert.deepEqual(m.movesB, ["C", "D", "C", "C", "C", "C"]);
  });

  it("Tit for Two Tats defects only after two straight opponent defections", function () {
    const bully = IPD.scripted(["D", "D", "D", "C"], "two-d");
    const m = match(S.tftt, bully, { rounds: 4, seed: 1, noise: 0 });
    assert.deepEqual(m.movesA, ["C", "C", "D", "D"]);
  });

  it("Pavlov vs TFT cooperates throughout", function () {
    const m = match(S.pavlov, S.tft, { rounds: 40, seed: 1, noise: 0 });
    assert.ok(m.movesA.every(function (x) { return x === "C"; }));
    assert.ok(m.movesB.every(function (x) { return x === "C"; }));
  });

  it("Pavlov switches after a sucker's payoff", function () {
    const exploit = IPD.scripted(["D", "D", "D"], "d");
    const m = match(S.pavlov, exploit, { rounds: 3, seed: 1, noise: 0 });
    // R1: Pavlov C, opp D → S=0, then switch to D
    assert.equal(m.movesA[0], "C");
    assert.equal(m.movesA[1], "D");
  });

  it("Joss vs TFT eventually defects (sneaks) under a fixed seed", function () {
    const m = match(S.joss, S.tft, { rounds: 200, seed: 7, noise: 0 });
    const sneaks = m.movesA.filter(function (x) { return x === "D"; }).length;
    assert.ok(sneaks > 0, "Joss should sneak at least once in 200 rounds");
    // First move is still cooperate
    assert.equal(m.movesA[0], "C");
    assert.equal(m.movesB[0], "C");
  });

  it("Tester vs Always Cooperate exploits on even rounds after the probe", function () {
    const m = match(S.tester, S.allc, { rounds: 8, seed: 1, noise: 0 });
    assert.equal(m.movesA[0], "D");
    assert.equal(m.movesA[1], "C");
    // AllC does not retaliate on round 2 (plays C), so Tester exploits: D,C,D,C...
    assert.deepEqual(m.movesA, ["D", "C", "D", "C", "D", "C", "D", "C"]);
    assert.ok(m.totalA > m.totalB);
  });

  it("Tester vs TFT returns to mutual cooperation after the probe and apology", function () {
    const m = match(S.tester, S.tft, { rounds: 20, seed: 1, noise: 0 });
    assert.equal(m.movesA[0], "D");
    assert.equal(m.movesA[1], "C");
    // After apology on round 3 (index 2), they should settle on C
    const tailA = m.movesA.slice(4);
    const tailB = m.movesB.slice(4);
    assert.ok(tailA.every(function (x) { return x === "C"; }), "Tester tail " + tailA.join(""));
    assert.ok(tailB.every(function (x) { return x === "C"; }), "TFT tail " + tailB.join(""));
  });
});

describe("generosity", function () {
  it("GTFT with generosity 0 is identical to TFT", function () {
    const field = IPD.scripted(["C", "D", "C", "D", "D", "C"], "seq");
    const tft = match(S.tft, field, { rounds: 6, seed: 99, noise: 0 });
    const gtft = match(S.gtft, field, { rounds: 6, seed: 99, noise: 0, generosity: 0 });
    assert.deepEqual(gtft.movesA, tft.movesA);
  });

  it("GTFT with generosity 1 never retaliates", function () {
    const m = match(S.gtft, S.alld, { rounds: 30, seed: 1, noise: 0, generosity: 1 });
    assert.ok(m.movesA.every(function (x) { return x === "C"; }));
    assert.equal(m.totalA, 0);
    assert.equal(m.totalB, 150);
  });

  it("higher generosity produces more cooperations against a noisy echo partner", function () {
    // Play GTFT vs itself under noise: higher generosity should yield higher mutual C counts
    const low = match(S.gtft, S.gtft, { rounds: 200, seed: 11, noise: 0.05, generosity: 0 });
    const high = match(S.gtft, S.gtft, { rounds: 200, seed: 11, noise: 0.05, generosity: 0.2 });
    const coopLow = low.movesA.filter(function (x, i) { return x === "C" && low.movesB[i] === "C"; }).length;
    const coopHigh = high.movesA.filter(function (x, i) { return x === "C" && high.movesB[i] === "C"; }).length;
    assert.ok(coopHigh > coopLow, "expected more mutual C with generosity 0.2 than 0 (" + coopHigh + " vs " + coopLow + ")");
  });
});

describe("noise", function () {
  it("is deterministic for a given seed", function () {
    const a = match(S.tft, S.tft, { rounds: 80, seed: 123, noise: 0.1 });
    const b = match(S.tft, S.tft, { rounds: 80, seed: 123, noise: 0.1 });
    assert.deepEqual(a.movesA, b.movesA);
    assert.deepEqual(a.movesB, b.movesB);
    assert.equal(a.totalA, b.totalA);
  });

  it("different seeds produce different noisy tapes", function () {
    const a = match(S.tft, S.tft, { rounds: 80, seed: 1, noise: 0.1 });
    const b = match(S.tft, S.tft, { rounds: 80, seed: 2, noise: 0.1 });
    assert.notDeepEqual(a.movesA.join("") + a.movesB.join(""), b.movesA.join("") + b.movesB.join(""));
  });

  it("noise=1 flips every intended move", function () {
    const m = match(S.allc, S.allc, { rounds: 12, seed: 5, noise: 1 });
    // Both intend C, so both always show D
    assert.ok(m.intendedA.every(function (x) { return x === "C"; }));
    assert.ok(m.movesA.every(function (x) { return x === "D"; }));
    assert.ok(m.flipsA.every(function (x) { return x === true; }));
  });

  it("noise=0 never flips", function () {
    const m = match(S.random, S.random, { rounds: 40, seed: 9, noise: 0 });
    assert.deepEqual(m.intendedA, m.movesA);
    assert.deepEqual(m.intendedB, m.movesB);
    assert.ok(m.flipsA.every(function (x) { return x === false; }));
  });

  it("TFT vs TFT under noise can enter an alternating echo", function () {
    const m = match(S.tft, S.tft, { rounds: 200, seed: 4, noise: 0.05 });
    // Not every seed must echo, but detectEcho should be consistent with the tape
    if (m.echo) {
      const { start, length } = m.echo;
      assert.ok(length >= 6);
      for (let k = 0; k < length; k++) {
        assert.notEqual(m.movesA[start + k], m.movesB[start + k]);
      }
    } else {
      // Search a few seeds to ensure the detector does fire for this pair
      let found = false;
      for (let seed = 1; seed <= 40; seed++) {
        const t = match(S.tft, S.tft, { rounds: 200, seed: seed, noise: 0.08 });
        if (t.echo) {
          found = true;
          break;
        }
      }
      assert.ok(found, "expected to find an echo for TFT vs TFT under noise in seeds 1–40");
    }
  });
});

describe("echo detector", function () {
  it("detects a CD/DC alternation and reports its start and length", function () {
    const a = ["C", "C", "C", "D", "C", "D", "C", "D", "C", "C"];
    const b = ["C", "C", "D", "C", "D", "C", "D", "C", "D", "C"];
    // From index 2: C D | D C | C D | D C | C D  — wait
    // index 2: A=C B=D, 3: A=D B=C, 4: A=C B=D, 5: A=D B=C, 6: A=C B=D, 7: A=D B=C, 8: A=C B=D
    const echo = IPD.detectEcho(a, b, 6);
    assert.ok(echo);
    assert.equal(echo.start, 2);
    assert.equal(echo.length, 7);
  });

  it("returns null when there is no alternation", function () {
    assert.equal(IPD.detectEcho(["C", "C", "C", "C"], ["C", "C", "C", "C"], 4), null);
    assert.equal(IPD.detectEcho(["C", "D", "C", "D"], ["C", "D", "C", "D"], 4), null);
  });
});

describe("tournament", function () {
  it("includes self-play and is deterministic", function () {
    const field = [S.tft, S.alld, S.allc];
    const a = IPD.runTournament(field, { rounds: 20, seed: 42, noise: 0 });
    const b = IPD.runTournament(field, { rounds: 20, seed: 42, noise: 0 });
    assert.deepEqual(a.totals, b.totals);
    assert.deepEqual(
      a.ranking.map(function (r) { return r.id; }),
      b.ranking.map(function (r) { return r.id; })
    );
  });

  it("counts TFT vs TFT self-play as 3n in the total", function () {
    const t = IPD.runTournament([S.tft], { rounds: 10, seed: 1, noise: 0 });
    assert.equal(t.totals[0], 30);
    assert.equal(t.matrix[0][0].us, 30);
  });

  it("AllD beats AllC head-to-head, and the matrix is consistent", function () {
    const field = [S.allc, S.alld];
    const t = IPD.runTournament(field, { rounds: 10, seed: 1, noise: 0 });
    const iC = 0;
    const iD = 1;
    assert.equal(t.matrix[iD][iC].us, 50);
    assert.equal(t.matrix[iC][iD].us, 0);
    // totals: AllC = self 30 + vs AllD 0 = 30; AllD = self 10 + vs AllC 50 = 60
    assert.equal(t.totals[iC], 30);
    assert.equal(t.totals[iD], 60);
    assert.equal(t.ranking[0].id, "alld");
  });

  it("in a mixed nice/nasty field with no noise, a nice strategy is among the leaders", function () {
    const field = IPD.classicStrategies();
    const t = IPD.runTournament(field, { rounds: 200, seed: 42, noise: 0 });
    const topThree = t.ranking.slice(0, 3).map(function (r) { return r.id; });
    const nice = new Set(["tft", "gtft", "tftt", "grim", "pavlov", "allc"]);
    const niceInTop = topThree.some(function (id) { return nice.has(id); });
    assert.ok(niceInTop, "top three were " + topThree.join(", "));
    // Always Defect should not win a mixed field that includes several nice strategies
    assert.notEqual(t.ranking[0].id, "alld");
  });
});

describe("ecology", function () {
  it("keeps population shares summing to 1 at every generation", function () {
    const field = IPD.classicStrategies();
    const eco = IPD.runEcology(field, { rounds: 40, seed: 2, noise: 0, generations: 80 });
    for (let g = 0; g < eco.history.length; g++) {
      const sum = eco.history[g].reduce(function (a, b) { return a + b; }, 0);
      assert.ok(Math.abs(sum - 1) < 1e-9, "generation " + g + " sum=" + sum);
      for (let i = 0; i < eco.history[g].length; i++) {
        assert.ok(eco.history[g][i] >= -1e-12, "negative share");
      }
    }
  });

  it("is deterministic for a given seed", function () {
    const field = [S.tft, S.alld, S.allc, S.joss];
    const a = IPD.runEcology(field, { rounds: 30, seed: 5, generations: 40, noise: 0 });
    const b = IPD.runEcology(field, { rounds: 30, seed: 5, generations: 40, noise: 0 });
    assert.deepEqual(a.history, b.history);
  });

  it("Always Defect takes over a population of itself and Always Cooperate", function () {
    const field = [S.allc, S.alld];
    const eco = IPD.runEcology(field, { rounds: 20, seed: 1, generations: 60, noise: 0 });
    const last = eco.history[eco.history.length - 1];
    const iD = eco.ids.indexOf("alld");
    const iC = eco.ids.indexOf("allc");
    assert.ok(last[iD] > 0.95, "AllD share " + last[iD]);
    assert.ok(last[iC] < 0.05, "AllC share " + last[iC]);
  });

  it("a two-strategy field of TFT and AllC stays at the initial shares", function () {
    // Both always cooperate against self and each other, so fitness is equal
    const field = [S.tft, S.allc];
    const eco = IPD.runEcology(field, {
      rounds: 20,
      seed: 1,
      generations: 25,
      noise: 0,
      initialShares: [0.4, 0.6],
    });
    const last = eco.history[eco.history.length - 1];
    assert.ok(Math.abs(last[0] - 0.4) < 1e-9);
    assert.ok(Math.abs(last[1] - 0.6) < 1e-9);
  });
});

describe("uncertain end", function () {
  it("is reproducible and can end before the max rounds", function () {
    const a = match(S.tft, S.alld, { rounds: 2000, seed: 17, noise: 0, uncertainEnd: true, continueProb: 0.9 });
    const b = match(S.tft, S.alld, { rounds: 2000, seed: 17, noise: 0, uncertainEnd: true, continueProb: 0.9 });
    assert.equal(a.rounds, b.rounds);
    assert.deepEqual(a.movesA, b.movesA);
    assert.ok(a.rounds < 2000, "expected an early stop, got " + a.rounds);
    assert.ok(a.rounds >= 1);
  });
});
