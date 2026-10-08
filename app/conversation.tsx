'use client';

import { useEffect, useRef, useState } from 'react';
import { SERVICE_CHOICES, type Choice, type ConversationResult } from './lib/conversation-schema';
import { optimizePhotoSelection } from './lib/photo-optimizer';
import styles from './conversation.module.css';
import BookingFollowUp from './booking-follow-up';

type Photo = { file: File; room: string; url: string; hash: string };
type Message = { role: 'user' | 'winston'; text: string; photos?: number; room?: string };
const opening = 'Hi, I\u2019m Winston! I\u2019m excited to help you make some space. What can our Wade Home Services team take off your hands today?';

export default function Conversation() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState(''); const [services, setServices] = useState<string[]>([]);
  const [room, setRoom] = useState(''); const [photos, setPhotos] = useState<Photo[]>([]);
  const [result, setResult] = useState<ConversationResult | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [answers, setAnswers] = useState<Record<string, { text: string; notSure: boolean }>>({});
  const [replyTo, setReplyTo] = useState('');
  const [busy, setBusy] = useState(false); const [optimizing, setOptimizing] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(''); const [error, setError] = useState('');
  const [failedPhotos, setFailedPhotos] = useState<File[]>([]);
  const token = useRef(''); const sentPhotos = useRef(0); const photoRef = useRef<Photo[]>([]);
  const generation = useRef(0); const locked = useRef(false); const photoLock = useRef(false);
  const controller = useRef<AbortController | null>(null); const retry = useRef<FormData | null>(null);
  const log = useRef<HTMLDivElement>(null); const composer = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'instant' }); }, [messages, result, busy]);
  useEffect(() => () => { generation.current++; controller.current?.abort(); photoRef.current.forEach((p) => URL.revokeObjectURL(p.url)); }, []);

  function startOver() {
    generation.current++; controller.current?.abort(); locked.current = false; photoLock.current = false;
    photoRef.current.forEach((p) => URL.revokeObjectURL(p.url)); photoRef.current = [];
    token.current = ''; sentPhotos.current = 0; retry.current = null;
    setMessages([]); setText(''); setServices([]); setRoom(''); setPhotos([]); setResult(null);
    setChoices({}); setAnswers({}); setReplyTo(''); setBusy(false); setOptimizing(false); setUploadStatus(''); setFailedPhotos([]); setError('');
    composer.current?.focus();
  }
  async function addPhotos(files: File[]) {
    if (!files.length || locked.current || photoLock.current) return;
    if (photoRef.current.length + files.length > 10) { setUploadStatus('This estimate supports ten photos total. Start a separate estimate for more photos.'); return; }
    photoLock.current = true; setOptimizing(true); setFailedPhotos([]); setUploadStatus(`Preparing ${files.length} photo${files.length === 1 ? '' : 's'}...`);
    const run = generation.current, batchRoom = room.trim() || 'General';
    try {
    const optimized = await optimizePhotoSelection(files, undefined, 10);
    if (run !== generation.current) return;
    if (optimized.ok === false) { setFailedPhotos(files); setUploadStatus(optimized.error); }
    else {
      const added: Photo[] = []; const hashes = new Set(photoRef.current.map((p) => p.hash));
      for (const photo of optimized.photos) {
        const digest = await crypto.subtle.digest('SHA-256', await photo.file.arrayBuffer());
        const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
        if (run !== generation.current) { added.forEach((p) => URL.revokeObjectURL(p.url)); return; }
        if (!hashes.has(hash)) { hashes.add(hash); added.push({ file: photo.file, room: batchRoom, hash, url: URL.createObjectURL(photo.file) }); }
      }
      photoRef.current = [...photoRef.current, ...added]; setPhotos(photoRef.current);
      setUploadStatus(`${photoRef.current.length}/10 photos ready. ${added.length < files.length ? 'Exact duplicate photos were kept once.' : 'Photos stay in this conversation.'}`);
    }
    } catch { if (run === generation.current) { setFailedPhotos(files); setUploadStatus('These photos could not be prepared. Retry or choose another image.'); } }
    finally { if (run === generation.current) { photoLock.current = false; setOptimizing(false); } }
  }
  async function transmit(form: FormData) {
    if (locked.current || photoLock.current) return;
    locked.current = true; setBusy(true); setError(''); retry.current = form;
    setResult((old) => old ? { ...old, baseline: null } : null);
    const run = generation.current; const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 60_000);
    try {
      const response = await fetch('/api/conversation', { method: 'POST', body: form, signal: abort.signal });
      const data = await response.json() as ConversationResult;
      if (run !== generation.current) return;
      if (!response.ok || data.error || !data.token || !Array.isArray(data.items) || !Array.isArray(data.questions)) throw new Error(data.error || 'Unable to finish this turn. Your entries are retained.');
      token.current = data.token; sentPhotos.current = photoRef.current.length; retry.current = null;
      setResult(data); setChoices({}); setAnswers({}); setReplyTo(data.questions[0]?.id ?? '');
      setMessages((old) => [...old, { role: 'winston', text: data.message }]);
    } catch (error) {
      if (run === generation.current) setError(error instanceof Error && error.name !== 'AbortError' ? error.message : 'The request timed out. Your conversation and photos are retained. Retry when ready.');
    } finally { clearTimeout(timeout); if (run === generation.current) { locked.current = false; setBusy(false); } }
  }
  function send(mode: 'message' | 'scope' | 'answers' | 'service' = 'message', service?: readonly [string, string]) {
    if (locked.current || photoLock.current) return;
    if (mode === 'service' && (!service || services.includes(service[0]))) return;
    const selectedServices = service ? [...services, service[0]] : services;
    const message = service ? `I'd like help with ${service[1]}.` : mode === 'message' ? text.trim() : mode === 'scope' ? 'Please use my confirmed scope choices.' : 'Here are my answers.';
    if (!message && photos.length === sentPhotos.current) return;
    const form = new FormData(); if (token.current) form.set('token', token.current);
    form.set('submission', JSON.stringify({ message, room: room.trim(), services: selectedServices, photoRooms: photos.map((p) => p.room),
      actions: mode === 'scope' ? Object.entries(choices).map(([id, choice]) => ({ id, choice })) : [],
      answers: mode === 'answers' ? (result?.questions ?? []).map((q) => ({ id: q.id, text: answers[q.id]?.text ?? '', notSure: answers[q.id]?.notSure ?? false }))
        : mode === 'message' && replyTo && message ? [{ id: replyTo, text: message, notSure: /^(?:not sure|i don'?t know|unknown)[.!]?$/i.test(message) }] : [] }));
    for (const photo of photos) form.append('photos', photo.file);
    setMessages((old) => [...old, { role: 'user', text: message || 'Here are the photos.', photos: photos.length - sentPhotos.current, room: room.trim() || 'General' }]);
    if (mode === 'message') setText('');
    if (service) setServices(selectedServices);
    void transmit(form);
  }
  const pending = result?.items.filter((item) => item.choice === 'unresolved') ?? [];
  const completed = !busy && !error && !pending.length && !result?.questions.length && !!result?.baseline;
  const load = result?.baseline;
  const loadSummary = load?.range
    ? `Model-estimated ${load.range[0]}-${load.range[1]}% · ${Number((load.range[0] / 100 * 12).toFixed(4))}-${Number((load.range[1] / 100 * 12).toFixed(4))} cubic yards · ${load.range[0] / 100}-${load.range[1] / 100} trailer equivalents`
    : load ? `Model-estimated ${load.percent}% · ${load.cubicYards} cubic yards · ${load.equivalents} trailer equivalents` : '';
  function scopeEditor() {
    return <fieldset disabled={busy || optimizing} className={styles.scope}>
      {result?.items.map((item) => <div className={styles.scopeItem} key={item.id}>
        <label htmlFor={`scope-${item.id}`}>{item.choice === 'unresolved' ? `I see ${item.label}. Should we include it?` : item.label}<small>{item.room || 'General'} · Photo {item.photoRefs.join(', ')}</small></label>
        <select id={`scope-${item.id}`} value={choices[item.id] ?? item.choice} onChange={(e) => setChoices((old) => ({ ...old, [item.id]: e.target.value as Choice }))}>
          <option value="unresolved">Not sure yet</option><option value="included">Include</option><option value="excluded">Leave behind</option>
        </select>
      </div>)}
      <button type="button" disabled={!Object.keys(choices).length} onClick={() => send('scope')}>Confirm scope</button>
    </fieldset>;
  }
  return <main className={styles.shell}>
    <header className={styles.header}><a href="/" onClick={(e) => { e.preventDefault(); startOver(); }} aria-label="Wade Home Services - start over"><img src="/winston-logo.png" alt="Winston" width="46" height="46" /><span>Wade Home Services<small>Removal estimates with Winston</small></span></a><button type="button" onClick={startOver}>Start Over</button></header>
    <div className={styles.pilot}>Protected Preview · Provisional estimates, reviewed by your team</div>
    <div ref={log} className={styles.log} role="log" aria-label="Conversation with Winston" aria-live="polite" aria-relevant="additions">
      <section className={styles.welcome}><img src="/winston-logo.png" width="116" height="116" alt="Winston, your removal guide" /><p className={styles.eyebrow}>A little less clutter. A little more room.</p><h1>Let&apos;s make some space.</h1><p>{opening}</p></section>
      <div className={styles.services} aria-label="Services">{SERVICE_CHOICES.map(([value, label]) => <button type="button" key={value} aria-pressed={services.includes(value)} disabled={busy || optimizing || services.includes(value)} onClick={() => send('service', [value, label])}>{label}</button>)}</div>
      {messages.map((message, i) => <article key={i} className={message.role === 'user' ? styles.user : styles.winston}>
        <small>{message.role === 'user' ? 'You' : 'Winston'}</small><p>{message.text}</p>
        {!!message.photos && <small>{message.photos} photo{message.photos === 1 ? '' : 's'} · {message.room}</small>}
      </article>)}
      {busy && <p className={styles.busy} role="status">Thanks! I&apos;m reviewing your photos and scope. We&apos;re working on your estimate<span aria-hidden="true">...</span></p>}
      {!busy && result && <section className={styles.result} aria-label="Current scope and estimate">
        {completed && result.baseline && <div className={styles.baseline}><small>PROVISIONAL VOLUME BASELINE</small><h2>{result.baseline.display}</h2><p>{loadSummary}</p><p>No location minimum or access charge applied. Not a final quote.</p></div>}
        {pending.length > 0 ? scopeEditor() : result.items.length > 0 && <details><summary>Confirmed scope · {result.items.filter((i) => i.choice === 'included').length} included groups</summary>{scopeEditor()}</details>}
        {result.questions.length > 0 && <form onSubmit={(e) => { e.preventDefault(); send('answers'); }}><fieldset disabled={busy || optimizing}>
          {result.questions.map((q) => <div className={styles.question} key={q.id}><label htmlFor={q.id}>{q.text}</label><small>Photo {q.photoRef}: {q.evidence}</small>
            <input id={q.id} maxLength={400} required={!answers[q.id]?.notSure} disabled={answers[q.id]?.notSure} value={answers[q.id]?.text ?? ''} onChange={(e) => setAnswers((old) => ({ ...old, [q.id]: { text: e.target.value, notSure: old[q.id]?.notSure ?? false } }))} />
            <label className={styles.unknown}><input type="checkbox" checked={answers[q.id]?.notSure ?? false} onChange={(e) => setAnswers((old) => ({ ...old, [q.id]: { text: old[q.id]?.text ?? '', notSure: e.target.checked } }))} />Not sure</label>
          </div>)}<button type="submit">Send answers</button></fieldset></form>}
        {!!result.reasons.length && <details open={!result.baseline}><summary>Review status &amp; next steps</summary><ul>{result.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul></details>}
        {completed && !!result.assumptions.length && <details><summary>Assumptions &amp; volume calculation</summary><ul>{result.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul><p>Loaded percentage / 100 × $550. A supported volume interval uses both endpoints. This is not a statistical prediction interval.</p></details>}
        {completed && <BookingFollowUp key={result.token} token={result.token} scope={result.items.filter((i) => i.choice === 'included').map((i) => i.label)} onMessage={(role, text) => setMessages((old) => [...old, { role, text }])} />}
      </section>}
      {error && <div role="alert" className={styles.error}><p>{error}</p><button type="button" disabled={busy || optimizing} onClick={() => retry.current && void transmit(retry.current)}>Retry last message</button></div>}
    </div>
    <footer className={styles.composer}>
      {!!photos.length && <details><summary>{photos.length}/10 photos in this conversation</summary><div className={styles.photos}>{photos.map((p, i) => <figure key={p.hash}><img src={p.url} alt={`Photo ${i + 1}, ${p.room}`} width="68" height="68" /><figcaption>{i + 1} · {p.room}</figcaption></figure>)}</div></details>}
      {replyTo && <div className={styles.reply}><span>Replying to: {result?.questions.find((q) => q.id === replyTo)?.text}</span><button type="button" disabled={busy} onClick={() => setReplyTo('')}>New topic</button></div>}
      <form onSubmit={(e) => { e.preventDefault(); send(); }}><label className={styles.srOnly} htmlFor="message">Message Winston</label><textarea ref={composer} id="message" maxLength={replyTo ? 400 : 1000} disabled={busy} placeholder={replyTo ? 'Your answer, or "Not sure"...' : 'Tell Winston what needs to go...'} value={text} onChange={(e) => setText(e.target.value)} />
        <div className={styles.tools}><label className={styles.attach} title="Attach photos">+ Photos<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple disabled={busy || optimizing} onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void addPhotos(files); }} /></label>
          <label className={styles.room}>Room / batch<input aria-label="Room or photo batch" maxLength={60} value={room} placeholder="e.g. Garage" disabled={busy || optimizing} onChange={(e) => setRoom(e.target.value)} /></label>
          <button type="submit" aria-label="Send message" disabled={busy || optimizing || (!text.trim() && photos.length === sentPhotos.current)}>Send <span aria-hidden="true">↑</span></button></div>
      </form>
      <p role="status" className={styles.upload}>{uploadStatus || 'Up to 10 photos across rooms. No booking or final quote is created.'}</p>
      {!!failedPhotos.length && <button type="button" disabled={optimizing || busy} onClick={() => void addPhotos(failedPhotos)}>Retry photos</button>}
      <a className={styles.staffLink} href="/staff-estimator">Staff estimator &amp; location options</a>
    </footer>
  </main>;
}
