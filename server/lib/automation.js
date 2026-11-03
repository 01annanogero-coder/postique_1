export function scoreFaq(text, faq) {
  const normalized = String(text || '').toLowerCase()
  let score = 0
  for (const trigger of faq.triggers || []) {
    if (trigger && normalized.includes(trigger.toLowerCase())) {
      score += trigger.includes(' ') ? 3 : 2
    }
  }
  return score
}

export function analyseFaqs(faqs, message, settings) {
  const scored = faqs
    .map((faq) => ({ faq, score: scoreFaq(message, faq) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
  const top = scored[0]
  const confidence = top ? Math.min(98, 78 + top.score * 3) : 0
  const matches = top
    ? scored
        .filter((item, index) => index === 0 || (settings.combine && item.score >= Math.max(4, top.score - 6)))
        .slice(0, 3)
    : []
  const threshold = Number(settings.confidence) || 92
  const review = !top || confidence < threshold
  return {
    matches,
    confidence,
    review,
    reply: matches.map((match) => match.faq.answer).join('\n\n'),
    reason: !top
      ? 'No approved response matched this message.'
      : review
        ? `Confidence ${confidence}% is below the ${threshold}% threshold.`
        : settings.autoSend
          ? 'Ready to send automatically.'
          : 'Matched, but auto-send is off.',
  }
}
