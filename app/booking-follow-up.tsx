'use client';
import { useEffect, useRef, useState } from 'react';
import styles from './conversation.module.css';

type Slot={start:string;end:string;label:string;dateLabel?:string};
type Receipt={ok:true;pending:true;leadId:string;requestedTime:string};
const empty={name:'',street:'',city:'',state:'CA',zip:'',accessNotes:'',notes:''};
export default function BookingFollowUp({submissionId,token}:{submissionId?:string;token:string}) {
  const [open,setOpen]=useState(false),[details,setDetails]=useState(empty),[date,setDate]=useState('');
  const [slots,setSlots]=useState<Slot[]>([]),[slot,setSlot]=useState(''),[loading,setLoading]=useState(false),[loaded,setLoaded]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[receipt,setReceipt]=useState<Receipt|null>(null);
  const [attempted,setAttempted]=useState(false),[consent,setConsent]=useState(false);
  const requestId=useRef(''),lock=useRef(false),alive=useRef(true),loadSequence=useRef(0);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;loadSequence.current++;};},[]);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  async function loadTimes(nextDate:string) {
    const seq=++loadSequence.current;setDate(nextDate);setSlot('');setSlots([]);setLoaded(false);setError('');
    if(!nextDate){setLoading(false);return;}setLoading(true);
    try {const response=await fetch('/api/booking/availability',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,date:nextDate}),signal:AbortSignal.timeout(60000)});
      const data=await response.json();if(!response.ok||!Array.isArray(data.slots))throw new Error(data.error||data.message||'Available times could not be loaded. Please retry.');
      if(alive.current&&seq===loadSequence.current){setSlots(data.slots);setLoaded(true);}
    }catch(e){if(alive.current&&seq===loadSequence.current)setError(e instanceof Error?e.message:'Available times could not be loaded.');}
    finally{if(alive.current&&seq===loadSequence.current)setLoading(false);}
  }
  async function submit(event:React.FormEvent) {
    event.preventDefault();if(lock.current||!consent)return;
    const selected=slots.find(s=>s.start===slot);if(!selected){setError('Choose an available requested time.');return;}
    lock.current=true;setBusy(true);setError('');requestId.current||=crypto.randomUUID();setAttempted(true);
    try {const response=await fetch('/api/booking/request',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(120000),body:JSON.stringify({token,requestId:requestId.current,confirmed:true,details:{name:details.name,address:{street:details.street,city:details.city,state:details.state,zip:details.zip,accessNotes:details.accessNotes},notes:details.notes,requestedSlot:{start:selected.start,end:selected.end,label:selected.label}}})});
      const data=await response.json();if(!alive.current)return;
      if(!response.ok||data.ok!==true||data.pending!==true){if(data.unavailable||response.status===400){requestId.current='';setAttempted(false);if(data.unavailable){setSlot('');setSlots([]);setLoaded(false);}}throw new Error(data.error||'Your request could not be confirmed. Retry the same request.');}
      setReceipt(data);
    }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Your request could not be confirmed. Retry to check the same request.');}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  function field(key:keyof typeof empty,label:string,required=false,maxLength=240){return <label>{label}<input name={key} value={details[key]} required={required} maxLength={maxLength} autoComplete={key==='name'?'name':key==='street'?'street-address':key==='city'?'address-level2':key==='state'?'address-level1':key==='zip'?'postal-code':'off'} onChange={e=>setDetails({...details,[key]:e.target.value})} pattern={key==='zip'?'[0-9]{5}(-[0-9]{4})?':key==='state'?'[A-Z]{2}':undefined}/></label>;}
  return <section className={styles.followUp} aria-label="Next steps">
    <div className={styles.bookingActions}><button type="button" aria-expanded={open} aria-controls="booking-details" onClick={()=>setOpen(true)}>Book the Job</button><a href="tel:+19494245605">Have Questions? Call Now</a></div>
    {open&&<div id="booking-details">
      {receipt?<div role="status"><h3>Request received</h3><p>Thank you! Your request will be reviewed shortly. Your appointment is pending owner approval. Your time is not confirmed yet.</p><p>Request ID: {receipt.leadId}</p><p>Requested time: {receipt.requestedTime} (Pacific time)</p><p>Wade Home Services will contact you after reviewing your request.</p></div>:<form aria-label="Booking request" onSubmit={submit}>
        <h3>Request your appointment</h3><p>Your saved phone, email, selected services, photos, description, and estimate will accompany this request.</p>
        <fieldset disabled={busy||attempted} className={styles.bookingForm}>
          {field('name','Full name',true,100)}{field('street','Street address',true)}{field('city','City',true,120)}{field('state','State',true,2)}{field('zip','ZIP code',true,10)}
          {field('accessNotes','Unit, gate code or access notes (optional)',false,800)}
          <label>Special notes (optional)<textarea name="notes" maxLength={1000} value={details.notes} onChange={e=>setDetails({...details,notes:e.target.value})}/></label>
          <label>Requested date<input type="date" min={today} required value={date} onChange={e=>void loadTimes(e.target.value)}/></label>
          {date&&<button type="button" disabled={loading} onClick={()=>void loadTimes(date)}>Refresh available times</button>}
          {loading?<p role="status">Checking available times…</p>:loaded&&slots.length>0&&<label>Available time (Pacific)<select required value={slot} onChange={e=>setSlot(e.target.value)}><option value="">Select a time</option>{slots.map(s=><option key={s.start} value={s.start}>{s.label}</option>)}</select></label>}
          {loaded&&!loading&&slots.length===0&&<p role="status">No appointments are available on this date. Please choose another date.</p>}
          <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/> Submit my saved estimate, photos, and contact details to Wade Home Services for review. I understand this is a request pending approval.</label>
        </fieldset>
        {error&&<p role="alert">{error}</p>}
        {attempted&&!busy&&<p>Your details are kept for a safe retry. Retry to check this same request.</p>}
        <button type="submit" disabled={busy||loading||!slot||!consent||!submissionId}>{busy?'Submitting request…':attempted?'Retry request':'Submit request'}</button>
        <p>No time is reserved until the owner approves. Your estimate remains provisional.</p>
      </form>}
    </div>}
  </section>;
}
