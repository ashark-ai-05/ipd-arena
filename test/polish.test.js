"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

require(path.join(__dirname, "../js/engine.js"));
require(path.join(__dirname, "../js/strategies.js"));
require(path.join(__dirname, "../js/ollama.js"));

const IPD = globalThis.IPD;

describe("Ollama base URL is local-only", function () {
  const allow = [
    undefined,
    "",
    "http://127.0.0.1:11434",
    "http://127.0.0.1:11434/",
    "http://localhost:11434",
    "http://localhost",
    "https://127.0.0.1:11434",
    "http://[::1]:11434",
    "http://[::1]",
  ];

  allow.forEach(function (url) {
    it("allows " + (url === undefined ? "the default" : JSON.stringify(url)), function () {
      const origin = IPD.Ollama.assertLocalBaseUrl(url);
      assert.match(origin, /^https?:\/\//);
      const host = new URL(origin).hostname.replace(/^\[/, "").replace(/\]$/, "");
      assert.ok(host === "127.0.0.1" || host === "localhost" || host === "::1", host);
    });
  });

  const reject = [
    "http://example.com",
    "https://example.com:11434",
    "http://127.0.0.1.example.com",
    "http://localhost.example.com",
    "http://192.168.1.1:11434",
    "http://0.0.0.0:11434",
    "http://[::ffff:8.8.8.8]",
    "ftp://127.0.0.1:11434",
    "javascript:alert(1)",
    "not-a-url",
  ];

  reject.forEach(function (url) {
    it("rejects " + url, function () {
      assert.throws(function () {
        IPD.Ollama.assertLocalBaseUrl(url);
      }, /Ollama URL must/);
    });
  });

  it("listModels does not fetch when the URL is remote", async function () {
    const original = globalThis.fetch;
    let called = 0;
    globalThis.fetch = async function () {
      called += 1;
      throw new Error("fetch should not be called");
    };
    try {
      await assert.rejects(function () {
        return IPD.Ollama.listModels("https://evil.example");
      }, /Ollama URL must/);
      assert.equal(called, 0);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("createStrategy throws before any request when the URL is remote", function () {
    assert.throws(function () {
      IPD.Ollama.createStrategy("llama3.2", "http://example.com:11434");
    }, /Ollama URL must/);
  });
});

describe("Ollama notes are treated as text, not HTML", function () {
  it("escapeHtml encodes markup and quotes", function () {
    assert.equal(
      IPD.escapeHtml('<img src=x onerror="alert(1)">&'),
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;"
    );
    assert.equal(IPD.escapeHtml("it's"), "it&#39;s");
    assert.equal(IPD.escapeHtml(null), "");
  });

  it("noteText keeps a model note as plain text (no HTML wrapping)", function () {
    const xss = '<img src=x onerror="alert(1)">';
    const text = IPD.noteText([], "Local model", xss, "TFT", "");
    assert.equal(text, "Local model: " + xss);
    assert.equal(text.indexOf("<div"), -1);
    // If this string is ever interpolated into HTML, escape it first.
    const safe = IPD.escapeHtml(text);
    assert.equal(safe.indexOf("<img"), -1);
    assert.ok(safe.indexOf("&lt;img") !== -1);
  });
});
