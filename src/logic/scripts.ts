export function buildAssistantNotification(input: {
  firstName: string;
  username: string;
  lastMessage: string;
  detectedInterest: string;
  detectedFear: string;
  leadUrl: string;
}): string {
  return `🔥 Горячий лид Sail Maeva

Имя: ${input.firstName || "не указано"}
Username: ${input.username ? `@${input.username}` : "не указан"}
Сообщение: ${input.lastMessage}
Интерес: ${input.detectedInterest}
Страх/вопрос: ${input.detectedFear}
Сделка в amoCRM: ${input.leadUrl}

Нужно ответить вручную.`;
}
