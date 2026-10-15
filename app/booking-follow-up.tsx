'use client';
import { useState } from 'react';
import styles from './conversation.module.css';

export default function BookingFollowUp({ submissionId }: { submissionId?: string }) {
  const [open, setOpen] = useState(false);
  return <section className={styles.followUp} aria-label="Next steps">
    <div className={styles.bookingActions}>
      <button type="button" aria-expanded={open} aria-controls="booking-preview" onClick={() => setOpen(true)}>Book the Job</button>
      <a href="tel:+19494245605">Have Questions? Call Now</a>
    </div>
    {open && <div id="booking-preview" role="status">
      <h3>Booking preview only</h3>
      <p>No appointment request has been submitted and no time is reserved. Please call WHS to arrange service.</p>
      <p>{submissionId ? `Your inquiry reference is ${submissionId}. Your original estimate remains saved for staff review.` : 'Your estimate remains provisional; private inquiry saving is required before a future booking handoff.'}</p>
    </div>}
  </section>;
}
