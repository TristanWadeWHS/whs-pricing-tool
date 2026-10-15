'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SERVICE_CHOICES, type Choice, type ConversationResult } from './lib/conversation-schema';
import { optimizePhotoSelection, PHOTO_INPUT_ACCEPT, photoFailureMessage } from './lib/photo-optimizer';
import styles from './conversation.module.css';
import BookingFollowUp from './booking-follow-up';
import RevealedText from './revealed-text';
import { ArchiveSession } from './lib/estimate-archive-client';
import { inquirySchema } from './lib/inquiry-schema';
import { customerAssumptions, customerEstimate, localComparison, ESTIMATE_INTRO, PHOTO_PENDING, SCOPE_PENDING, WINSTON_GREETING } from './lib/conversation-presentation';

type Photo = { file: File; original:File; archiveId:string; room: string; url: string; hash: string };
type Message = { role: 'user' | 'winston'; text: string; photos?: number; room?: string };
export default function Conversation({ owner = false, archiveEnabled = false }: { owner?: boolean; archiveEnabled?:boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState(''); const [services, setServices] = useState<string[]>([]);
  const [room, setRoom] = useState(''); const [photos, setPhotos] = useState<Photo[]>([]);
  const [result, setResult] = useState<ConversationResult | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [answers, setAnswers] = useState<Record<string, { text: string; notSure: boolean }>>({});
  const [replyTo, setReplyTo] = useState('');
  const [busy, setBusy] = useState(false); const [optimizing, setOptimizing] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(''); const [error, setError] = useState('');
  const [pendingCopy, setPendingCopy] = useState('Winston is getting ready to help. One moment.');
  const [failedPhotos, setFailedPhotos] = useState<File[]>([]);
  const token = useRef(''); const sentPhotos = useRef(0); const photoRef = useRef<Photo[]>([]);
  const generation = useRef(0); const locked = useRef(false); const photoLock = useRef(false);
  const controller = useRef<AbortController | null>(null); const retry = useRef<FormData | null>(null);
  const log = useRef<HTMLDivElement>(null); const composer = useRef<HTMLTextAreaElement>(null);
  const responseStart = useRef<HTMLElement>(null); const scrollSpace = useRef<HTMLDivElement>(null);
  const resultSection = useRef<HTMLElement>(null); const resultHeight = useRef(0);
  const scrolledDuringRequest = useRef(false);
  const archive = useRef<ArchiveSession | null>(null);
  const [allowanceReached,setAllowanceReached]=useState(false);
  const [contact,setContact]=useState({phone:'',email:''});
  const [contactSaved,setContactSaved]=useState(false);
  const [contactError,setContactError]=useState('');
  useLayoutEffect(() => {
    const container = log.current, space = scrollSpace.current;
    if (!container || !space) return;
    if (!messages.length) { space.style.height = '0px'; container.scrollTop = 0; return; }
    if (messages.at(-1)?.role !== 'winston' || scrolledDuringRequest.current || !responseStart.current) return;
    const top = container.scrollTop + responseStart.current.getBoundingClientRect().top - container.getBoundingClientRect().top - 16;
    // Enough trailing room to anchor even a short reply, without scrolling the page.
    space.style.height = `${Math.max(0, top + container.clientHeight - (container.scrollHeight - space.offsetHeight))}px`;
    container.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
  }, [messages]);
  useEffect(() => () => { generation.current++; controller.current?.abort(); photoRef.current.forEach((p) => URL.revokeObjectURL(p.url)); }, []);

  function preserveReadingPosition() { if (locked.current) scrolledDuringRequest.current = true; }

  function startOver() {
    generation.current++; controller.current?.abort(); locked.current = false; photoLock.current = false;
    photoRef.current.forEach((p) => URL.revokeObjectURL(p.url)); photoRef.current = [];
    token.current = ''; sentPhotos.current = 0; retry.current = null;
    archive.current=null; setAllowanceReached(false);
    setContact({phone:'',email:''});setContactSaved(false);setContactError('');
    setMessages([]); setText(''); setServices([]); setRoom(''); setPhotos([]); setResult(null);
    setChoices({}); setAnswers({}); setReplyTo(''); setBusy(false); setOptimizing(false); setUploadStatus(''); setFailedPhotos([]); setError('');
    scrolledDuringRequest.current = false;
    composer.current?.focus({ preventScroll: true });
  }
  async function addPhotos(files: File[]) {
    if(!contactSaved)return;
    if (!files.length || locked.current || photoLock.current) return;
    if (photoRef.current.length + files.length > 10) { setUploadStatus('This estimate supports ten photos total. Start a separate estimate for more photos.'); return; }
    photoLock.current = true; setOptimizing(true); setFailedPhotos([]); setUploadStatus(`Preparing ${files.length} photo${files.length === 1 ? '' : 's'}...`);
    const run = generation.current, batchRoom = room.trim() || 'General';
    try {
    const optimized = await optimizePhotoSelection(files, undefined, {
      count: photoRef.current.length,
      bytes: photoRef.current.reduce((total, photo) => total + photo.file.size, 0)
    });
    if (run !== generation.current) return;
    if (optimized.ok === false) { setFailedPhotos(files); setUploadStatus(owner ? photoFailureMessage(optimized) : optimized.error); }
    else {
      const added: Photo[] = []; const hashes = new Set(photoRef.current.map((p) => p.hash));
      for (const [index,photo] of optimized.photos.entries()) {
        const digest = await crypto.subtle.digest('SHA-256', await photo.file.arrayBuffer());
        const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
        if (run !== generation.current) { added.forEach((p) => URL.revokeObjectURL(p.url)); return; }
        if (!hashes.has(hash)) { hashes.add(hash); added.push({ file: photo.file, original:files[index], archiveId:crypto.randomUUID(), room: batchRoom, hash, url: URL.createObjectURL(photo.file) }); }
      }
      photoRef.current = [...photoRef.current, ...added]; setPhotos(photoRef.current);
      setUploadStatus(`${photoRef.current.length}/10 photos ready. ${added.length < files.length ? 'Exact duplicate photos were kept once.' : 'Photos stay in this conversation.'}`);
    }
    } catch { if (run === generation.current) { setFailedPhotos(files); setUploadStatus('These photos could not be prepared. Retry or choose another image.'); } }
    finally { if (run === generation.current) { photoLock.current = false; setOptimizing(false); } }
  }
  async function transmit(form: FormData) {
    if(!contactSaved)return;
    if (locked.current || photoLock.current) return;
    const submission = JSON.parse(String(form.get('submission')));
    setPendingCopy(submission.actions.length || submission.answers.length ? SCOPE_PENDING : form.getAll('photos').length ? PHOTO_PENDING : 'Winston is getting ready to help. One moment.');
    scrolledDuringRequest.current = false;
    resultHeight.current = resultSection.current?.offsetHeight ?? 0;
    locked.current = true; setBusy(true); setError(''); setAllowanceReached(false); retry.current = form;
    setResult((old) => old ? { ...old, baseline: null } : null);
    const run = generation.current; const abort = new AbortController(); controller.current = abort;
    let timeout = setTimeout(() => abort.abort(), archiveEnabled ? 5 * 60_000 : 60_000);
    try {
      if(archiveEnabled) {
        archive.current ??= new ArchiveSession();
        await archive.current.prepare(form,photoRef.current,abort.signal);
        if(run!==generation.current)return;
        clearTimeout(timeout);
        timeout=setTimeout(() => abort.abort(),60_000);
      }
      const response = await fetch('/api/conversation', { method: 'POST', body: form, signal: abort.signal });
      const data = await response.json() as ConversationResult;
      if (run !== generation.current) return;
      if(data.errorCategory==='daily_limit')setAllowanceReached(true);
      if (!response.ok || data.error || !data.token || !Array.isArray(data.items) || !Array.isArray(data.questions)) throw new Error(data.error || 'Unable to finish this turn. Your entries are retained.');
      if(archive.current && data.archiveRevision!==undefined)archive.current.revision=data.archiveRevision;
      token.current = data.token; sentPhotos.current = photoRef.current.length; retry.current = null;
      setResult(data); setChoices({}); setAnswers({}); setReplyTo(data.questions[0]?.id ?? '');
      setMessages((old) => [...old, { role: 'winston', text: !owner && data.baseline && !data.questions.length && !data.items.some((item) => item.choice === 'unresolved') ? ESTIMATE_INTRO : data.message }]);
    } catch (error) {
      if (run === generation.current) setError(error instanceof Error && error.name !== 'AbortError' ? error.message : 'The request timed out. Your conversation and photos are retained. Retry when ready.');
    } finally { clearTimeout(timeout); if (run === generation.current) { locked.current = false; setBusy(false); } }
  }
  function send(mode: 'message' | 'scope' | 'answers' | 'service' = 'message', service?: readonly [string, string]) {
    if (locked.current || photoLock.current) return;
    if (mode === 'service' && (!service || services.includes(service[0]))) return;
    const selectedServices = service ? [...services, service[0]] : services;
    if(!contactSaved) {
      if(service) {
        setServices(selectedServices);
        setMessages(old=>[...old,{role:'user',text:`I'd like help with ${service[1]}.`},
          {role:'winston',text:"Happy to help! First, what's your phone number and email? I'll save them with your inquiry, then we'll look at photos and scope. This isn't a booking."}]);
      }
      return;
    }
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
  async function captureContact(event:React.FormEvent) {
    event.preventDefault();if(locked.current)return;
    const parsed=inquirySchema.safeParse({...contact,services});
    if(!parsed.success){setContactError(parsed.error.issues[0]?.message??'Check your contact details.');return;}
    if(!archiveEnabled){setContactError('Private inquiry saving is unavailable in this Preview. Please call WHS.');return;}
    locked.current=true;setBusy(true);setContactError('');
    setPendingCopy('Saving your private inquiry. One moment.');
    const run=generation.current,abort=new AbortController();controller.current=abort;
    const timeout=setTimeout(()=>abort.abort(),30_000);
    try {
      archive.current??=new ArchiveSession();
      await archive.current.capture(parsed.data,abort.signal);
      if(run!==generation.current)return;
      setContactSaved(true);setContact({phone:'',email:''});
      setMessages(old=>[...old,{role:'winston',text:"Thanks! Your inquiry is saved. Add photos and tell me what needs to go. You can add another service too. No appointment has been booked."}]);
    }catch{if(run===generation.current)setContactError('Your inquiry could not be saved. Your entries are retained; please retry.');}
    finally{clearTimeout(timeout);if(run===generation.current){locked.current=false;setBusy(false);}}
  }
  const pending = result?.items.filter((item) => item.choice === 'unresolved') ?? [];
  const completed = !busy && !error && !pending.length && !result?.questions.length && !!result?.baseline;
  const load = result?.baseline;
  const comparison = completed && !owner ? localComparison(load ?? null) : null;
  const loadSummary = load?.range
    ? `Model-estimated ${load.range[0]}-${load.range[1]}% · ${Number((load.range[0] / 100 * 12).toFixed(4))}-${Number((load.range[1] / 100 * 12).toFixed(4))} cubic yards · ${load.range[0] / 100}-${load.range[1] / 100} trailer equivalents`
    : load ? `Model-estimated ${load.percent}% · ${load.cubicYards} cubic yards · ${load.equivalents} trailer equivalents` : '';
  function scopeEditor() {
    return <fieldset disabled={busy || optimizing} className={styles.scope}>
      {result?.items.map((item) => <div className={styles.scopeItem} key={item.id}>
        <label htmlFor={`scope-${item.id}`}>{item.choice === 'unresolved' ? `I see ${item.label}. Should we include it?` : item.label}<small>{owner ? `${item.room || 'General'} · ` : ''}Photo {item.photoRefs.join(', ')}</small></label>
        <select id={`scope-${item.id}`} value={choices[item.id] ?? item.choice} onChange={(e) => setChoices((old) => ({ ...old, [item.id]: e.target.value as Choice }))}>
          <option value="unresolved">Not sure yet</option><option value="included">Include</option><option value="excluded">Leave behind</option>
        </select>
      </div>)}
      <button type="button" disabled={!Object.keys(choices).length} onClick={() => send('scope')}>Confirm scope</button>
    </fieldset>;
  }
  return <main className={styles.shell}>
    <header className={styles.header}><a href="/" onClick={(e) => { e.preventDefault(); startOver(); }} aria-label="Wade Home Services - start over"><img className={styles.headerLogo} src="/wade-home-services-logo.png" width="96" height="96" alt="Wade Home Services" /></a><p className={styles.serviceLine}>Junk Removal | Light Demolition | Property Cleanouts</p><button type="button" onClick={startOver}>Start Over</button></header>
    <div className={styles.pilot}>Protected Preview · Provisional estimates, reviewed by your team</div>
    <div ref={log} className={styles.log} role="log" aria-label="Conversation with Winston" aria-live="polite" aria-relevant="additions" tabIndex={0}
      onWheel={preserveReadingPosition} onTouchMove={preserveReadingPosition}
      onPointerDown={(e) => { if (e.target === e.currentTarget) preserveReadingPosition(); }}
      onKeyDown={(e) => { if (e.target === e.currentTarget && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) preserveReadingPosition(); }}>
      <section className={styles.welcome}><img className={styles.introWinston} src="/winston-logo.png" width="240" height="240" alt="Winston, your removal guide" /><div className={styles.introBrand}><h1><img className={styles.welcomeLogo} src="/wade-home-services-logo.png" width="160" height="160" alt="Wade Home Services" /></h1><p className={styles.tagline}>You Call, We Haul!</p></div><p className={styles.introGreeting}><RevealedText text={WINSTON_GREETING} /></p></section>
      <div className={styles.services} aria-label="Services">{SERVICE_CHOICES.map(([value, label]) => <button type="button" key={value} aria-pressed={services.includes(value)} disabled={busy || optimizing || services.includes(value)} onClick={() => send('service', [value, label])}>{label}</button>)}</div>
      {messages.map((message, i) => <article key={i} ref={message.role === 'winston' && i === messages.length - 1 ? responseStart : undefined} data-speaker={message.role} className={message.role === 'user' ? styles.user : styles.winston}>
        <small>{message.role === 'user' ? 'You' : 'Winston'}</small><p>{message.role === 'winston' ? <RevealedText text={message.text} /> : message.text}</p>
        {!!message.photos && <small>{message.photos} photo{message.photos === 1 ? '' : 's'}{owner ? ` · ${message.room}` : ''}</small>}
      </article>)}
      {busy && <div aria-hidden="true" style={{ height: resultHeight.current }} />}
      {!busy && result && <section ref={resultSection} className={styles.result} aria-label="Current scope and estimate">
        {completed && result.baseline && <div className={styles.baseline}><small>{owner ? 'PROVISIONAL VOLUME BASELINE' : 'YOUR PROVISIONAL ESTIMATE'}</small><h2>{owner ? result.baseline.display : customerEstimate(result.baseline)}</h2>{owner && <p>{loadSummary}</p>}<p>Estimate subject to final confirmation. Not an approved quote.</p>{!owner && result.baseline.low !== result.baseline.high && <p>This is the midpoint of an estimated range, not a more certain price.</p>}
          {!owner && <ul>{result.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>}
        </div>}
        {comparison && <section className={styles.comparison} aria-labelledby="local-comparison-heading">
          <h2 id="local-comparison-heading">Local Competitor Pricing</h2>
          <p>Looking to price around? Don&apos;t worry—we already did the math for you!</p>
          <p className={styles.comparisonAmount}>{comparison.display}</p>
          <p className={styles.comparisonNote}>Indicative comparison using WHS&apos;s supplied $750-per-full-load benchmark for the same model-estimated volume. Actual competitor pricing varies. Not a guaranteed quote or a completed market survey.</p>
        </section>}
        {completed && <BookingFollowUp key={result.token} submissionId={archive.current?.id} token={result.token} />}
        {pending.length > 0 ? scopeEditor() : result.items.length > 0 && <details><summary>Confirmed scope · {result.items.filter((i) => i.choice === 'included').length} included groups</summary>{scopeEditor()}</details>}
        {result.questions.length > 0 && <form onSubmit={(e) => { e.preventDefault(); send('answers'); }}><fieldset disabled={busy || optimizing}>
          {result.questions.map((q) => <div className={styles.question} key={q.id}><label htmlFor={q.id}>{q.text}</label><small>Photo {q.photoRef}: {q.evidence}</small>
            <input id={q.id} maxLength={400} required={!answers[q.id]?.notSure} disabled={answers[q.id]?.notSure} value={answers[q.id]?.text ?? ''} onChange={(e) => setAnswers((old) => ({ ...old, [q.id]: { text: e.target.value, notSure: old[q.id]?.notSure ?? false } }))} />
            <label className={styles.unknown}><input type="checkbox" checked={answers[q.id]?.notSure ?? false} onChange={(e) => setAnswers((old) => ({ ...old, [q.id]: { text: old[q.id]?.text ?? '', notSure: e.target.checked } }))} />Not sure</label>
          </div>)}<button type="submit">Send answers</button></fieldset></form>}
        {!!result.reasons.length && (owner ? <details open={!result.baseline}><summary>Review status &amp; next steps</summary><ul>{result.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul></details> : !completed && <section aria-label="Next steps"><ul>{result.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul></section>)}
        {completed && owner && !!result.assumptions.length && <details><summary>Assumptions &amp; volume calculation</summary><ul>{result.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul><p>Loaded percentage / 100 × $550. A supported volume interval uses both endpoints. This is not a statistical prediction interval.</p></details>}
        {completed && !owner && !!customerAssumptions(result.assumptions).length && <details><summary>Assumptions</summary><ul>{customerAssumptions(result.assumptions).map((a, i) => <li key={i}>{a}</li>)}</ul></details>}
      </section>}
      {error && <div role="alert" className={styles.error}><p>{error}</p>{allowanceReached && <a href="tel:+19494245605">Contact Wade Home Services: 949-424-5605</a>}<button type="button" disabled={busy || optimizing} onClick={() => retry.current && void transmit(retry.current)}>Retry last message</button></div>}
      <div ref={scrollSpace} aria-hidden="true" />
    </div>
    <footer className={styles.composer}>
      <div className={styles.statusSlot} role="status" aria-live="polite" aria-atomic="true">
        {busy && <div className={styles.busy}><span className={styles.dots} aria-hidden="true"><i /><i /><i /></span><span>{pendingCopy}</span></div>}
      </div>
      {!contactSaved && (services.length ? <form onSubmit={captureContact} aria-label="Contact details">
        <fieldset disabled={busy} className={styles.contactCapture}>
          <legend>Where can our team reach you?</legend>
          <label htmlFor="inquiry-phone">Phone number</label><input id="inquiry-phone" type="tel" autoComplete="tel" maxLength={30} required value={contact.phone} onChange={e=>setContact(old=>({...old,phone:e.target.value}))} />
          <label htmlFor="inquiry-email">Email</label><input id="inquiry-email" type="email" autoComplete="email" maxLength={254} required value={contact.email} onChange={e=>setContact(old=>({...old,email:e.target.value}))} />
          <button type="submit">Save inquiry &amp; continue</button>
        </fieldset>
        <p className={styles.upload}>Saved privately with your selected services and estimate. No booking or notification is created.</p>
        {contactError && <p role="alert">{contactError}</p>}
      </form> : <p>Choose a service above to get started.</p>)}
      {contactSaved && <>
      {!!photos.length && <details><summary>{photos.length}/10 photos in this conversation</summary><div className={styles.photos}>{photos.map((p, i) => <figure key={p.hash}><img src={p.url} alt={`Photo ${i + 1}, ${p.room}`} width="68" height="68" /><figcaption>{i + 1} · {p.room}</figcaption></figure>)}</div></details>}
      {replyTo && <div className={styles.reply}><span>Replying to: {result?.questions.find((q) => q.id === replyTo)?.text}</span><button type="button" disabled={busy} onClick={() => setReplyTo('')}>New topic</button></div>}
      <form onSubmit={(e) => { e.preventDefault(); send(); }}><label className={styles.srOnly} htmlFor="message">Message Winston</label><textarea ref={composer} id="message" maxLength={replyTo ? 400 : 1000} disabled={busy} placeholder={replyTo ? 'Your answer, or "Not sure"...' : 'Tell Winston what needs to go...'} value={text} onChange={(e) => setText(e.target.value)} />
        <div className={styles.tools}><label className={styles.attach} title="Choose photos from your library">+ Photos<input type="file" aria-label="Choose photos from your library" accept={PHOTO_INPUT_ACCEPT} multiple disabled={busy || optimizing} onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void addPhotos(files); }} /></label>
          {owner && <label className={styles.room}>Room / batch<input aria-label="Room or photo batch" maxLength={60} value={room} placeholder="e.g. Garage" disabled={busy || optimizing} onChange={(e) => setRoom(e.target.value)} /></label>}
          <button type="submit" aria-label="Send message" disabled={busy || optimizing || (!text.trim() && photos.length === sentPhotos.current)}>Send <span aria-hidden="true">↑</span></button></div>
      </form>
      <p role="status" className={styles.upload}>{uploadStatus || 'Up to 10 photos across rooms. No booking or final quote is created.'}</p>
      {archiveEnabled && <p className={styles.upload}>Your submitted photos and details are saved privately to prepare estimates and improve WHS pricing. They are not used for model training. <a href="/estimate-privacy">Storage and retention</a></p>}
      {!!failedPhotos.length && <button type="button" disabled={optimizing || busy} onClick={() => void addPhotos(failedPhotos)}>Retry photos</button>}
      </>}
      {!contactSaved && <a className={styles.staffLink} href="/estimate-privacy">Privacy and retention</a>}
      {owner && <><a className={styles.staffLink} href="/staff-estimator">Staff estimator &amp; location options</a>{archiveEnabled && <> · <a className={styles.staffLink} href="/owner/history">Estimate history</a></>}</>}
    </footer>
  </main>;
}
