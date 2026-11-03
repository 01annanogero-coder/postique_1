import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Clock3,
  Info,
  LockKeyhole,
  MessageSquare,
  Pencil,
  Play,
  Plus,
  ScanSearch,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserCheck,
  Wand2,
  X,
} from 'lucide-react'
import { Badge, Button, Field, Modal, Toggle } from '../components/ui'
import { cx, scoreFaq } from '../lib/utils'
import { useStore } from '../store/StoreContext'
import { PageHeader, SectionCard } from './shared'

const sampleMessages = [
  'How long does delivery take, and can I pay using M-Pesa?',
  'My order arrived damaged. I would like a refund.',
  'Do you have a physical store I can visit this weekend?',
]

function RuleRow({ icon, title, description, control }) {
  return (
    <div className="rule-row">
      <span className="rule-row__icon">{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <div className="rule-row__control">{control}</div>
    </div>
  )
}

function FaqModal({ open, onClose, initial, onSave }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [answer, setAnswer] = useState(initial?.answer || '')
  const [triggers, setTriggers] = useState(initial?.triggers?.join(', ') || '')

  useEffect(() => {
    setTitle(initial?.title || '')
    setAnswer(initial?.answer || '')
    setTriggers(initial?.triggers?.join(', ') || '')
  }, [initial, open])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit approved response' : 'Add approved response'}
      eyebrow="FAQ library"
      description="Only answers you write and approve can be selected here."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!title.trim() || !answer.trim()) return
              onSave({
                title: title.trim(),
                answer: answer.trim(),
                triggers: triggers
                  .split(',')
                  .map((item) => item.trim().toLowerCase())
                  .filter(Boolean),
              })
            }}
            icon={<Check size={14} />}
          >
            Save response
          </Button>
        </>
      }
    >
      <div className="faq-form">
        <Field label="Topic name" hint="A short label used in the automation dashboard.">
          <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Delivery information" />
        </Field>
        <Field
          label="Approved response"
          hint="This exact wording can be sent to a customer. Do not include variables you have not defined."
        >
          <textarea
            className="textarea"
            rows={5}
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Write the response a customer should receive…"
          />
        </Field>
        <Field
          label="Matching phrases"
          hint="Comma-separated phrases that should trigger this answer. The classifier is not limited to exact matches."
        >
          <input
            className="input"
            value={triggers}
            onChange={(event) => setTriggers(event.target.value)}
            placeholder="delivery, shipping, how long"
          />
        </Field>
      </div>
    </Modal>
  )
}

