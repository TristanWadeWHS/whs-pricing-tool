import styles from './conversation.module.css';
import { revealWords } from './lib/conversation-presentation';

// Reveal an already completed response, not live model streaming. Hidden words
// reserve their final layout so reveal never changes the response's scroll anchor.
export default function RevealedText({ text }: { text: string }) {
  return <><span className={styles.srOnly}>{text}</span><span aria-hidden="true" data-reveal="completed-response">
    {revealWords(text).map(({ word, delay }, i) => <span key={i} className={styles.revealWord} style={{ animationDelay: `${delay}ms` }}>{word}</span>)}
  </span></>;
}
