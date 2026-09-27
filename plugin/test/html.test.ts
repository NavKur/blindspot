import { describe, expect, it } from "vitest";
import * as vm from "node:vm";
import { nonce, panelHtml } from "../src/panel/html";

describe("panel html", () => {
  const n = nonce();
  const html = panelHtml("vscode-resource://source", n);

  it("uses a strict CSP with the nonce", () => {
    expect(html).toContain(`script-src 'nonce-${n}'`);
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/on(click|change|input)=/);
  });

  it("contains a script that parses", () => {
    const match = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/);
    expect(match).toBeTruthy();
    expect(() => new vm.Script(match![1])).not.toThrow();
  });

  it("uses no em dashes in UI text", () => {
    expect(html).not.toContain("—");
  });

  it("produces different nonces", () => {
    expect(nonce()).not.toBe(nonce());
  });
});
