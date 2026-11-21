/**
 * Seeded iterated prisoner's dilemma engine.
 * Works in the browser (global IPD) and in Node (module.exports).
 * No network, no dependencies.
 */
(function (root) {
  "use strict";

  const PAYOFFS = Object.freeze({ R: 3, T: 5, P: 1, S: 0 });

  function hash32(n) {
    n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
    n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
    return (n ^ (n >>> 16)) >>> 0;
  }

  function seedFrom(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value >>> 0 || 0x9e3779b9;
    }
    const s = String(value ?? "");
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0 || 0x9e3779b9;
  }

  function seedPair(master, idA, idB) {
    let h = seedFrom(master);
    const key = String(idA) + "\0" + String(idB);
    for (let i = 0; i < key.length; i++) {
      h = hash32(h ^ key.charCodeAt(i));
    }
    return h;
  }

  /** Mulberry32 — returns a function in [0, 1). */
  function makeRng(seed) {
    let a = seedFrom(seed);
    return function rng() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function payoff(moveA, moveB, payoffs) {
    const p = payoffs || PAYOFFS;
    if (moveA === "C" && moveB === "C") return [p.R, p.R];
    if (moveA === "C" && moveB === "D") return [p.S, p.T];
    if (moveA === "D" && moveB === "C") return [p.T, p.S];
    if (moveA === "D" && moveB === "D") return [p.P, p.P];
    throw new Error("Moves must be C or D, got " + moveA + "," + moveB);
  }

  function applyNoise(move, rng, noise) {
    if (noise > 0 && rng() < noise) return move === "C" ? "D" : "C";
    return move;
  }

  function assertMove(move, who) {
    if (move !== "C" && move !== "D") {
      throw new Error((who || "strategy") + " returned invalid move: " + move);
    }
    return move;
  }

  function playMatch(strategyA, strategyB, options) {
    const opts = options || {};
    const maxRounds = opts.rounds == null ? 200 : opts.rounds;
    const noise = opts.noise == null ? 0 : opts.noise;
    const payoffs = opts.payoffs || PAYOFFS;
    const seed = opts.seed == null ? 1 : opts.seed;
    const uncertainEnd = !!opts.uncertainEnd;
    const continueProb = opts.continueProb == null ? 0.996546 : opts.continueProb;
    const generosity = opts.generosity;

    const baseA = Object.assign({}, opts.paramsA || {});
    const baseB = Object.assign({}, opts.paramsB || {});
    if (generosity != null) {
      baseA.generosity = generosity;
      baseB.generosity = generosity;
    }

    const playerA = strategyA.create(baseA);
    const playerB = strategyB.create(baseB);

    const rngChoice = makeRng(seed);
    const rngNoise = makeRng(hash32(seedFrom(seed) ^ 0xa5a5a5a5));
    const rngLength = makeRng(hash32(seedFrom(seed) ^ 0x3c3c3c3c));

    const intendedA = [];
    const intendedB = [];
    const movesA = [];
    const movesB = [];
    const scoresA = [];
    const scoresB = [];
    const flipsA = [];
    const flipsB = [];

    function ctx(mine, opp, myScores, oppScores, round, playerParams) {
      return {
        myMoves: mine,
        oppMoves: opp,
        myScores: myScores,
        oppScores: oppScores,
        round: round,
        rng: rngChoice,
        payoffs: payoffs,
        params: playerParams,
      };
    }

    for (let i = 0; i < maxRounds; i++) {
      if (i > 0 && uncertainEnd && rngLength() >= continueProb) break;

      const wantA = assertMove(
        playerA.move(ctx(movesA, movesB, scoresA, scoresB, i, baseA)),
        strategyA.id || "A"
      );
      const wantB = assertMove(
        playerB.move(ctx(movesB, movesA, scoresB, scoresA, i, baseB)),
        strategyB.id || "B"
      );
      const shownA = applyNoise(wantA, rngNoise, noise);
      const shownB = applyNoise(wantB, rngNoise, noise);
      const pair = payoff(shownA, shownB, payoffs);

      intendedA.push(wantA);
      intendedB.push(wantB);
      movesA.push(shownA);
      movesB.push(shownB);
      scoresA.push(pair[0]);
      scoresB.push(pair[1]);
      flipsA.push(wantA !== shownA);
      flipsB.push(wantB !== shownB);
    }

    const totalA = scoresA.reduce((s, x) => s + x, 0);
    const totalB = scoresB.reduce((s, x) => s + x, 0);
    const echo = detectEcho(movesA, movesB, 6);

    return {
      strategyA: strategyA.id,
      strategyB: strategyB.id,
      seed: seedFrom(seed),
      noise: noise,
      rounds: movesA.length,
      intendedA: intendedA,
      intendedB: intendedB,
      movesA: movesA,
      movesB: movesB,
      scoresA: scoresA,
      scoresB: scoresB,
      flipsA: flipsA,
      flipsB: flipsB,
      totalA: totalA,
      totalB: totalB,
      echo: echo,
      payoffs: payoffs,
    };
  }

  /**
   * Find a run of alternating CD/DC at least minLen rounds long.
   * Returns { start, length } or null.
   */
  function detectEcho(movesA, movesB, minLen) {
    const need = minLen == null ? 6 : minLen;
    const n = Math.min(movesA.length, movesB.length);
    if (n < need) return null;
    for (let i = 0; i <= n - need; i++) {
      if (movesA[i] === movesB[i]) continue;
      let ok = true;
      for (let k = 0; k < need; k++) {
        const expectA = k % 2 === 0 ? movesA[i] : movesB[i];
        const expectB = k % 2 === 0 ? movesB[i] : movesA[i];
        if (movesA[i + k] !== expectA || movesB[i + k] !== expectB) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      let len = need;
      while (i + len < n) {
        const expectA = len % 2 === 0 ? movesA[i] : movesB[i];
        const expectB = len % 2 === 0 ? movesB[i] : movesA[i];
        if (movesA[i + len] !== expectA || movesB[i + len] !== expectB) break;
        len++;
      }
      return { start: i, length: len };
    }
    return null;
  }

  function runTournament(strategyList, options) {
    const opts = options || {};
    const n = strategyList.length;
    const matrix = Array.from({ length: n }, function () {
      return Array(n).fill(null);
    });
    const totals = Array(n).fill(0);
    const matches = [];

    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        const seed = seedPair(opts.seed == null ? 1 : opts.seed, strategyList[i].id, strategyList[j].id);
        const match = playMatch(strategyList[i], strategyList[j], Object.assign({}, opts, { seed: seed }));
        matrix[i][j] = { us: match.totalA, them: match.totalB, match: match };
        totals[i] += match.totalA;
        if (i !== j) {
          matrix[j][i] = { us: match.totalB, them: match.totalA, match: match };
          totals[j] += match.totalB;
        }
        matches.push({ i: i, j: j, match: match });
      }
    }

    const ranking = totals
      .map(function (total, index) {
        return { index: index, id: strategyList[index].id, name: strategyList[index].name, total: total };
      })
      .sort(function (a, b) {
        if (b.total !== a.total) return b.total - a.total;
        return a.name.localeCompare(b.name);
      });

    return {
      strategies: strategyList,
      matrix: matrix,
      totals: totals,
      ranking: ranking,
      matches: matches,
      seed: opts.seed == null ? 1 : opts.seed,
      rounds: opts.rounds == null ? 200 : opts.rounds,
      noise: opts.noise == null ? 0 : opts.noise,
    };
  }

  function runEcology(strategyList, options) {
    const opts = options || {};
    const generations = opts.generations == null ? 200 : opts.generations;
    const n = strategyList.length;
    const tourney = runTournament(strategyList, opts);
    const W = tourney.matrix.map(function (row) {
      return row.map(function (cell) {
        return cell.us;
      });
    });

    let p;
    if (opts.initialShares && opts.initialShares.length === n) {
      p = opts.initialShares.slice();
    } else {
      p = Array(n).fill(1 / n);
    }
    normalize(p);

    const history = [p.slice()];
    for (let g = 0; g < generations; g++) {
      const fit = [];
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let j = 0; j < n; j++) s += p[j] * W[i][j];
        fit[i] = s;
      }
      const weighted = p.map(function (pi, i) {
        return pi * fit[i];
      });
      const sum = weighted.reduce(function (a, b) {
        return a + b;
      }, 0);
      if (sum <= 0) break;
      p = weighted.map(function (w) {
        return w / sum;
      });
      history.push(p.slice());
    }

    return {
      history: history,
      payoffMatrix: W,
      tournament: tourney,
      ids: strategyList.map(function (s) {
        return s.id;
      }),
    };
  }

  function normalize(p) {
    const sum = p.reduce(function (a, b) {
      return a + b;
    }, 0);
    if (sum <= 0) return p;
    for (let i = 0; i < p.length; i++) p[i] /= sum;
    return p;
  }

  function isThenable(value) {
    return !!(value && typeof value.then === "function");
  }

  /**
   * Async variant of playMatch for players whose move() returns a Promise
   * (optional local-model player). Seed, noise, and scoring are the same.
   */
  async function playMatchAsync(strategyA, strategyB, options, onRound) {
    const opts = options || {};
    const maxRounds = opts.rounds == null ? 200 : opts.rounds;
    const noise = opts.noise == null ? 0 : opts.noise;
    const payoffs = opts.payoffs || PAYOFFS;
    const seed = opts.seed == null ? 1 : opts.seed;
    const uncertainEnd = !!opts.uncertainEnd;
    const continueProb = opts.continueProb == null ? 0.996546 : opts.continueProb;
    const generosity = opts.generosity;

    const baseA = Object.assign({}, opts.paramsA || {});
    const baseB = Object.assign({}, opts.paramsB || {});
    if (generosity != null) {
      baseA.generosity = generosity;
      baseB.generosity = generosity;
    }

    const playerA = strategyA.create(baseA);
    const playerB = strategyB.create(baseB);

    const rngChoice = makeRng(seed);
    const rngNoise = makeRng(hash32(seedFrom(seed) ^ 0xa5a5a5a5));
    const rngLength = makeRng(hash32(seedFrom(seed) ^ 0x3c3c3c3c));

    const intendedA = [];
    const intendedB = [];
    const movesA = [];
    const movesB = [];
    const scoresA = [];
    const scoresB = [];
    const flipsA = [];
    const flipsB = [];
    const notesA = [];
    const notesB = [];

    function ctx(mine, opp, myScores, oppScores, round, playerParams) {
      return {
        myMoves: mine,
        oppMoves: opp,
        myScores: myScores,
        oppScores: oppScores,
        round: round,
        rng: rngChoice,
        payoffs: payoffs,
        params: playerParams,
      };
    }

    async function callMove(player, context, who) {
      const raw = player.move(context);
      const value = isThenable(raw) ? await raw : raw;
      if (value && typeof value === "object" && (value.move === "C" || value.move === "D")) {
        return { move: value.move, note: value.note || "" };
      }
      return { move: assertMove(value, who), note: "" };
    }

    for (let i = 0; i < maxRounds; i++) {
      if (i > 0 && uncertainEnd && rngLength() >= continueProb) break;

      const outA = await callMove(playerA, ctx(movesA, movesB, scoresA, scoresB, i, baseA), strategyA.id || "A");
      const outB = await callMove(playerB, ctx(movesB, movesA, scoresB, scoresA, i, baseB), strategyB.id || "B");
      const shownA = applyNoise(outA.move, rngNoise, noise);
      const shownB = applyNoise(outB.move, rngNoise, noise);
      const pair = payoff(shownA, shownB, payoffs);

      intendedA.push(outA.move);
      intendedB.push(outB.move);
      movesA.push(shownA);
      movesB.push(shownB);
      scoresA.push(pair[0]);
      scoresB.push(pair[1]);
      flipsA.push(outA.move !== shownA);
      flipsB.push(outB.move !== shownB);
      notesA.push(outA.note);
      notesB.push(outB.note);
      if (typeof onRound === "function") {
        onRound({
          round: i,
          shownA: shownA,
          shownB: shownB,
          totalA: scoresA.reduce(function (s, x) { return s + x; }, 0),
          totalB: scoresB.reduce(function (s, x) { return s + x; }, 0),
        });
      }
    }

    const totalA = scoresA.reduce(function (s, x) { return s + x; }, 0);
    const totalB = scoresB.reduce(function (s, x) { return s + x; }, 0);
    return {
      strategyA: strategyA.id,
      strategyB: strategyB.id,
      seed: seedFrom(seed),
      noise: noise,
      rounds: movesA.length,
      intendedA: intendedA,
      intendedB: intendedB,
      movesA: movesA,
      movesB: movesB,
      scoresA: scoresA,
      scoresB: scoresB,
      flipsA: flipsA,
      flipsB: flipsB,
      notesA: notesA,
      notesB: notesB,
      totalA: totalA,
      totalB: totalB,
      echo: detectEcho(movesA, movesB, 6),
      payoffs: payoffs,
    };
  }

    function runningTotals(scores) {
    const out = new Array(scores.length);
    let s = 0;
    for (let i = 0; i < scores.length; i++) {
      s += scores[i];
      out[i] = s;
    }
    return out;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function noteText(flipNote, aName, noteA, bName, noteB) {
    const parts = [];
    if (flipNote && flipNote.length) parts.push(flipNote.join(" · "));
    if (noteA) parts.push(aName + ": " + noteA);
    if (noteB) parts.push(bName + ": " + noteB);
    return parts.join(" ");
  }

  const IPD = {
    PAYOFFS: PAYOFFS,
    escapeHtml: escapeHtml,
    noteText: noteText,
    hash32: hash32,
    seedFrom: seedFrom,
    seedPair: seedPair,
    makeRng: makeRng,
    payoff: payoff,
    applyNoise: applyNoise,
    playMatch: playMatch,
    playMatchAsync: playMatchAsync,
    detectEcho: detectEcho,
    runTournament: runTournament,
    runEcology: runEcology,
    runningTotals: runningTotals,
    STRATEGIES: {},
    listStrategies: function () {
      return Object.keys(IPD.STRATEGIES).map(function (id) {
        return IPD.STRATEGIES[id];
      });
    },
    getStrategy: function (id) {
      return IPD.STRATEGIES[id];
    },
  };

  root.IPD = IPD;
  if (typeof module !== "undefined" && module.exports) module.exports = IPD;
})(typeof globalThis !== "undefined" ? globalThis : this);
