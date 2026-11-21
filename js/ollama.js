/**
 * Optional local-model player. Makes no network requests unless the user
 * explicitly enables it. Talks only to a local Ollama server.
 */
(function (root) {
  "use strict";
  const IPD = root.IPD;
  if (!IPD) throw new Error("engine.js must load before ollama.js");

  const DEFAULT_URL = "http://127.0.0.1:11434";

  function parseMove(text) {
    const raw = String(text || "");
    const first = raw.trim().charAt(0).toUpperCase();
    if (first === "C" || first === "D") {
      return { move: first, note: raw.trim().slice(1).replace(/^[\s:,-]+/, "").slice(0, 180) };
    }
    const found = raw.match(/\b([CD])\b/);
    if (found) return { move: found[1], note: raw.trim().slice(0, 180) };
    return { move: "C", note: "unparsed reply; defaulted to C" };
  }

  function historyLines(ctx, label) {
    const n = ctx.oppMoves.length;
    if (n === 0) return "No rounds yet. This is the first move.";
    const parts = [];
    const from = Math.max(0, n - 12);
    for (let i = from; i < n; i++) {
      parts.push("R" + (i + 1) + ": you " + ctx.myMoves[i] + ", opponent " + ctx.oppMoves[i] + " (you scored " + ctx.myScores[i] + ")");
    }
    return parts.join("\n");
  }

  IPD.Ollama = {
    baseUrl: DEFAULT_URL,
    enabled: false,

    listModels: async function (baseUrl) {
      const url = (baseUrl || DEFAULT_URL).replace(/\/$/, "") + "/api/tags";
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) throw new Error("Ollama returned " + res.status);
      const data = await res.json();
      const models = (data.models || []).map(function (m) {
        return m.name;
      });
      return models;
    },

    createStrategy: function (model, baseUrl) {
      const host = (baseUrl || DEFAULT_URL).replace(/\/$/, "");
      const modelName = model;
      return {
        id: "ollama",
        name: "Local model",
        short: "LLM",
        blurb: "A local Ollama model choosing C or D from the visible history.",
        tags: ["local-model"],
        async: true,
        create: function () {
          return {
            move: async function (ctx) {
              const body = {
                model: modelName,
                stream: false,
                messages: [
                  {
                    role: "system",
                    content:
                      "You are playing the iterated prisoner's dilemma. Reply with a single letter C (cooperate) or D (defect) on the first line, then an optional short reason. Payoffs: CC=3,3; DC=5,0; CD=0,5; DD=1,1. Do not mention being an AI.",
                  },
                  {
                    role: "user",
                    content:
                      "Round " + (ctx.round + 1) + ".\n" + historyLines(ctx) + "\nWhat do you play?",
                  },
                ],
              };
              const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
              const timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : null;
              try {
                const res = await fetch(host + "/api/chat", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
                  signal: ctrl ? ctrl.signal : undefined,
                });
                if (!res.ok) throw new Error("Ollama " + res.status);
                const data = await res.json();
                const text = (data.message && data.message.content) || "";
                return parseMove(text);
              } catch (err) {
                return { move: "C", note: "Ollama error: " + (err && err.message ? err.message : "failed") };
              } finally {
                if (timer) clearTimeout(timer);
              }
            },
          };
        },
      };
    },
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
