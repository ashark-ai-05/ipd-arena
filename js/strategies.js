/**
 * Classic iterated-PD strategies, written from scratch.
 * Must be loaded after engine.js. Adds IPD.STRATEGIES.
 */
(function (root) {
  "use strict";
  const IPD = root.IPD;
  if (!IPD) throw new Error("engine.js must load before strategies.js");

  function register(spec) {
    IPD.STRATEGIES[spec.id] = spec;
    return spec;
  }

  register({
    id: "allc",
    name: "Always Cooperate",
    short: "AllC",
    blurb: "Cooperates every round. Nice, clear, and a pushover.",
    tags: ["nice", "forgiving", "clear"],
    create: function () {
      return {
        move: function () {
          return "C";
        },
      };
    },
  });

  register({
    id: "alld",
    name: "Always Defect",
    short: "AllD",
    blurb: "Defects every round. Never loses a head-to-head; often finishes last overall.",
    tags: ["nasty", "clear"],
    create: function () {
      return {
        move: function () {
          return "D";
        },
      };
    },
  });

  register({
    id: "random",
    name: "Random",
    short: "Rand",
    blurb: "Cooperates or defects with equal probability. Opaque, and hard to trust.",
    tags: ["nasty"],
    create: function () {
      return {
        move: function (ctx) {
          return ctx.rng() < 0.5 ? "C" : "D";
        },
      };
    },
  });

  register({
    id: "tft",
    name: "Tit for Tat",
    short: "TFT",
    blurb: "Cooperates first, then copies the opponent’s last move.",
    tags: ["nice", "forgiving", "retaliatory", "clear"],
    create: function () {
      return {
        move: function (ctx) {
          if (ctx.oppMoves.length === 0) return "C";
          return ctx.oppMoves[ctx.oppMoves.length - 1];
        },
      };
    },
  });

  register({
    id: "gtft",
    name: "Generous Tit for Tat",
    short: "GTFT",
    blurb: "Tit for Tat that sometimes forgives a defection. Default generosity is 10%.",
    tags: ["nice", "forgiving", "retaliatory", "clear"],
    defaultGenerosity: 0.1,
    create: function (params) {
      const g =
        params && params.generosity != null
          ? params.generosity
          : 0.1;
      return {
        move: function (ctx) {
          if (ctx.oppMoves.length === 0) return "C";
          const last = ctx.oppMoves[ctx.oppMoves.length - 1];
          if (last === "C") return "C";
          return ctx.rng() < g ? "C" : "D";
        },
      };
    },
  });

  register({
    id: "tftt",
    name: "Tit for Two Tats",
    short: "TFTT",
    blurb: "Defects only after two consecutive opponent defections. Extra forgiving.",
    tags: ["nice", "forgiving", "clear"],
    create: function () {
      return {
        move: function (ctx) {
          const o = ctx.oppMoves;
          if (o.length < 2) return "C";
          if (o[o.length - 1] === "D" && o[o.length - 2] === "D") return "D";
          return "C";
        },
      };
    },
  });

  register({
    id: "grim",
    name: "Grim (Friedman)",
    short: "Grim",
    blurb: "Cooperates until the opponent defects once, then defects forever.",
    tags: ["nice", "retaliatory", "clear"],
    create: function () {
      let triggered = false;
      return {
        move: function (ctx) {
          if (triggered) return "D";
          if (ctx.oppMoves.length && ctx.oppMoves[ctx.oppMoves.length - 1] === "D") {
            triggered = true;
            return "D";
          }
          return "C";
        },
      };
    },
  });

  register({
    id: "pavlov",
    name: "Pavlov (Win-Stay Lose-Shift)",
    short: "WSLS",
    blurb: "Repeats its last move after a good payoff (R or T); switches after a poor one (P or S).",
    tags: ["nice", "forgiving", "clear"],
    create: function () {
      return {
        move: function (ctx) {
          if (ctx.myMoves.length === 0) return "C";
          const lastMine = ctx.myMoves[ctx.myMoves.length - 1];
          const lastPay = ctx.myScores[ctx.myScores.length - 1];
          const good = lastPay === ctx.payoffs.R || lastPay === ctx.payoffs.T;
          if (good) return lastMine;
          return lastMine === "C" ? "D" : "C";
        },
      };
    },
  });

  register({
    id: "joss",
    name: "Joss",
    short: "Joss",
    blurb: "Tit for Tat that sneaks in a defection about 10% of the time.",
    tags: ["nasty", "retaliatory"],
    sneak: 0.1,
    create: function (params) {
      const sneak = params && params.sneak != null ? params.sneak : 0.1;
      return {
        move: function (ctx) {
          if (ctx.oppMoves.length === 0) return "C";
          let move = ctx.oppMoves[ctx.oppMoves.length - 1];
          if (move === "C" && ctx.rng() < sneak) return "D";
          return move;
        },
      };
    },
  });

  /**
   * Tester, as described in the usual Axelrod-tournament account:
   * defect first, cooperate on the second move, then read the reply.
   * If the opponent retaliated on round 2, apologise with a second
   * cooperate (to break the echo) and play Tit for Tat thereafter.
   * If not, defect every other remaining move.
   */
  register({
    id: "tester",
    name: "Tester",
    short: "Test",
    blurb: "Probes with an opening defection. Apologises if punished; otherwise exploits.",
    tags: ["nasty"],
    create: function () {
      let mode = "probe"; // probe | tft | exploit
      return {
        move: function (ctx) {
          const r = ctx.round;
          if (r === 0) return "D";
          if (r === 1) return "C";
          if (mode === "probe" && ctx.oppMoves.length >= 2) {
            mode = ctx.oppMoves[1] === "D" ? "apologise" : "exploit";
          }
          if (mode === "apologise") {
            mode = "tft";
            return "C";
          }
          if (mode === "tft") {
            return ctx.oppMoves[ctx.oppMoves.length - 1];
          }
          // exploit: D, C, D, C... starting at round 2
          return r % 2 === 0 ? "D" : "C";
        },
      };
    },
  });

  IPD.CLASSIC_IDS = ["tft", "gtft", "tftt", "grim", "pavlov", "joss", "tester", "allc", "alld", "random"];

  IPD.classicStrategies = function () {
    return IPD.CLASSIC_IDS.map(function (id) {
      return IPD.STRATEGIES[id];
    });
  };

  /** A scripted opponent for tests. `moves` is an array of 'C'/'D'; later rounds repeat the last. */
  IPD.scripted = function (moves, id) {
    const seq = moves.slice();
    return {
      id: id || "scripted",
      name: "Scripted",
      short: "Scr",
      blurb: "Plays a fixed sequence (for tests).",
      tags: [],
      create: function () {
        return {
          move: function (ctx) {
            const i = ctx.round;
            return seq[Math.min(i, seq.length - 1)];
          },
        };
      },
    };
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
