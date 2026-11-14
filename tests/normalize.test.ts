import { describe, it, expect } from "vitest";
import {
  phoneDigits,
  phoneKeys,
  emailNormalized,
  nameParts,
  normalizeHeader,
  guessField,
  buildColumnMap,
  parseRow,
  parseStage,
  parseSource,
  identityKeys,
} from "@/lib/leads/normalize";

describe("phoneDigits", () => {
  it("keeps an already-E164 number", () => {
    expect(phoneDigits("+919999988888")).toBe("919999988888");
  });

  it("strips formatting characters", () => {
    expect(phoneDigits("+91 99999-88888")).toBe("919999988888");
    // Same number, no country code written — must canonicalise identically.
    expect(phoneDigits("(99999) 88888")).toBe("919999988888");
  });

  it("assumes India for a bare 10-digit national number", () => {
    expect(phoneDigits("9999988888")).toBe("919999988888");
  });

  it("drops a leading national trunk 0 before prefixing", () => {
    expect(phoneDigits("09999988888")).toBe("919999988888");
  });

  it("unwraps the 00 international prefix", () => {
    expect(phoneDigits("00919999988888")).toBe("919999988888");
  });

  it("returns null for junk rather than a misleading value", () => {
    expect(phoneDigits("")).toBeNull();
    expect(phoneDigits(null)).toBeNull();
    expect(phoneDigits(undefined)).toBeNull();
    expect(phoneDigits("N/A")).toBeNull();
    expect(phoneDigits("abc-def")).toBeNull();
  });
});

describe("phoneKeys", () => {
  it("treats every spelling of one number as the same person", () => {
    const canonical = phoneKeys("+91 99999 88888");
    for (const variant of ["9999988888", "09999988888", "+91-99999-88888", "00919999988888"]) {
      expect(phoneKeys(variant)).toEqual(canonical);
    }
  });

  it("does not collide two different numbers", () => {
    const a = phoneKeys("9999988888");
    const b = phoneKeys("9999977777");
    expect(a.some((k) => b.includes(k))).toBe(false);
  });

  it("yields nothing for a blank phone", () => {
    expect(phoneKeys("")).toEqual([]);
    expect(phoneKeys(null)).toEqual([]);
  });
});

describe("emailNormalized", () => {
  it("lowercases and trims", () => {
    expect(emailNormalized("  Robin.Stone@Example.COM ")).toBe("robin.stone@example.com");
  });

  it("rejects things that are not addresses", () => {
    expect(emailNormalized("robin")).toBeNull();
    expect(emailNormalized("")).toBeNull();
    expect(emailNormalized(null)).toBeNull();
  });
});

describe("nameParts", () => {
  it("splits first from the rest", () => {
    expect(nameParts("Robin Stone")).toEqual({ firstName: "Robin", lastName: "Stone" });
  });

  it("keeps middle names in lastName", () => {
    expect(nameParts("Robin Lane Stone")).toEqual({ firstName: "Robin", lastName: "Lane Stone" });
  });

  it("collapses odd whitespace", () => {
    expect(nameParts("  Robin   Stone ")).toEqual({ firstName: "Robin", lastName: "Stone" });
  });

  it("handles a single name", () => {
    expect(nameParts("Cher")).toEqual({ firstName: "Cher", lastName: "" });
  });
});

describe("header guessing", () => {
  it("normalises headers by dropping punctuation", () => {
    expect(normalizeHeader("E-mail Address")).toBe("emailaddress");
    expect(normalizeHeader("Mobile Number")).toBe("mobilenumber");
  });

  it("recognises TeleCRM and Meta style headers", () => {
    expect(guessField("Full Name")).toBe("name");
    expect(guessField("E-mail Address")).toBe("email");
    expect(guessField("Mobile Number")).toBe("phone");
    expect(guessField("Company Name")).toBe("company");
    expect(guessField("WhatsApp Number")).toBe("phone");
  });

  it("returns null for headers it cannot place", () => {
    expect(guessField("Lead Temperature")).toBeNull();
  });

  it("prefers an explicit admin mapping over the guess", () => {
    const { mapping, unmapped } = buildColumnMap(
      ["Full Name", "Mystery Field", "Mobile Number"],
      { "Full Name": "company" }
    );
    expect(mapping["Full Name"]).toBe("company");
    expect(mapping["Mobile Number"]).toBe("phone");
    expect(unmapped).toEqual(["Mystery Field"]);
  });
});

