import { describe, expect, it } from "vitest";
import { CONTRACT_PROMPT, parseContractAnswer } from "./contractAnswer";

describe("CONTRACT_PROMPT", () => {
  it("asks for exactly the six labels the parser understands", () => {
    for (const label of ["SUPPLY TERMS:", "SUPPLY OBLIGATIONS:", "SPT OR GPT:", "INTERCOMS:", "SOMA:", "TYPE:"]) {
      expect(CONTRACT_PROMPT).toContain(label);
    }
  });
});

describe("parseContractAnswer", () => {
  it("reads the plain six-line reply", () => {
    const r = parseContractAnswer(
      ["SUPPLY TERMS: DAP Italy, 30 days payment", "SUPPLY OBLIGATIONS: Deliver by Q3 2026", "SPT OR GPT: SPT", "INTERCOMS: Included", "SOMA: NOT STATED", "TYPE: Single-axis tracker"].join("\n"),
    );
    expect(r.fields).toEqual({
      supplyTerms: "DAP Italy, 30 days payment",
      supplyObligations: "Deliver by Q3 2026",
      soilTest: "SPT",
      intercoms: "Included",
      soma: "",
      projectType: "Single-axis tracker",
    });
    expect(r.found).toBe(5);
  });

  it("copes with markdown, bullets, mixed case and a friendly intro", () => {
    const r = parseContractAnswer(
      ["Sure! Here are the details:", "", "- **Supply terms:** DAP Italy", "- **Supply obligations:** Deliver by Q3", "3. **SPT or GPT:** gpt", "* Intercoms: n/a", "SOMA: Yes", "**Type:** Tracker"].join("\n"),
    );
    expect(r.fields.supplyTerms).toBe("DAP Italy");
    expect(r.fields.supplyObligations).toBe("Deliver by Q3");
    expect(r.fields.soilTest).toBe("GPT");
    expect(r.fields.intercoms).toBe("");
    expect(r.fields.soma).toBe("Yes");
    expect(r.fields.projectType).toBe("Tracker");
  });

  it("joins a value that continues on the next lines, and accepts the longer label names", () => {
    const r = parseContractAnswer("Contractual supply terms: DAP Italy,\npayment within 30 days\n- penalty 1% per week\nContractual supply obligations: Deliver by Q3");
    expect(r.fields.supplyTerms).toBe("DAP Italy, payment within 30 days penalty 1% per week");
    expect(r.fields.supplyObligations).toBe("Deliver by Q3");
  });

  it("does not mistake other 'type:' style words for fields, and rejects an invalid SPT/GPT value", () => {
    const r = parseContractAnswer("SUPPLY TERMS: Payment type: wire\nSPT OR GPT: DPT");
    expect(r.fields.supplyTerms).toBe("Payment type: wire");
    expect(r.fields.soilTest).toBe("");
  });

  it("finds nothing in unrelated text", () => {
    expect(parseContractAnswer("Hello, I could not open the file.").found).toBe(0);
    expect(parseContractAnswer("").found).toBe(0);
  });
});
