import { tags } from "../config/tags.js";
import { hotLeadKeywords } from "./hotLeadRules.js";
import type { ScriptIntent } from "../config/scripts.js";

export type Classification = {
  intent: ScriptIntent;
  isHot: boolean;
  fear?: string;
  destination?: string;
  tags: string[];
  confidence: number;
  status?: string;
  assignedTo?: "бот" | "ассистент" | "Маша";
  shouldNotifyAssistant: boolean;
  shouldCreateAssistantTask: boolean;
};

type Rule = {
  intent: ScriptIntent;
  keywords: string[];
  tag?: string;
  fear?: string;
  destination?: string;
  status?: string;
  assignedTo?: "бот" | "ассистент" | "Маша";
  notify?: boolean;
  task?: boolean;
};

const rules: Rule[] = [
  {
    intent: "hot_lead",
    keywords: hotLeadKeywords,
    tag: tags.hot,
    status: "Горячий лид",
    assignedTo: "ассистент",
    notify: true,
    task: true
  },
  {
    intent: "price",
    keywords: ["цена", "стоимость", "сколько стоит", "тариф", "дорого", "бюджет", "оплата"],
    tag: tags.paymentQuestion,
    fear: "дорого",
    status: "Бот ответил"
  },
  {
    intent: "details",
    keywords: ["подробности", "расскажите", "расскажи", "что за экспедиция", "что входит", "программа", "маршрут"],
    status: "Выясняем запрос"
  },
  {
    intent: "solo",
    keywords: ["одна", "одной", "соло", "без подруги", "одна еду", "незнакомые люди", "кто будет"],
    tag: tags.fearSolo,
    fear: "одна"
  },
  {
    intent: "life_on_board",
    keywords: ["каюта", "душ", "туалет", "санузел", "где спим", "кровать", "жить на яхте", "быт"],
    tag: tags.lifeOnBoard,
    fear: "быт"
  },
  {
    intent: "seasick",
    keywords: ["укачивает", "морская болезнь", "тошнит", "плохо на воде", "волны"],
    tag: tags.seasick,
    fear: "укачивает"
  },
  {
    intent: "safety",
    keywords: ["безопасно", "страшно", "опасно", "пираты", "шторм", "боюсь"],
    tag: tags.safety,
    fear: "безопасность"
  },
  {
    intent: "contract",
    keywords: ["договор", "расписка", "чек", "подтверждение", "документы", "гарантия"],
    tag: tags.needsContract,
    fear: "договор",
    status: "Передан ассистенту",
    assignedTo: "ассистент",
    notify: true,
    task: true
  }
];

export function classifyMessage(text: string): Classification {
  const normalized = normalize(text);
  const detectedTags = detectContextTags(normalized);
  const rule = rules.find((item) => item.keywords.some((keyword) => normalized.includes(normalize(keyword))));

  if (!rule) {
    return {
      intent: "unknown",
      isHot: false,
      tags: detectedTags,
      confidence: 0.35,
      status: "Передан ассистенту",
      assignedTo: "ассистент",
      shouldNotifyAssistant: true,
      shouldCreateAssistantTask: false,
      destination: detectDestination(normalized)
    };
  }

  const tags = [...detectedTags, rule.tag].filter((tag): tag is string => Boolean(tag));
  return {
    intent: rule.intent,
    isHot: rule.intent === "hot_lead",
    fear: rule.fear,
    destination: rule.destination ?? detectDestination(normalized),
    tags: [...new Set(tags)],
    confidence: rule.intent === "hot_lead" ? 0.95 : 0.8,
    status: rule.status,
    assignedTo: rule.assignedTo,
    shouldNotifyAssistant: Boolean(rule.notify),
    shouldCreateAssistantTask: Boolean(rule.task)
  };
}

function detectContextTags(normalized: string): string[] {
  const result: string[] = [];
  if (normalized.includes("турц")) result.push(tags.turkey);
  if (normalized.includes("тай") || normalized.includes("таиланд")) result.push(tags.thailand);
  if (normalized.includes("женск")) result.push(tags.women);
  if (normalized.includes("смешан")) result.push(tags.mixed);
  if (normalized.includes("август")) result.push(tags.august);
  if (normalized.includes("июнь")) result.push(tags.june);
  if (normalized.includes("с муж") || normalized.includes("с подруг") || normalized.includes("парой")) result.push(tags.withSomeone);
  if (normalized.includes("одна") || normalized.includes("одной")) result.push(tags.solo);
  return result;
}

function detectDestination(normalized: string): string | undefined {
  if (normalized.includes("турц")) return "Турция";
  if (normalized.includes("тай") || normalized.includes("таиланд")) return "Таиланд";
  return undefined;
}

function normalize(text: string): string {
  return text.toLocaleLowerCase("ru-RU").replaceAll("ё", "е").trim();
}
