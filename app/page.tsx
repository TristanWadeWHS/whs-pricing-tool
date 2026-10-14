import Conversation from './conversation';
import { historyEnabled } from './lib/estimate-access';

export default function Home() { return <Conversation archiveEnabled={historyEnabled()} />; }
