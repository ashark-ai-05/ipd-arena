/* IPD Arena UI. No dependencies. No network unless Ollama is turned on. */
(function () {
  "use strict";

  const COLORS = {
    tft: "#e0b15b",
    gtft: "#5ec2a8",
    tftt: "#7aa2e0",
    grim: "#d38bdb",
    pavlov: "#9ad17b",
    joss: "#e07a5f",
    tester: "#e8c9a0",
    allc: "#c9c4b8",
    alld: "#ef6f6c",
    random: "#7fdbda",
    ollama: "#f0e6d0",
  };

  const state = {
    view: "tournament",
    tournament: null,
    revealed: 0,
    anim: null,
    match: null,
    matchCursor: 0,
    matchTimer: null,
    noise: null,
    noiseCursor: 0,
    ecology: null,
    hiddenIds: {},
    demo: false,
    demoGen: 0,
    ollamaModels: [],
  };

  const $ = function (id) {
    return document.getElementById(id);
  };

  function field() {
    return IPD.classicStrategies();
  }

  function seed() {
    const n = Number($("seed").value);
    return Number.isFinite(n) ? IPD.seedFrom(n) : IPD.seedFrom(42);
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function formatNum(n) {
    return Math.round(n).toLocaleString("en-US");
  }

  function colorFor(id) {
    return COLORS[id] || "#c9c4b8";
  }

  function setView(name) {
    state.view = name;
    ["tournament", "match", "noise", "ecology"].forEach(function (v) {
      const el = $("view-" + v);
      const tab = $("tab-" + v);
      const on = v === name;
      el.classList.toggle("is-on", on);
      if (on) el.removeAttribute("hidden");
      else el.setAttribute("hidden", "");
      tab.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function fillSelects() {
    const strategies = field();
    ["match-a", "match-b"].forEach(function (id, idx) {
      const sel = $(id);
      sel.innerHTML = "";
      strategies.forEach(function (s) {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.name;
        sel.appendChild(opt);
      });
      sel.value = idx === 0 ? "tft" : "joss";
    });
    updateMatchBlurb();
  }

  function updateMatchBlurb() {
    const a = IPD.getStrategy($("match-a").value);
    const b = IPD.getStrategy($("match-b").value);
    if (!a || !b) return;
    $("match-blurb").innerHTML =
      "<strong>" + a.name + ".</strong> " + a.blurb + "<br /><br /><strong>" + b.name + ".</strong> " + b.blurb;
  }

  function heatColor(score, rounds) {
    const t = Math.max(0, Math.min(1, score / (5 * rounds)));
    const r = Math.round(30 + t * (224 - 30));
    const g = Math.round(32 + t * (177 - 32));
    const b = Math.round(40 + t * (91 - 40));
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function inkForHeat(score, rounds) {
    return score / (5 * rounds) > 0.45 ? "#1a1408" : "var(--ink)";
  }

  /* ——— tournament ——— */

  function stopAnim() {
    if (state.anim) {
      cancelAnimationFrame(state.anim);
      state.anim = null;
    }
    $("btn-skip-tourney").disabled = true;
  }

  function accumulate(upto) {
    const t = state.tournament;
    const n = t.strategies.length;
    const totals = Array(n).fill(0);
    const shown = t.matches.slice(0, upto);
    shown.forEach(function (item) {
      totals[item.i] += item.match.totalA;
      if (item.i !== item.j) totals[item.j] += item.match.totalB;
    });
    return totals;
  }

  function renderLeaderboard(totals, done) {
    const t = state.tournament;
    const n = t.strategies.length;
    const max = Math.max.apply(null, totals.concat([1]));
    const order = totals
      .map(function (total, index) {
        return { index: index, total: total, id: t.strategies[index].id, name: t.strategies[index].name, short: t.strategies[index].short };
      })
      .sort(function (a, b) {
        if (b.total !== a.total) return b.total - a.total;
        return a.name.localeCompare(b.name);
      });

    const box = $("leaderboard-rows");
    box.innerHTML = "";
    order.forEach(function (row, rank) {
      const el = document.createElement("div");
      el.className = "row" + (rank < 3 && (done || row.total > 0) ? " is-top" : "");
      el.innerHTML =
        '<div class="rank">' + (rank + 1) + "</div>" +
        '<div class="name"><strong>' + row.name + "</strong><span>" + (t.strategies[row.index].tags || []).join(" · ") + "</span></div>" +
        '<div class="bar-wrap"><div class="bar" style="width:' + ((row.total / max) * 100).toFixed(1) + "%;background:" + colorFor(row.id) + '"></div></div>' +
        '<div class="score">' + formatNum(row.total) + "</div>";
      el.addEventListener("click", function () {
        openMatch(row.id, order[0] ? order[0].id : row.id);
      });
      box.appendChild(el);
    });
  }

  function renderMatrix(upto) {
    const t = state.tournament;
    const n = t.strategies.length;
    const revealed = {};
    t.matches.slice(0, upto).forEach(function (item) {
      revealed[item.i + ":" + item.j] = true;
      revealed[item.j + ":" + item.i] = true;
    });
    let html = "<table class='matrix-table'><thead><tr><th></th>";
    t.strategies.forEach(function (s) {
      html += "<th title='" + s.name + "'>" + s.short + "</th>";
    });
    html += "</tr></thead><tbody>";
    for (let i = 0; i < n; i++) {
      html += "<tr><th>" + t.strategies[i].short + "</th>";
      for (let j = 0; j < n; j++) {
        const key = i + ":" + j;
        if (!revealed[key]) {
          html += "<td></td>";
          continue;
        }
        const cell = t.matrix[i][j];
        const cls = i === j ? " class='diag'" : "";
        html +=
          "<td" + cls + " data-a='" + t.strategies[i].id + "' data-b='" + t.strategies[j].id +
          "' style='background:" + heatColor(cell.us, t.rounds) + ";color:" + inkForHeat(cell.us, t.rounds) + "'>" +
          cell.us + "</td>";
      }
      html += "</tr>";
    }
    html += "</tbody></table>";
    $("matrix").innerHTML = html;
    $("matrix").querySelectorAll("td[data-a]").forEach(function (td) {
      td.addEventListener("click", function () {
        openMatch(td.getAttribute("data-a"), td.getAttribute("data-b"));
      });
    });
  }

  function paintTournament(upto, done) {
    const t = state.tournament;
    const totals = accumulate(upto);
    renderLeaderboard(totals, done);
    renderMatrix(upto);
    const status = done
      ? "Finished · seed " + t.seed + " · " + t.rounds + " rounds"
      : "Playing " + upto + " / " + t.matches.length + " matches";
    $("tourney-status").textContent = status;
  }

  function animateTournament() {
    stopAnim();
    const total = state.tournament.matches.length;
    if (prefersReducedMotion()) {
      state.revealed = total;
      paintTournament(total, true);
      return Promise.resolve();
    }
    $("btn-skip-tourney").disabled = false;
    return new Promise(function (resolve) {
      const start = performance.now();
      const duration = Math.min(2400, 80 * total);
      function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        const upto = Math.max(1, Math.round(t * total));
        state.revealed = upto;
        paintTournament(upto, t >= 1);
        if (t < 1 && state.anim !== null) {
          state.anim = requestAnimationFrame(frame);
        } else {
          state.anim = null;
          state.revealed = total;
          paintTournament(total, true);
          $("btn-skip-tourney").disabled = true;
          resolve();
        }
      }
      state.anim = requestAnimationFrame(frame);
    });
  }

  function runTournament(opts) {
    stopAnim();
    const rounds = Math.max(1, Number($("rounds").value) || 200);
    const noise = Math.max(0, Math.min(1, Number($("tourney-noise").value) || 0));
    const result = IPD.runTournament(field(), { rounds: rounds, seed: seed(), noise: noise });
    state.tournament = result;
    $("tourney-hint").textContent =
      "Round-robin of " + result.strategies.length + " strategies, including self-play. Winner: " + result.ranking[0].name + ".";
    if (opts && opts.animate === false) {
      state.revealed = result.matches.length;
      paintTournament(result.matches.length, true);
      return Promise.resolve();
    }
    return animateTournament();
  }

  /* ——— match tape ——— */

  function stopScrub(which) {
    const key = which === "noise" ? "noiseTimer" : "matchTimer";
    if (state[key]) {
      clearInterval(state[key]);
      state[key] = null;
    }
  }

  function renderTape(container, match, cursor, kind) {
    if (!match) {
      container.innerHTML = "<p class='hint'>No match yet.</p>";
      return;
    }
    const specA = IPD.getStrategy(match.strategyA) || { name: match.strategyA, short: match.strategyA };
    const specB = IPD.getStrategy(match.strategyB) || { name: match.strategyB, short: match.strategyB };
    const aName = match.labelA || specA.name;
    const bName = match.labelB || specB.name;
    const aShort = match.shortA || specA.short;
    const bShort = match.shortB || specB.short;
    const runA = IPD.runningTotals(match.scoresA);
    const runB = IPD.runningTotals(match.scoresB);
    const i = Math.max(0, Math.min(cursor, match.rounds - 1));
    const echo = match.echo;
    const flipNote = [];
    if (match.flipsA[i]) flipNote.push(aName + " intended " + match.intendedA[i] + ", noise showed " + match.movesA[i]);
    if (match.flipsB[i]) flipNote.push(bName + " intended " + match.intendedB[i] + ", noise showed " + match.movesB[i]);
    const noteA = match.notesA && match.notesA[i] ? match.notesA[i] : "";
    const noteB = match.notesB && match.notesB[i] ? match.notesB[i] : "";

    let callout = "";
    if (echo) {
      if (i >= echo.start && i < echo.start + echo.length) {
        callout = "Echo: alternating retaliation from round " + (echo.start + 1) + " for " + echo.length + " rounds.";
      } else if (i < echo.start) {
        callout = "An echo begins at round " + (echo.start + 1) + ".";
      } else {
        callout = "Echo started at round " + (echo.start + 1) + " and ran " + echo.length + " rounds.";
      }
    } else if (match.noise > 0) {
      callout = "No long echo detected in this tape.";
    }

    function cells(moves, flips, player) {
      return moves
        .map(function (m, idx) {
          const cls = ["cell", m];
          if (idx === i) cls.push("current");
          if (flips[idx]) cls.push("flip");
          if (echo && idx >= echo.start && idx < echo.start + echo.length) cls.push("in-echo");
          return '<button type="button" class="' + cls.join(" ") + '" data-kind="' + kind + '" data-i="' + idx + '" title="Round ' + (idx + 1) + '">' + m + "</button>";
        })
        .join("");
    }

    container.innerHTML =
      '<div class="duel">' +
        '<div class="combatant"><div class="who">' + aName + '</div><div class="total">' + formatNum(i >= 0 ? runA[i] : 0) + "</div></div>" +
        '<div class="versus">VS</div>' +
        '<div class="combatant b"><div class="who">' + bName + '</div><div class="total">' + formatNum(i >= 0 ? runB[i] : 0) + "</div></div>" +
      "</div>" +
      '<div class="round-card">' +
        '<div class="now">Round ' + (i + 1) + " of " + match.rounds + "</div>" +
        "<div>" +
          '<span class="pill ' + match.movesA[i] + '">' + aShort + " " + match.movesA[i] + "</span> " +
          '<span class="pill ' + match.movesB[i] + '">' + bShort + " " + match.movesB[i] + "</span>" +
          " · payoff " + match.scoresA[i] + " / " + match.scoresB[i] +
        "</div>" +
        (flipNote.length || noteA || noteB
          ? '<div class="note" style="flex-basis:100%">' + (flipNote.join(" · ") || "") + (noteA ? " " + aName + ": " + noteA : "") + (noteB ? " " + bName + ": " + noteB : "") + "</div>"
          : "") +
      "</div>" +
      '<div class="tape"><div class="tape-label"><span>' + aName + "</span><span>White dot = noise flip · gold edge = echo</span></div>" +
      '<div class="cells">' + cells(match.movesA, match.flipsA, "a") + "</div>" +
      '<div class="tape-label"><span>' + bName + "</span></div>" +
      '<div class="cells">' + cells(match.movesB, match.flipsB, "b") + "</div></div>" +
      '<input class="scrub" type="range" min="0" max="' + (match.rounds - 1) + '" value="' + i + '" data-kind="' + kind + '" />' +
      '<div class="tape-actions">' +
        '<button type="button" class="btn" data-act="prev" data-kind="' + kind + '">Previous</button>' +
        '<button type="button" class="btn" data-act="play" data-kind="' + kind + '">Play</button>' +
        '<button type="button" class="btn" data-act="next" data-kind="' + kind + '">Next</button>' +
      "</div>" +
      (callout ? '<div class="callout">' + callout + "</div>" : "");
  }

  function setMatchCursor(i) {
    if (!state.match) return;
    state.matchCursor = Math.max(0, Math.min(i, state.match.rounds - 1));
    renderTape($("match-stage"), state.match, state.matchCursor, "match");
  }

  function setNoiseCursor(i) {
    if (!state.noise) return;
    state.noiseCursor = Math.max(0, Math.min(i, state.noise.rounds - 1));
    renderTape($("noise-stage"), state.noise, state.noiseCursor, "noise");
  }

  function startScrub(kind) {
    const isNoise = kind === "noise";
    stopScrub(kind);
    const key = isNoise ? "noiseTimer" : "matchTimer";
    state[key] = setInterval(function () {
      const m = isNoise ? state.noise : state.match;
      const cur = isNoise ? state.noiseCursor : state.matchCursor;
      if (!m || cur >= m.rounds - 1) {
        stopScrub(kind);
        return;
      }
      if (isNoise) setNoiseCursor(cur + 1);
      else setMatchCursor(cur + 1);
    }, 90);
  }

  async function runMatch() {
    stopScrub("match");
    const aId = $("match-a").value;
    const bId = $("match-b").value;
    let a = IPD.getStrategy(aId);
    let b = IPD.getStrategy(bId);
    const rounds = Math.max(1, Number($("match-rounds").value) || 200);
    const noise = Math.max(0, Math.min(1, Number($("match-noise").value) || 0));
    const opts = { rounds: rounds, seed: seed(), noise: noise };
    $("match-stage").innerHTML = "<p class='hint'>Playing…</p>";

    if ((aId === "ollama" || bId === "ollama") && IPD.Ollama && $("ollama-on").checked) {
      const model = $("ollama-model").value;
      if (!model) {
        $("match-stage").innerHTML = "<p class='hint'>Pick a local Ollama model first.</p>";
        return;
      }
      const llm = IPD.Ollama.createStrategy(model);
      if (aId === "ollama") a = llm;
      if (bId === "ollama") b = llm;
      // Keep LLM matches short enough to demonstrate
      opts.rounds = Math.min(rounds, 30);
      $("match-rounds").value = String(opts.rounds);
      state.match = await IPD.playMatchAsync(a, b, opts);
    } else {
      state.match = IPD.playMatch(a, b, opts);
    }
    setMatchCursor(0);
  }

  function openMatch(idA, idB) {
    if (idA === "ollama" || idB === "ollama") return;
    $("match-a").value = idA;
    $("match-b").value = idB;
    $("match-noise").value = $("tourney-noise").value || "0";
    $("match-rounds").value = $("rounds").value || "200";
    updateMatchBlurb();
    setView("match");
    runMatch();
  }

  /* ——— noise lab ——— */

  function noiseParams() {
    return {
      noise: Number($("noise-slider").value) / 100,
      generosity: Number($("gen-slider").value) / 100,
    };
  }

  function updateSliderLabels() {
    $("noise-val").textContent = $("noise-slider").value + "%";
    $("gen-val").textContent = $("gen-slider").value + "%";
  }

  function runNoise() {
    stopScrub("noise");
    const p = noiseParams();
    const spec = IPD.getStrategy("gtft");
    const result = IPD.playMatch(spec, spec, {
      rounds: Math.max(1, Number($("rounds").value) || 200),
      seed: seed(),
      noise: p.noise,
      generosity: p.generosity,
    });
    state.noise = result;
    if (p.generosity === 0) {
      result.labelA = result.labelB = "Tit for Tat";
      result.shortA = result.shortB = "TFT";
    } else {
      result.labelA = result.labelB = "Generous Tit for Tat";
      result.shortA = result.shortB = "GTFT";
    }
    const mutual = result.movesA.filter(function (m, i) { return m === "C" && result.movesB[i] === "C"; }).length;
    const flips = result.flipsA.filter(Boolean).length + result.flipsB.filter(Boolean).length;
    $("noise-stats").innerHTML =
      '<div class="stat"><b>' + formatNum(result.totalA) + " / " + formatNum(result.totalB) + "</b><span>Scores</span></div>" +
      '<div class="stat"><b>' + mutual + "</b><span>Mutual C rounds</span></div>" +
      '<div class="stat"><b>' + flips + "</b><span>Noise flips</span></div>" +
      '<div class="stat"><b>' + (result.echo ? result.echo.length + " r" : "None") + "</b><span>Longest echo</span></div>";
    const startAt = result.echo ? result.echo.start : 0;
    setNoiseCursor(startAt);
  }

  /* ——— ecology ——— */

  function pathFrom(xs, ys) {
    return xs
      .map(function (x, i) {
        return (i === 0 ? "M" : "L") + x.toFixed(2) + " " + ys[i].toFixed(2);
      })
      .join(" ");
  }

  function areaPath(xs, y0, y1) {
    const top = xs.map(function (x, i) {
      return (i === 0 ? "M" : "L") + x.toFixed(2) + " " + y1[i].toFixed(2);
    });
    const bot = xs
      .slice()
      .reverse()
      .map(function (x, i) {
        const idx = xs.length - 1 - i;
        return "L" + x.toFixed(2) + " " + y0[idx].toFixed(2);
      });
    return top.join(" ") + " " + bot.join(" ") + " Z";
  }

  function drawEcology() {
    const svg = $("eco-chart");
    const eco = state.ecology;
    svg.innerHTML = "";
    if (!eco) return;
    const W = 900, H = 360, padL = 36, padR = 16, padT = 16, padB = 28;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const gens = eco.history.length;
    const n = eco.ids.length;
    const xs = eco.history.map(function (_, g) {
      return padL + (innerW * g) / Math.max(1, gens - 1);
    });

    const stacks = [];
    for (let g = 0; g < gens; g++) {
      let acc = 0;
      const layer = [];
      for (let i = 0; i < n; i++) {
        const share = state.hiddenIds[eco.ids[i]] ? 0 : eco.history[g][i];
        layer.push([acc, acc + share]);
        acc += share;
      }
      // renormalize visible stack into full height
      const total = acc || 1;
      stacks.push(
        layer.map(function (pair) {
          return [pair[0] / total, pair[1] / total];
        })
      );
    }

    const ns = document.createElementNS("http://www.w3.org/2000/svg", "g");
    for (let i = 0; i < n; i++) {
      if (state.hiddenIds[eco.ids[i]]) continue;
      const y0 = [];
      const y1 = [];
      for (let g = 0; g < gens; g++) {
        y0.push(padT + innerH * (1 - stacks[g][i][0]));
        y1.push(padT + innerH * (1 - stacks[g][i][1]));
      }
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", areaPath(xs, y0, y1));
      path.setAttribute("fill", colorFor(eco.ids[i]));
      path.setAttribute("fill-opacity", "0.88");
      path.setAttribute("stroke", "rgba(12,13,16,0.35)");
      path.setAttribute("stroke-width", "0.6");
      ns.appendChild(path);
    }
    // frame + axis
    const axis = document.createElementNS("http://www.w3.org/2000/svg", "g");
    axis.innerHTML =
      '<line x1="' + padL + '" y1="' + (padT + innerH) + '" x2="' + (W - padR) + '" y2="' + (padT + innerH) + '" stroke="rgba(232,220,196,0.25)" />' +
      '<text x="' + padL + '" y="' + (H - 8) + '" fill="rgba(232,220,196,0.45)" font-size="11" font-family="ui-monospace, monospace">gen 0</text>' +
      '<text x="' + (W - padR - 70) + '" y="' + (H - 8) + '" fill="rgba(232,220,196,0.45)" font-size="11" font-family="ui-monospace, monospace">gen ' + (gens - 1) + "</text>" +
      '<text x="4" y="' + (padT + 8) + '" fill="rgba(232,220,196,0.45)" font-size="11" font-family="ui-monospace, monospace">100%</text>' +
      '<text x="8" y="' + (padT + innerH) + '" fill="rgba(232,220,196,0.45)" font-size="11" font-family="ui-monospace, monospace">0</text>';
    svg.appendChild(ns);
    svg.appendChild(axis);

    const last = eco.history[eco.history.length - 1];
    const leaderIdx = last.indexOf(Math.max.apply(null, last));
    $("eco-status").textContent =
      "After " + (gens - 1) + " generations, " + (IPD.getStrategy(eco.ids[leaderIdx]) || { name: eco.ids[leaderIdx] }).name +
      " holds " + Math.round(last[leaderIdx] * 100) + "%";

    const legend = $("eco-legend");
    legend.innerHTML = "";
    eco.ids.forEach(function (id, i) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = state.hiddenIds[id] ? "is-off" : "";
      btn.innerHTML = '<span class="swatch" style="background:' + colorFor(id) + '"></span>' + (IPD.getStrategy(id) || { short: id }).name;
      btn.addEventListener("click", function () {
        state.hiddenIds[id] = !state.hiddenIds[id];
        drawEcology();
      });
      legend.appendChild(btn);
    });
  }

  function runEcology() {
    const generations = Math.max(1, Number($("generations").value) || 200);
    const rounds = Math.max(1, Number($("rounds").value) || 200);
    const noise = Math.max(0, Math.min(1, Number($("tourney-noise").value) || 0));
    state.hiddenIds = {};
    state.ecology = IPD.runEcology(field(), {
      rounds: rounds,
      seed: seed(),
      noise: noise,
      generations: generations,
    });
    drawEcology();
  }

  /* ——— ollama (opt-in only) ——— */

  async function toggleOllama() {
    const on = $("ollama-on").checked;
    const status = $("ollama-status");
    const sel = $("ollama-model");
    if (!on) {
      sel.hidden = true;
      status.textContent = "Off. No network requests are made until you enable this.";
      // remove ollama from selects if present
      ["match-a", "match-b"].forEach(function (id) {
        const el = $(id);
        const opt = el.querySelector('option[value="ollama"]');
        if (opt) opt.remove();
        if (el.value === "ollama") el.value = "tft";
      });
      updateMatchBlurb();
      return;
    }
    status.textContent = "Checking for Ollama at 127.0.0.1:11434…";
    try {
      const models = await IPD.Ollama.listModels();
      state.ollamaModels = models;
      if (!models.length) {
        status.innerHTML = 'Ollama is running but has no models. Try <span class="kicker">ollama pull llama3.2</span> locally.';
        sel.hidden = true;
        $("ollama-on").checked = false;
        return;
      }
      sel.innerHTML = "";
      models.forEach(function (name) {
        const o = document.createElement("option");
        o.value = name;
        o.textContent = name;
        sel.appendChild(o);
      });
      sel.hidden = false;
      status.textContent = "Connected locally. The model appears as a match-tape player only. Keep matches short (capped at 30 rounds).";
      ["match-a", "match-b"].forEach(function (id) {
        const el = $(id);
        if (!el.querySelector('option[value="ollama"]')) {
          const o = document.createElement("option");
          o.value = "ollama";
          o.textContent = "Local model (Ollama)";
          el.appendChild(o);
        }
      });
    } catch (err) {
      status.textContent = "Could not reach Ollama at 127.0.0.1:11434. Start it locally, then try again. " + (err && err.message ? err.message : "");
      $("ollama-on").checked = false;
      sel.hidden = true;
    }
  }

  /* ——— demo ——— */

  function wait(ms) {
    const gen = state.demoGen;
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve(gen === state.demoGen && state.demo);
      }, ms);
    });
  }

  function stopDemo() {
    state.demo = false;
    state.demoGen += 1;
    $("btn-demo").textContent = "Play demo";
    stopAnim();
    stopScrub("match");
    stopScrub("noise");
  }

  async function playDemo() {
    if (state.demo) {
      stopDemo();
      return;
    }
    state.demo = true;
    state.demoGen += 1;
    $("btn-demo").textContent = "Stop demo";
    $("seed").value = "42";
    $("rounds").value = "200";
    $("tourney-noise").value = "0";
    setView("tournament");
    await runTournament({ animate: true });
    if (!(await wait(1100))) return;
    openMatch("tft", "joss");
    // openMatch kicks off runMatch; give it a tick
    await wait(200);
    if (!state.demo) return;
    if (state.match) {
      const firstD = state.match.movesA.findIndex(function (m) { return m === "D"; });
      const target = state.match.echo ? state.match.echo.start : (firstD >= 0 ? firstD : 12);
      setMatchCursor(Math.max(0, target));
    }
    if (!(await wait(1400))) return;
    setView("noise");
    $("noise-slider").value = "5";
    $("gen-slider").value = "0";
    updateSliderLabels();
    runNoise();
    if (!(await wait(1600))) return;
    $("gen-slider").value = "10";
    updateSliderLabels();
    runNoise();
    if (!(await wait(1600))) return;
    setView("ecology");
    runEcology();
    await wait(800);
    stopDemo();
  }

  /* ——— events ——— */

  function onTapeClick(ev) {
    const cell = ev.target.closest(".cell");
    if (cell) {
      const kind = cell.getAttribute("data-kind");
      const i = Number(cell.getAttribute("data-i"));
      if (kind === "noise") setNoiseCursor(i);
      else setMatchCursor(i);
      return;
    }
    const scrub = ev.target.closest && ev.target.closest(".scrub");
    if (scrub && ev.type === "input") {
      const kind = scrub.getAttribute("data-kind");
      const i = Number(scrub.value);
      if (kind === "noise") setNoiseCursor(i);
      else setMatchCursor(i);
    }
    const btn = ev.target.closest("[data-act]");
    if (btn) {
      const kind = btn.getAttribute("data-kind");
      const act = btn.getAttribute("data-act");
      const isNoise = kind === "noise";
      const cur = isNoise ? state.noiseCursor : state.matchCursor;
      if (act === "prev") isNoise ? setNoiseCursor(cur - 1) : setMatchCursor(cur - 1);
      if (act === "next") isNoise ? setNoiseCursor(cur + 1) : setMatchCursor(cur + 1);
      if (act === "play") startScrub(kind);
    }
  }

  function init() {
    fillSelects();
    updateSliderLabels();

    document.querySelectorAll(".tabs [data-view]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setView(btn.getAttribute("data-view"));
      });
    });

    $("btn-run-tourney").addEventListener("click", function () {
      runTournament({ animate: true });
    });
    $("btn-skip-tourney").addEventListener("click", function () {
      if (!state.tournament) return;
      stopAnim();
      state.revealed = state.tournament.matches.length;
      paintTournament(state.revealed, true);
    });
    $("btn-run-match").addEventListener("click", function () {
      runMatch();
    });
    $("btn-run-noise").addEventListener("click", function () {
      runNoise();
    });
    $("btn-run-ecology").addEventListener("click", function () {
      runEcology();
    });
    $("btn-demo").addEventListener("click", function () {
      playDemo();
    });
    $("btn-about").addEventListener("click", function () {
      $("about").hidden = false;
    });
    $("btn-about-close").addEventListener("click", function () {
      $("about").hidden = true;
    });
    $("about").addEventListener("click", function (ev) {
      if (ev.target === $("about")) $("about").hidden = true;
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") $("about").hidden = true;
    });

    $("match-a").addEventListener("change", updateMatchBlurb);
    $("match-b").addEventListener("change", updateMatchBlurb);
    $("noise-slider").addEventListener("input", updateSliderLabels);
    $("gen-slider").addEventListener("input", updateSliderLabels);
    $("ollama-on").addEventListener("change", toggleOllama);

    $("view-match").addEventListener("click", onTapeClick);
    $("view-match").addEventListener("input", onTapeClick);
    $("view-noise").addEventListener("click", onTapeClick);
    $("view-noise").addEventListener("input", onTapeClick);

    // First paint: run a silent tournament so the opening screenshot is full.
    runTournament({ animate: false });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