describe("parseStage / parseSource", () => {
  it("accepts the real enum values", () => {
    expect(parseStage("QUALIFIED")).toBe("QUALIFIED");
    expect(parseStage("needs analysis")).toBe("NEEDS_ANALYSIS");
  });

  it("understands sales language", () => {
    expect(parseStage("Closed Won")).toBe("WON");
    expect(parseStage("lost")).toBe("LOST");
  });

  it("rejects nonsense instead of guessing", () => {
    expect(parseStage("Banana")).toBeNull();
    expect(parseStage(undefined)).toBeNull();
  });

  it("maps loose source labels onto the enum", () => {
    expect(parseSource("TeleCRM")).toBe("TELECRM");
    expect(parseSource("Facebook")).toBe("META_LEAD_ADS");
    expect(parseSource("JustDial")).toBe("JUSTDIAL");
    expect(parseSource("csv upload")).toBe("IMPORTED");
    expect(parseSource("Referral")).toBe("REFERRAL");
  });

  it("returns null for an unknown source so the caller can report it", () => {
    expect(parseSource("carrier pigeon")).toBeNull();
  });
});

describe("parseRow", () => {
  const mapping = {
    "Full Name": "name",
    "E-mail Address": "email",
    "Mobile Number": "phone",
    "Company Name": "company",
    City: "city",
    Notes: "notes",
    Status: "stage",
    Channel: "source",
    Score: "score",
    "Sales Rep": "owner",
  };

  it("parses a normal TeleCRM-shaped row", () => {
    const r = parseRow(
      {
        "Full Name": "Robin Stone",
        "E-mail Address": "Robin@Example.com",
        "Mobile Number": "99999 88888",
        "Company Name": "Acme",
        City: "Delhi",
        Status: "Contacted",
        Channel: "TeleCRM",
        Score: "80",
        "Sales Rep": "Ash",
      },
      mapping
    );
    expect(r.name).toBe("Robin Stone");
    expect(r.emailNorm).toBe("robin@example.com");
    expect(r.phoneKeys).toEqual(phoneKeys("99999 88888"));
    expect(r.company).toBe("Acme");
    expect(r.stage).toBe("CONTACTED");
    expect(r.source).toBe("TELECRM");
    expect(r.score).toBe(80);
    expect(r.ownerName).toBe("Ash");
    expect(r.problems).toEqual([]);
  });

  it("keeps the city in the notes without losing it", () => {
    const r = parseRow({ "Full Name": "A B", "Mobile Number": "9999988888", City: "Pune" }, mapping);
    expect(r.notes).toContain("Pune");
  });

  it("flags a row with nothing to dedupe on, instead of silently importing it", () => {
    const r = parseRow({ "Company Name": "Some Co" }, mapping);
    expect(r.problems.some((p) => p.includes("cannot dedupe"))).toBe(true);
  });

  it("clamps an out-of-range score rather than storing nonsense", () => {
    expect(parseRow({ "Full Name": "A B", "Mobile Number": "9999988888", Score: "9999" }, mapping).score).toBe(100);
    expect(parseRow({ "Full Name": "A B", "Mobile Number": "9999988888", Score: "-5" }, mapping).score).toBe(0);
  });

  it("reports an unrecognised source and stage rather than guessing", () => {
    const r = parseRow(
      { "Full Name": "A B", "Mobile Number": "9999988888", Status: "Banana", Channel: "pigeon" },
      mapping
    );
    expect(r.problems.some((p) => p.includes("not recognised"))).toBe(true);
  });

  it("falls back to email then phone when there is no name", () => {
    expect(parseRow({ "E-mail Address": "a@b.com" }, mapping).name).toBe("a@b.com");
    expect(parseRow({ "Mobile Number": "9999988888" }, mapping).name).toBe("9999988888");
  });

  it("rejects a bogus created date", () => {
    const withDate = { ...mapping, "Date": "createdAt" };
    expect(parseRow({ "Full Name": "A B", "Mobile Number": "9999988888", Date: "banana" }, withDate).createdAt).toBeNull();
    expect(parseRow({ "Full Name": "A B", "Mobile Number": "9999988888", Date: "2024-03-05" }, withDate).createdAt)
      .toEqual(new Date("2024-03-05"));
  });
});

describe("identityKeys", () => {
  it("returns the email and every phone spelling", () => {
    expect(identityKeys("a@b.com", ["919999988888", "9999988888"])).toEqual([
      "e:a@b.com",
      "p:919999988888",
      "p:9999988888",
    ]);
  });

  it("covers email-only and phone-only rows", () => {
    expect(identityKeys("a@b.com", [])).toEqual(["e:a@b.com"]);
    expect(identityKeys(null, ["919999988888"])).toEqual(["p:919999988888"]);
  });

  it("is empty when there is nothing to key on", () => {
    expect(identityKeys(null, [])).toEqual([]);
  });

  it("makes an email row and a phone-only row for one person intersect", () => {
    // Regression: keying on email when present and phone otherwise let the
    // same person be created twice from a single file.
    const withEmail = identityKeys("a@b.com", ["919999988888"]);
    const phoneOnly = identityKeys(null, ["919999988888", "9999988888"]);
    expect(withEmail.some((k) => phoneOnly.includes(k))).toBe(true);
  });
});