function buildAnalysis(message, faqs, automation) {
  const scored = faqs
    .map((faq) => ({ faq, score: scoreFaq(message, faq) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
  const top = scored[0]
  const confidence = top ? Math.min(98, 78 + top.score * 3) : 0
  const matches = top
    ? scored
        .filter((item, index) => index === 0 || (automation.combine && item.score >= Math.max(4, top.score - 6)))
        .slice(0, 3)
    : []
  const belowThreshold = !top || confidence < automation.confidence
  const reply = matches.map((match) => match.faq.answer).join('\n\n')
  return {
    matches,
    confidence,
    review: belowThreshold,
    reply,
    reason: !top
      ? 'No approved response matched this message.'
      : belowThreshold
        ? `Confidence ${confidence}% is below your ${automation.confidence}% threshold.`
        : automation.autoSend
          ? 'Ready to send automatically.'
          : 'Matched, but auto-send is off. This would wait for approval.',
  }
}

export default function Automations() {
  const { faqs, automation, updateAutomation, addFaq, updateFaq, deleteFaq, toast } = useStore()
  const [faqOpen, setFaqOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [message, setMessage] = useState(sampleMessages[0])
  const [analysis, setAnalysis] = useState(() => buildAnalysis(sampleMessages[0], faqs, automation))
  const [analyzing, setAnalyzing] = useState(false)

  const stats = [
    { label: 'Approved responses', value: faqs.length, note: 'in your library' },
    { label: 'Automation state', value: automation.enabled ? 'On' : 'Paused', note: automation.enabled ? 'preview mode' : 'no matching runs' },
    { label: 'Auto-send', value: automation.autoSend ? 'On' : 'Off', note: 'requires explicit opt-in' },
    { label: 'Human review', value: automation.humanReview ? 'On' : 'Off', note: 'below confidence threshold' },
  ]

  const analyze = () => {
    if (!message.trim()) {
      toast('Add an incoming message first', 'error')
      return
    }
    setAnalyzing(true)
    setAnalysis(null)
    setTimeout(() => {
      setAnalysis(buildAnalysis(message, faqs, automation))
      setAnalyzing(false)
    }, 950)
  }

  const simulateDecision = () => {
    if (!analysis) return
    if (analysis.review) {
      toast('Held for human review', 'success', analysis.reason)
    } else if (!automation.autoSend) {
      toast('Ready for approval', 'success', 'Auto-send is off · nothing has been sent')
    } else {
      toast('Approved response queued', 'success', 'The worker will send it inside the existing thread')
    }
  }

  const openEdit = (faq) => {
    setEditing(faq)
    setFaqOpen(true)
  }

  const closeFaq = () => {
    setFaqOpen(false)
    setEditing(null)
  }

  const saveFaq = async (data) => {
    if (editing) {
      await updateFaq(editing.id, data)
    } else {
      await addFaq(data)
    }
    closeFaq()
  }

  return (
    <div className="page page--automations">
      <PageHeader
        eyebrow="Local rules · no external model"
        title="Approved FAQ automation"
        description="Match intent locally, then choose from responses you wrote. Postique never invents customer-facing copy."
        actions={
          <>
            <Button variant="secondary" onClick={() => document.getElementById('automation-lab')?.scrollIntoView({ behavior: 'smooth' })} icon={<ScanSearch size={15} />}>
              Test a message
            </Button>
            <Button
              onClick={() => {
                setEditing(null)
                setFaqOpen(true)
              }}
              icon={<Plus size={15} />}
            >
              Add response
            </Button>
          </>
        }
      />

      <div className="preview-banner">
        <span className="preview-banner__icon">
          <Sparkles size={14} />
        </span>
        <div>
          <strong>Deterministic matching, on your server.</strong>
          <p>
            The matcher uses transparent phrase scoring against this workspace’s approved library. When
            auto-send is enabled, the worker sends only the exact approved answers; otherwise the reply stays
            in the inbox for a person.
          </p>
        </div>
        <Badge tone="purple">Local rules</Badge>
      </div>

      <div className="automation-stats">
        {stats.map((stat) => (
          <div className="automation-stat" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.note}</small>
          </div>
        ))}
      </div>

      <div className="automation-grid">
        <div className="automation-left">
          <SectionCard
            title="Automation rules"
            description="The boundaries are explicit. Change them any time."
            action={<Badge tone={automation.enabled ? 'success' : 'neutral'} dot>{automation.enabled ? 'Preview enabled' : 'Paused'}</Badge>}
          >
            <div className="rules-list">
              <RuleRow
                icon={<Bot size={15} />}
                title="Enable automation"
                description="When paused, every incoming message waits in the inbox."
                control={
                  <Toggle
                    checked={automation.enabled}
                    onChange={(value) => updateAutomation({ enabled: value })}
                    label="Enable automation"
                  />
                }
              />
              <RuleRow
                icon={<Send size={15} />}
                title="Auto-send approved responses"
                description="Off by default. When on, matched answers send without review."
                control={
                  <Toggle
                    checked={automation.autoSend}
                    onChange={(value) => updateAutomation({ autoSend: value })}
                    label="Auto-send approved responses"
                  />
                }
              />
              <RuleRow
                icon={<UserCheck size={15} />}
                title="Hold low-confidence messages"
                description="If the best match is below the threshold, leave it for a person."
                control={
                  <Toggle
                    checked={automation.humanReview}
                    onChange={(value) => updateAutomation({ humanReview: value })}
                    label="Human review for low confidence"
                  />
                }
              />
              <RuleRow
                icon={<Wand2 size={15} />}
                title="Combine multiple answers"
                description="When a customer asks two approved questions, send one composed reply."
                control={
                  <Toggle
                    checked={automation.combine}
                    onChange={(value) => updateAutomation({ combine: value })}
                    label="Combine multiple approved answers"
                  />
                }
              />
              <div className="confidence-rule">
                <div className="confidence-rule__head">
                  <span>
                    <SlidersHorizontal size={14} /> Match confidence threshold
                  </span>
                  <strong>{automation.confidence}%</strong>
                </div>
                <input
                  type="range"
                  min="70"
                  max="99"
                  value={automation.confidence}
                  onChange={(event) => updateAutomation({ confidence: Number(event.target.value) })}
                />
                <div className="confidence-rule__foot">
                  <span>More human review</span>
                  <span>More automation</span>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Approved response library"
            description="Only the exact answers in this library can ever reach a customer."
            action={<span className="section-count">{faqs.length} answers</span>}
            bodyClassName="section-card__body--flush"
          >
            <div className="faq-library">
              {faqs.map((faq) => (
                <div className="faq-library__item" key={faq.id}>
                  <span className="faq-library__icon">
                    <MessageSquare size={14} />
                  </span>
                  <div className="faq-library__main">
                    <div className="faq-library__top">
                      <strong>{faq.title}</strong>
                      <Badge tone="success">Approved</Badge>
                    </div>
                    <p>{faq.answer}</p>
                    <div className="faq-library__tags">
                      {faq.triggers.slice(0, 4).map((trigger) => (
                        <span key={trigger}>{trigger}</span>
                      ))}
                      <span className="faq-library__usage">
                        <Clock3 size={10} /> {faq.usage} uses
                      </span>
                    </div>
                  </div>
                  <div className="faq-library__actions">
                    <button onClick={() => openEdit(faq)} aria-label={`Edit ${faq.title}`}>
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => {
                        deleteFaq(faq.id)
                      }}
                      aria-label={`Delete ${faq.title}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              className="faq-library__add"
              onClick={() => {
                setEditing(null)
                setFaqOpen(true)
              }}
            >
              <Plus size={14} /> Add an approved response
            </button>
          </SectionCard>
        </div>

        <aside className="automation-right" id="automation-lab">
          <div className="lab-card">
            <div className="lab-card__head">
              <div>
                <span className="lab-card__eyebrow">TEST LAB</span>
                <h2>Incoming message</h2>
              </div>
              <Badge tone="dark">Simulation</Badge>
            </div>
            <div className="lab-samples">
              {sampleMessages.map((sample, index) => (
                <button
                  key={sample}
                  className={cx(message === sample && 'is-active')}
                  onClick={() => {
                    setMessage(sample)
                    setAnalysis(null)
                  }}
                >
                  Example {index + 1}
                </button>
              ))}
            </div>
            <textarea
              value={message}
              onChange={(event) => {
                setMessage(event.target.value)
                setAnalysis(null)
              }}
              rows={4}
              placeholder="Paste a customer email…"
              aria-label="Incoming message"
            />
            <div className="lab-card__actions">
              <span>
                <LockKeyhole size={11} /> Uses your approved library
              </span>
              <Button size="sm" onClick={analyze} loading={analyzing} icon={!analyzing && <Play size={13} />}>
                {analyzing ? 'Classifying…' : 'Analyze message'}
              </Button>
            </div>

            {analysis ? (
              <div className="lab-results">
                <div className={cx('lab-verdict', analysis.review ? 'is-review' : 'is-match')}>
                  <span>
                    {analysis.review ? <AlertTriangle size={15} /> : <Check size={15} />}
                  </span>
                  <div>
                    <strong>{analysis.review ? 'Hold for human review' : 'Intent matched'}</strong>
                    <p>{analysis.reason}</p>
                  </div>
                  {analysis.confidence > 0 && <span className="lab-confidence">{analysis.confidence}%</span>}
                </div>

                {analysis.matches.length > 0 && (
                  <div className="lab-matches">
                    <span className="lab-matches__label">SELECTED APPROVED RESPONSES</span>
                    {analysis.matches.map((match) => (
                      <div key={match.faq.id} className="lab-match">
                        <span className="lab-match__check">
                          <Check size={9} />
                        </span>
                        <div>
                          <strong>{match.faq.title}</strong>
                          <p>{match.faq.answer}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {analysis.reply && (
                  <div className="lab-composed">
                    <span>COMPOSED REPLY</span>
                    <p>{analysis.reply}</p>
                    <div>
                      <span>
                        <ShieldCheck size={10} /> Exact approved wording
                      </span>
                      <span>{analysis.review ? 'Not sent' : automation.autoSend ? 'Auto-send armed' : 'Held for approval'}</span>
                    </div>
                  </div>
                )}

                <Button
                  variant={analysis.review ? 'secondary' : 'primary'}
                  size="sm"
                  block
                  onClick={simulateDecision}
                  icon={analysis.review ? <UserCheck size={13} /> : <Send size={13} />}
                >
                  {analysis.review ? 'Send to human review' : automation.autoSend ? 'Simulate approved send' : 'Simulate approval'}
                </Button>
                <span className="lab-disclaimer">The test lab does not send email. Auto-send applies to live inbound messages.</span>
              </div>
            ) : (
              <div className="lab-empty">
                <span>
                  <ScanSearch size={22} />
                </span>
                <strong>Analysis output appears here</strong>
                <p>Run a message through the library to see the matched intents, confidence and composed response.</p>
                {!automation.enabled && (
                  <div className="lab-paused">
                    <Info size={12} /> Automation is paused. Turn it on to simulate a live decision.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="lab-note">
            <ShieldCheck size={16} />
            <div>
              <strong>Postique never writes the reply</strong>
              <p>
                Matching selects from your approved library. If no answer fits, the message stays with a human.
              </p>
            </div>
          </div>
        </aside>
      </div>

      <FaqModal open={faqOpen} onClose={closeFaq} initial={editing} onSave={saveFaq} />
    </div>
  )
}
