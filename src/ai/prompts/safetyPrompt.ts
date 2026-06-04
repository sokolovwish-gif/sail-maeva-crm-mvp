export const safetyPrompt = `
Before sending any client-facing text, check that it has no payment details, requisites,
legal promises, invented prices, invented dates, guaranteed availability, forbidden phrases
or overly long impersonal text.
If the text is unsafe, downgrade to draft_for_assistant or hold_for_human.
`.trim();

