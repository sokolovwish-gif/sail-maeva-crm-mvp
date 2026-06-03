import { describe, expect, it } from "vitest";
import { classifyMessage } from "../src/logic/classifier.js";

describe("classifyMessage", () => {
  it("detects hot booking intent", () => {
    const result = classifyMessage("Хочу забронировать место, куда платить предоплату?");

    expect(result.intent).toBe("hot_lead");
    expect(result.isHot).toBe(true);
    expect(result.status).toBe("Горячий лид");
    expect(result.shouldNotifyAssistant).toBe(true);
  });

  it("detects price questions", () => {
    const result = classifyMessage("Сколько стоит Турция в августе?");

    expect(result.intent).toBe("price");
    expect(result.destination).toBe("Турция");
    expect(result.tags).toContain("турция");
    expect(result.tags).toContain("август");
  });

  it("detects solo concern", () => {
    const result = classifyMessage("Можно одной, если я без подруги?");

    expect(result.intent).toBe("solo");
    expect(result.fear).toBe("одна");
    expect(result.tags).toContain("боится одной");
  });

  it("routes unclear messages to assistant", () => {
    const result = classifyMessage("А как вообще лучше сделать?");

    expect(result.intent).toBe("unknown");
    expect(result.assignedTo).toBe("ассистент");
    expect(result.shouldNotifyAssistant).toBe(true);
  });
});
